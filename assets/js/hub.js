// Página inicial: login + painel de ferramentas.
import { configurado } from './config.js';
import { entrar, sair, usuarioAtual, PERFIS, BASE } from './auth.js';
import { ferramentasDoPerfil } from './tools.js';
import { icone } from './icones.js';
import { $, esc } from './ui.js';

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
      : `<a class="ferramenta" href="${new URL(f.link, BASE).href}">${corpo}</a>`;
  }).join('');

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
  if (perfil) montarHub(perfil); else mostrar('login');
})();
