import './versao.js';
import { api } from './api.js';

// Rodapé com as versões, para conferir se a atualização chegou
const rodape = document.createElement('div');
rodape.className = 'versao-app';
rodape.textContent = `App ${self.VERSAO_APP}`;
document.body.appendChild(rodape);
api('versao')
  .then((r) => { rodape.textContent = `App ${self.VERSAO_APP} · Servidor ${r.versao}`; })
  .catch((e) => { if (e.codigo === 'ACAO_INVALIDA') rodape.textContent += ' · Servidor desatualizado'; });

// Nenhuma tabela rola para o lado: cada célula guarda o nome da sua coluna e,
// quando a tabela não cabe na largura, cada linha vira um cartão com esses rótulos.
const LARGURA_POR_COLUNA = 105;
const observadas = new WeakSet();
let ajusteMarcado = false;

function ajustarTabelas() {
  ajusteMarcado = false;
  document.querySelectorAll('.tabela-wrap').forEach((wrap) => {
    const t = wrap.querySelector('table.tabela');
    if (!t || !wrap.clientWidth) return;
    wrap.classList.remove('em-cartoes');
    const colunas = t.querySelectorAll('thead th').length;
    if (t.offsetWidth > wrap.clientWidth + 1 || wrap.clientWidth < colunas * LARGURA_POR_COLUNA) wrap.classList.add('em-cartoes');
  });
}
const marcarAjuste = () => {
  if (ajusteMarcado) return;
  ajusteMarcado = true;
  requestAnimationFrame(ajustarTabelas);
};
const observarLargura = new ResizeObserver(marcarAjuste);

function rotularTabelas() {
  document.querySelectorAll('table.tabela').forEach((t) => {
    const colunas = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody td').forEach((td) => {
      if (td.colSpan === 1 && td.dataset.label === undefined) td.dataset.label = colunas[td.cellIndex] || '';
    });
    const wrap = t.closest('.tabela-wrap');
    if (wrap && !observadas.has(wrap)) { observadas.add(wrap); observarLargura.observe(wrap); }
  });
  marcarAjuste();
}
new MutationObserver(rotularTabelas).observe(document.body, { childList: true, subtree: true });
rotularTabelas();

// Filtros fixos: abertos em tela larga, recolhidos em uma linha no celular
const telaLarga = matchMedia('(min-width: 761px)');
const ajustarFiltros = () => document.querySelectorAll('details.filtros-fixos').forEach((d) => { d.open = telaLarga.matches; });
telaLarga.addEventListener('change', ajustarFiltros);
ajustarFiltros();
document.addEventListener('submit', (ev) => {
  const d = ev.target.closest('details.filtros-fixos');
  if (d && !telaLarga.matches) d.open = false;
});

// O indicador de sincronização da ferramenta aparece na barra do sistema
if (window.parent !== window) {
  const avisarSync = () => {
    const s = document.getElementById('sync-status');
    if (!s) return;
    const p = document.getElementById('sync-pend');
    window.parent.postMessage({ tipo: 'sync', texto: s.textContent, off: s.classList.contains('off'), pend: p && !p.hidden ? p.textContent : '' }, location.origin);
  };
  const caixa = document.querySelector('.sync');
  if (caixa) new MutationObserver(avisarSync).observe(caixa, { subtree: true, childList: true, characterData: true, attributes: true });
  avisarSync();
}

// Registra o service worker (app instalável e funcionando com sinal fraco).
if ('serviceWorker' in navigator) {
  const url = new URL('../../sw.js', import.meta.url);
  // Versão nova publicada: quando ela assume, recarrega a página uma vez para
  // trocar os arquivos antigos que já estavam abertos.
  const tinhaVersao = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaVersao || recarregou) return;
    recarregou = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: new URL('../../', import.meta.url).pathname, updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch((e) => console.warn('Service worker não registrado:', e));
  });
}
