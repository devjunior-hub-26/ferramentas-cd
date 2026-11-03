// Comunicação com o servidor (Google Apps Script). Toda ação passa por aqui:
// o servidor confere o login e o perfil antes de ler ou gravar na planilha.
import { API_URL, modoTeste } from './config.js';

const CH_SESSAO = 'cd-sessao';

export class ErroApi extends Error {
  constructor(codigo, msg, detalhe) {
    super(msg);
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

export function tokenSalvo() {
  try { return JSON.parse(localStorage.getItem(CH_SESSAO))?.token || null; } catch { return null; }
}
export function salvarToken(token) {
  localStorage.setItem(CH_SESSAO, JSON.stringify({ token }));
}
export function apagarToken() {
  localStorage.removeItem(CH_SESSAO);
}

/**
 * Chama uma ação do servidor. Erros de rede viram ErroApi('REDE');
 * recusas do servidor trazem o código (ex.: 'SEM_EQUIPE', 'OUTRA_EQUIPE').
 * O Apps Script pode levar alguns segundos para "acordar", por isso o limite é folgado.
 */
export async function api(acao, dados = {}, { tempo = 25000 } = {}) {
  const corpo = { acao, dados, token: tokenSalvo() };
  let resp;
  if (modoTeste()) {
    const { chamar } = await import('./simulador.js');
    try { resp = await chamar(corpo); } catch (e) {
      if (e instanceof TypeError) throw new ErroApi('REDE', 'Sem conexão com o servidor.');
      throw e;
    }
  } else {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), tempo);
    let r;
    try {
      // text/plain evita a checagem extra de CORS que o Apps Script não responde
      r = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(corpo),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        signal: ctrl.signal,
      });
    } catch {
      throw new ErroApi('REDE', 'Sem conexão com o servidor.');
    } finally {
      clearTimeout(t);
    }
    try {
      resp = await r.json();
    } catch {
      throw new ErroApi('SERVIDOR', 'O servidor respondeu algo inesperado. Confira a implantação do Apps Script (veja o README).');
    }
  }
  if (!resp.ok) throw new ErroApi(resp.erro, resp.msg, resp.detalhe);
  return resp.dados;
}

// Faixa de aviso no modo de teste, em todas as páginas
if (modoTeste()) {
  const faixa = () => {
    if (document.getElementById('faixa-teste')) return;
    const el = document.createElement('div');
    el.id = 'faixa-teste';
    el.innerHTML = 'MODO DE TESTE · os dados ficam só neste navegador <button type="button">Apagar dados de teste</button>';
    el.querySelector('button').onclick = async () => {
      if (!confirm('Apagar todos os usuários, equipes e leituras do modo de teste?')) return;
      const { zerar } = await import('./simulador.js');
      zerar();
      apagarToken();
      localStorage.removeItem('cd-perfil');
      location.href = new URL('../../index.html', import.meta.url).href;
    };
    document.body.appendChild(el);
  };
  if (document.body) faixa(); else document.addEventListener('DOMContentLoaded', faixa);
}
