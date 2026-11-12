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
$('#btn-menu').innerHTML = icone('caminhao');
$('#btn-sair').addEventListener('click', sair);

// ---------- Menu retrátil ----------
try { $('#tela-app').classList.toggle('recolhido', localStorage.getItem(CHAVE_RECOLHIDO) === '1'); } catch { /* sem storage */ }

// Um só caminhãozinho: na barra (celular) abre; no menu recolhe ou expande
function alternarMenu() {
  const app = $('#tela-app');
  if (celular.matches) {
    app.classList.toggle('aberto');
    requestAnimationFrame(mostrarAtivoNoMenu);
    return;
  }
  const recolhido = app.classList.toggle('recolhido');
  try { localStorage.setItem(CHAVE_RECOLHIDO, recolhido ? '1' : '0'); } catch { /* sem storage */ }
}
$('#btn-menu').addEventListener('click', alternarMenu);
$('#logo-menu').addEventListener('click', alternarMenu);

// Rola a lista do menu até o item da tela aberta, se ele estiver fora de vista
function mostrarAtivoNoMenu() {
  const lista = $('#menu-itens');
  const b = document.querySelector('.menu-item.ativo');
  if (b && (b.offsetTop < lista.scrollTop || b.offsetTop + b.offsetHeight > lista.scrollTop + lista.clientHeight)) {
    lista.scrollTop = b.offsetTop - lista.clientHeight / 2 + b.offsetHeight / 2;
  }
}
$('#menu-fundo').addEventListener('click', () => $('#tela-app').classList.remove('aberto'));

function montarMenu(perfil) {
  $('#app-nome').textContent = perfil.nome;
  $('#app-perfil').textContent = PERFIS[perfil.perfil] || perfil.perfil;
  const grupos = menuDoPerfil(perfil.perfil);
  itens = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.grupo })));
  $('#menu-itens').innerHTML = grupos.map((g) => `<div class="menu-grupo">${esc(g.grupo)}</div>${g.itens.map((i) => (
    `<button class="menu-item" data-item="${esc(i.id)}" title="${esc(i.nome)}">${icone(i.icone)}<span>${esc(i.nome)}</span></button>`)).join('')}`).join('')
    + '<div class="menu-pilula" id="menu-pilula" aria-hidden="true"></div>';
}

// A seleção é uma peça de vidro que desliza até o item ativo
function moverPilula() {
  const ativo = document.querySelector('.menu-item.ativo');
  const p = $('#menu-pilula');
  if (!p) return;
  p.style.opacity = ativo ? 1 : 0;
  if (ativo) {
    p.style.height = `${ativo.offsetHeight}px`;
    p.style.transform = `translateY(${ativo.offsetTop}px)`;
  }
}
window.addEventListener('resize', moverPilula);
// Abrir ou recolher o menu muda a posição dos itens: o marcador acompanha
new MutationObserver(() => requestAnimationFrame(moverPilula)).observe($('#tela-app'), { attributes: true, attributeFilter: ['class'] });
$('.menu').addEventListener('transitionend', moverPilula);

// O conteúdo das ferramentas começa abaixo da barra translúcida
function passarAlturaBarra() {
  const barra = $('.barra');
  quadro?.contentDocument?.documentElement.style.setProperty('--barra', `${barra.offsetTop + barra.offsetHeight + 6}px`);
}
window.addEventListener('resize', passarAlturaBarra);

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
    quadro.addEventListener('load', passarAlturaBarra);
    $('#sync-barra').hidden = true;
    $('#area').appendChild(quadro);
  }
  quadro.title = item.nome;
  itemAtual = item;
  $('#t-grupo').textContent = item.grupo;
  $('#t-tela').textContent = item.nome;
  document.querySelectorAll('.menu-item[data-item]').forEach((b) => b.classList.toggle('ativo', b.dataset.item === item.id));
  moverPilula();
  $('#tela-app').classList.remove('aberto');
  requestAnimationFrame(mostrarAtivoNoMenu);
  sessionStorage.setItem(CHAVE_ABERTA, item.id);
  if (historico) history.pushState({ item: item.id }, '');
}

const itemInicial = () => itens.find((i) => i.id === sessionStorage.getItem(CHAVE_ABERTA)) || itens[0];

window.addEventListener('popstate', (ev) => {
  const item = itens.find((i) => i.id === ev.state?.item);
  if (item && item.id !== itemAtual?.id) abrirItem(item, { historico: false });
});

window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || ev.source !== quadro?.contentWindow) return;
  if (ev.data?.tipo === 'fechar-ferramenta') {
    if (!tokenSalvo()) { location.reload(); return; }
    sessionStorage.removeItem(CHAVE_ABERTA);
    abrirItem(itens[0], { historico: false });
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
