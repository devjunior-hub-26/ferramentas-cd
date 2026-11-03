// =========================================================
//  CONFIGURAÇÃO — endereço do servidor (Google Apps Script)
// =========================================================

// URL do "App da Web" do Apps Script (termina em /exec). Veja o README.
// Deixe 'TESTE' para experimentar o app sem servidor: tudo roda dentro do
// navegador e os dados ficam só neste computador.
export const API_URL = 'TESTE';

export const NOME_APP = 'Ferramentas do CD';

export const modoTeste = () => API_URL === 'TESTE';

export function configurado() {
  return modoTeste() || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(API_URL);
}
