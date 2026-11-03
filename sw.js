// Service worker: guarda os arquivos do app no celular para abrir com sinal
// fraco ou sem sinal. Os dados (servidor do Google) NUNCA são guardados aqui — as
// leituras offline ficam no IndexedDB da ferramenta.
//
// IMPORTANTE: sempre que publicar uma nova versão, aumente VERSAO para os
// celulares baixarem os arquivos novos.
const VERSAO = 'v2.4.0';
const CACHE = `ferramentas-cd-${VERSAO}`;

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/global.css',
  './assets/js/config.js',
  './assets/js/auth.js',
  './assets/js/api.js',
  './assets/js/simulador.js',
  './apps-script/Codigo.gs',
  './assets/js/ui.js',
  './assets/js/icones.js',
  './assets/js/tools.js',
  './assets/js/hub.js',
  './assets/js/pwa.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './tools/carregamento/',
  './tools/carregamento/index.html',
  './tools/carregamento/carregamento.css',
  './tools/carregamento/app.js',
  './tools/carregamento/fila.js',
  './tools/carregamento/painel.html',
  './tools/carregamento/painel.js',
  './tools/carregamento/importar967.js',
  './tools/admin/',
  './tools/admin/index.html',
  './tools/admin/admin.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Um por um: se algum falhar, os outros continuam sendo guardados.
    // cache: 'reload' busca no servidor, nunca a cópia antiga do cache do navegador.
    await Promise.all(ARQUIVOS.map((u) => cache.add(new Request(u, { cache: 'reload' }))
      .catch((e) => console.warn('SW: não guardou', u, e))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('ferramentas-cd-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return; // dados: sempre rede

  // Páginas: tenta a rede primeiro (versão mais nova), cai no cache sem sinal
  if (req.mode === 'navigate') {
    ev.respondWith((async () => {
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        const cache = await caches.open(CACHE);
        cache.put(req, resp.clone());
        return resp;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Arquivos (JS, CSS, ícones, bibliotecas): responde do cache e atualiza em segundo plano
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const emCache = await cache.match(req, { ignoreSearch: true });
    const daRede = fetch(req, { cache: 'no-cache' }).then((resp) => {
      if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    return emCache || (await daRede) || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
