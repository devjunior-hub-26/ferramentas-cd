// Login único compartilhado por todas as ferramentas.
// A sessão fica no localStorage do mesmo domínio, então quem entra no hub
// já está logado em qualquer ferramenta. Quem decide o que cada perfil pode
// fazer é o servidor (apps-script/Codigo.gs), não esta página.
import { configurado } from './config.js';
import { api, ErroApi, tokenSalvo, salvarToken, apagarToken } from './api.js';

export { api, ErroApi };

/** URL da raiz do site (funciona em usuario.github.io/repositorio/). */
export const BASE = new URL('../../', import.meta.url);
export const urlHub = () => new URL('index.html', BASE).href;

const CHAVE_PERFIL = 'cd-perfil';
const CHAVE_PENDENCIAS = 'cd-pendencias';

export const PERFIS = {
  admin: 'Administrador',
  lider: 'Líder',
  carregador: 'Carregador',
};

export function perfilEmCache() {
  try { return JSON.parse(localStorage.getItem(CHAVE_PERFIL)); } catch { return null; }
}

function salvarPerfil(p) {
  try { localStorage.setItem(CHAVE_PERFIL, JSON.stringify(p)); } catch { /* sem storage */ }
}

function esquecerLogin() {
  apagarToken();
  localStorage.removeItem(CHAVE_PERFIL);
}

/** O servidor recusou a sessão (vencida, senha trocada ou usuário desativado)? */
const sessaoRecusada = (e) => ['SESSAO_INVALIDA', 'USUARIO_INATIVO'].includes(e?.codigo);

/** Limita o tempo de espera de uma consulta; a tela não pode travar com sinal fraco. */
export function comLimite(consulta, ms = 15000) {
  return Promise.race([
    consulta,
    new Promise((_, rej) => setTimeout(() => rej(new ErroApi('REDE', 'Sem conexão com o servidor (tempo esgotado).')), ms)),
  ]);
}

export async function entrar(login, senha) {
  let r;
  try {
    r = await api('login', { login: String(login).trim().toLowerCase(), senha });
  } catch (e) {
    if (e.codigo === 'REDE') throw new Error('Sem conexão. O primeiro login precisa de internet.');
    throw e;
  }
  salvarToken(r.token);
  salvarPerfil(r.perfil);
  return r.perfil;
}

/** Leituras ainda não enviadas, por ferramenta (para avisar antes de sair). */
export function registrarPendencias(ferramenta, qtd) {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PENDENCIAS) || '{}');
    p[ferramenta] = qtd;
    localStorage.setItem(CHAVE_PENDENCIAS, JSON.stringify(p));
  } catch { /* ignora */ }
}

function totalPendencias() {
  try {
    return Object.values(JSON.parse(localStorage.getItem(CHAVE_PENDENCIAS) || '{}')).reduce((a, b) => a + (b || 0), 0);
  } catch { return 0; }
}

export async function sair() {
  const pend = totalPendencias();
  if (pend > 0 && !confirm(`Há ${pend} leitura(s) ainda não enviadas. Se sair agora, elas só serão enviadas quando você entrar de novo neste celular. Sair mesmo assim?`)) {
    return;
  }
  try { await comLimite(api('sair'), 5000); } catch { /* offline: limpa local mesmo assim */ }
  esquecerLogin();
  location.href = urlHub();
}

/** Confere a sessão no servidor e atualiza o perfil guardado. */
async function confirmarNoServidor() {
  const p = await api('eu', {}, { tempo: 15000 });
  salvarPerfil(p);
  return p;
}

/**
 * Usuário logado (ou null). Com perfil guardado, responde na hora (funciona
 * offline) e confere no servidor em segundo plano; se o servidor recusar,
 * `aoRecusar` é chamado.
 */
export async function usuarioAtual(aoRecusar) {
  if (!configurado() || !tokenSalvo()) return null;
  const cache = perfilEmCache();
  if (cache?.ativo) {
    confirmarNoServidor().catch((e) => {
      if (sessaoRecusada(e)) { esquecerLogin(); aoRecusar?.(); }
    });
    return cache;
  }
  try {
    const p = await confirmarNoServidor();
    return p.ativo ? p : null;
  } catch (e) {
    if (sessaoRecusada(e)) esquecerLogin();
    return null;
  }
}

/**
 * Protege uma página de ferramenta: sem login → volta ao hub;
 * perfil não autorizado → volta ao hub.
 */
export async function exigirLogin(perfisPermitidos) {
  const voltar = () => { location.href = urlHub(); };
  const perfil = await usuarioAtual(voltar);
  if (!perfil || (perfisPermitidos && !perfisPermitidos.includes(perfil.perfil))) {
    voltar();
    return new Promise(() => {}); // interrompe a página enquanto redireciona
  }
  return perfil;
}

/** Mensagem em português para mostrar ao usuário. */
export function mensagemErro(e) {
  if (!e) return 'Erro desconhecido.';
  if (e.codigo === 'REDE') return 'Sem conexão com o servidor.';
  return e.message || String(e);
}
