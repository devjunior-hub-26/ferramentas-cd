// Tela principal: login, menu lateral e área onde as ferramentas abrem.
import { configurado } from './config.js';
import { entrar, sair, usuarioAtual, PERFIS, BASE } from './auth.js';
import { tokenSalvo } from './api.js';
import { menuDoPerfil } from './tools.js';
import { icone } from './icones.js';
import { $, esc } from './ui.js';

// Redirecionamentos das ferramentas carregam esta página dentro do quadro:
// nesse caso, só avisa a página principal.
if (window.top !== window) {
  window.parent.postMessage({ tipo: 'fechar-ferramenta' }, location.origin);
  await new Promise(() => {});
}

// Endereço sempre limpo, sem index.html nem parâmetros
history.replaceState(history.state, '', BASE.pathname);

const CHAVE_ABERTA = 'cd-item-aberto';
const CHAVE_RECOLHIDO = 'cd-menu-recolhido';
const celular = matchMedia('(max-width: 900px)');
const telas = { login: $('#tela-login'), app: $('#tela-app'), config: $('#tela-config') };
const mostrar = (nome) => {
  Object.entries(telas).forEach(([k, el]) => (el.hidden = k !== nome));
  document.body.classList.toggle('no-app', nome === 'app');
};

let quadro = null;
let itens = [];
let itemAtual = null;

$('#logo').innerHTML = icone('caminhao');
$('#logo-menu').innerHTML = icone('caminhao');
$('#btn-sair').innerHTML = icone('sair');
$('#btn-menu').innerHTML = icone('menu');
$('#btn-sair').addEventListener('click', sair);

// ---------- Menu retrátil ----------
try { $('#tela-app').classList.toggle('recolhido', localStorage.getItem(CHAVE_RECOLHIDO) === '1'); } catch { /* sem storage */ }

$('#btn-menu').addEventListener('click', () => {
  const app = $('#tela-app');
  if (celular.matches) { app.classList.toggle('aberto'); return; }
  const recolhido = app.classList.toggle('recolhido');
  try { localStorage.setItem(CHAVE_RECOLHIDO, recolhido ? '1' : '0'); } catch { /* sem storage */ }
});
$('#menu-fundo').addEventListener('click', () => $('#tela-app').classList.remove('aberto'));

function montarMenu(perfil) {
  $('#app-nome').textContent = perfil.nome;
  $('#app-perfil').textContent = PERFIS[perfil.perfil] || perfil.perfil;
  const grupos = menuDoPerfil(perfil.perfil);
  itens = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.grupo })));
  $('#menu-itens').innerHTML = grupos.map((g) => `<div class="menu-grupo">${esc(g.grupo)}</div>${g.itens.map((i) => (i.emBreve
    ? `<div class="menu-item em-breve" title="${esc(i.nome)} (em breve)">${icone(i.icone)}<span>${esc(i.nome)}</span></div>`
    : `<button class="menu-item" data-item="${esc(i.id)}" title="${esc(i.nome)}">${icone(i.icone)}<span>${esc(i.nome)}</span></button>`)).join('')}`).join('');
}

$('#menu-itens').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-item]');
  if (b) abrirItem(itens.find((i) => i.id === b.dataset.item));
});

// ---------- Abrir uma tela ----------
// As ferramentas ficam em um quadro; o endereço do navegador não muda.
function abrirItem(item, { historico = true } = {}) {
  if (!item) return;
  const url = new URL(item.link, BASE);
  if (item.aba) url.hash = `aba=${item.aba}`;
  if (quadro && quadro.dataset.pagina === url.pathname) {
    quadro.contentWindow.location.replace(url.href);
  } else {
    quadro?.remove();
    quadro = document.createElement('iframe');
    quadro.id = 'quadro-ferramenta';
    quadro.dataset.pagina = url.pathname;
    quadro.allow = 'camera; clipboard-write; web-share';
    quadro.src = url.href;
    $('#sync-barra').hidden = true;
    $('#area').appendChild(quadro);
  }
  quadro.title = item.nome;
  itemAtual = item;
  $('#t-grupo').textContent = item.grupo;
  $('#t-tela').textContent = item.nome;
  document.querySelectorAll('.menu-item[data-item]').forEach((b) => b.classList.toggle('ativo', b.dataset.item === item.id));
  $('#tela-app').classList.remove('aberto');
  sessionStorage.setItem(CHAVE_ABERTA, item.id);
  if (historico) history.pushState({ item: item.id }, '');
}

const itemInicial = () => itens.find((i) => i.id === sessionStorage.getItem(CHAVE_ABERTA) && !i.emBreve) || itens.find((i) => !i.emBreve);

window.addEventListener('popstate', (ev) => {
  const item = itens.find((i) => i.id === ev.state?.item);
  if (item && item.id !== itemAtual?.id) abrirItem(item, { historico: false });
});

window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || ev.source !== quadro?.contentWindow) return;
  if (ev.data?.tipo === 'fechar-ferramenta') {
    if (!tokenSalvo()) { location.reload(); return; }
    sessionStorage.removeItem(CHAVE_ABERTA);
    abrirItem(itens.find((i) => !i.emBreve), { historico: false });
  } else if (ev.data?.tipo === 'sync') {
    $('#sync-barra').hidden = false;
    $('#sync-barra').classList.toggle('off', !!ev.data.off);
    $('#sync-texto').textContent = ev.data.texto;
    $('#sync-pend').hidden = !ev.data.pend;
    $('#sync-pend').textContent = ev.data.pend || '';
  }
});

function entrarNoSistema(perfil) {
  montarMenu(perfil);
  mostrar('app');
  const item = itemInicial();
  if (item) {
    abrirItem(item, { historico: false });
    history.replaceState({ item: item.id }, '');
  }
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
    entrarNoSistema(perfil);
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
  const perfil = await usuarioAtual(() => { quadro?.remove(); quadro = null; mostrar('login'); }).catch(() => null);
  if (perfil) entrarNoSistema(perfil); else mostrar('login');
})();
