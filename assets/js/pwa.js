// Registra o service worker (app instalável e funcionando com sinal fraco).
if ('serviceWorker' in navigator) {
  const url = new URL('../../sw.js', import.meta.url);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: new URL('../../', import.meta.url).pathname })
      .catch((e) => console.warn('Service worker não registrado:', e));
  });
}
