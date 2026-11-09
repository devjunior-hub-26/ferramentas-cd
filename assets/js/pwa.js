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
