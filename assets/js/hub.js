// Página inicial: login + painel de ferramentas.
import { configurado } from './config.js';
import { entrar, sair, usuarioAtual, PERFIS, BASE } from './auth.js';
import { tokenSalvo } from './api.js';
import { ferramentasDoPerfil } from './tools.js';
import { icone } from './icones.js';
import { $, esc } from './ui.js';

// O botão Voltar e os redirecionamentos das ferramentas carregam o hub dentro do
// quadro: nesse caso, só avisa a página principal para fechar a ferramenta.
if (window.top !== window) {
  window.parent.postMessage({ tipo: 'fechar-ferramenta' }, location.origin);
  await new Promise(() => {});
}

// Endereço sempre limpo, sem index.html nem parâmetros
history.replaceState(history.state, '', BASE.pathname);

const CHAVE_ABERTA = 'cd-ferramenta-aberta';
let quadro = null;

function fecharFerramenta() {
  quadro?.remove();
  quadro = null;
  document.body.classList.remove('com-ferramenta');
  sessionStorage.removeItem(CHAVE_ABERTA);
  if (!tokenSalvo()) location.reload(); // sessão encerrada: volta ao login
}

// A ferramenta abre em um quadro por cima do hub; o endereço não muda.
function abrirFerramenta(f) {
  quadro?.remove();
  quadro = document.createElement('iframe');
  quadro.id = 'quadro-ferramenta';
  quadro.title = f.nome;
  quadro.allow = 'camera; clipboard-write; web-share';
  quadro.src = new URL(f.link, BASE).href;
  document.body.appendChild(quadro);
  document.body.classList.add('com-ferramenta');
  sessionStorage.setItem(CHAVE_ABERTA, f.id);
  if (!history.state?.ferramenta) history.pushState({ ferramenta: f.id }, '');
}

window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || ev.source !== quadro?.contentWindow || ev.data?.tipo !== 'fechar-ferramenta') return;
  if (history.state?.ferramenta) history.replaceState(null, '');
  fecharFerramenta();
});
window.addEventListener('popstate', () => { if (quadro && !history.state?.ferramenta) fecharFerramenta(); });

const telas = { login: $('#tela-login'), hub: $('#tela-hub'), config: $('#tela-config') };
const mostrar = (nome) => Object.entries(telas).forEach(([k, el]) => (el.hidden = k !== nome));

$('#logo').innerHTML = icone('caminhao');
$('#btn-sair').innerHTML = icone('sair');
$('#btn-sair').addEventListener('click', sair);

function montarHub(perfil) {
  $('#hub-usuario').textContent = `${perfil.nome} · ${PERFIS[perfil.perfil] || perfil.perfil}`;
  $('#hub-ola').textContent = `Olá, ${perfil.nome.split(' ')[0]}!`;

  $('#lista-ferramentas').innerHTML = ferramentasDoPerfil(perfil.perfil).map((f) => {
    const corpo = `
      <div class="ico">${icone(f.icone)}</div>
      <div>
        <h2>${esc(f.nome)} ${f.emBreve ? '<span class="selo neutro">Em breve</span>' : ''}</h2>
        <p>${esc(f.descricao)}</p>
      </div>`;
    return f.emBreve
      ? `<div class="ferramenta em-breve" aria-disabled="true">${corpo}</div>`
      : `<a class="ferramenta" href="#" data-ferramenta="${esc(f.id)}">${corpo}</a>`;
  }).join('');
  $('#lista-ferramentas').onclick = (ev) => {
    const a = ev.target.closest('[data-ferramenta]');
    if (!a) return;
    ev.preventDefault();
    abrirFerramenta(ferramentasDoPerfil(perfil.perfil).find((f) => f.id === a.dataset.ferramenta));
  };

  const atualizarRede = () => ($('#offline-hub').hidden = navigator.onLine);
  window.addEventListener('online', atualizarRede);
  window.addEventListener('offline', atualizarRede);
  atualizarRede();
  mostrar('hub');
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('#btn-entrar');
  const msg = $('#msg-login');
  msg.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    const perfil = await entrar($('#login').value, $('#senha').value);
    $('#senha').value = '';
    montarHub(perfil);
  } catch (e) {
    msg.textContent = e.message;
    msg.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

(async () => {
  if (!configurado()) return mostrar('config');
  const perfil = await usuarioAtual(() => mostrar('login')).catch(() => null);
  if (!perfil) return mostrar('login');
  montarHub(perfil);
  // Recarregou a página com uma ferramenta aberta: continua nela
  const aberta = ferramentasDoPerfil(perfil.perfil).find((f) => f.id === sessionStorage.getItem(CHAVE_ABERTA) && !f.emBreve);
  if (aberta) abrirFerramenta(aberta);
})();
