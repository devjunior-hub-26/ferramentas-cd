/**
 * =====================================================================
 *  Ferramentas do CD — servidor (Google Apps Script + Google Planilhas)
 * =====================================================================
 *  Este código fica DENTRO da planilha (Extensões → Apps Script).
 *  A planilha só é acessível pela sua conta Google; o site conversa
 *  apenas com este script, que confere login, perfil e equipe em
 *  TODAS as ações. Nada do que vem do celular é aceito sem conferência.
 *
 *  Instalação (detalhes no README):
 *   1. Preencha LOGIN_INICIAL_ADMIN e SENHA_INICIAL_ADMIN abaixo.
 *   2. Selecione a função "instalar" no topo e clique em Executar.
 *   3. Volte os dois valores para TROQUE-... e salve (não deixe a senha aqui).
 *   4. Implantar → Nova implantação → App da Web
 *      (Executar como: Eu · Quem pode acessar: Qualquer pessoa).
 *   5. Copie a URL do app da Web para assets/js/config.js.
 * =====================================================================
 */

// Primeiro administrador, criado pela função instalar. Preencha só aqui no
// editor do Apps Script, NUNCA no arquivo que vai para o GitHub.
const LOGIN_INICIAL_ADMIN = 'TROQUE-ESTE-LOGIN';
const SENHA_INICIAL_ADMIN = 'TROQUE-ESTA-SENHA';

// Mostrada no rodapé do app. Aumente sempre que este arquivo mudar.
const VERSAO_SERVIDOR = 'v2.9.0';

const DIAS_SESSAO = 60;         // por quanto tempo o celular fica logado
const MAX_TENTATIVAS_LOGIN = 5;  // erros seguidos antes de bloquear por 5 minutos

const TABELAS = {
  Usuarios: ['id', 'login', 'nome', 'perfil', 'ativo', 'senha_hash', 'sal', 'criado_em'],
  Equipes: ['id', 'nome', 'lider_id', 'ativa', 'criado_em'],
  Membros: ['id', 'equipe_id', 'usuario_id', 'inicio', 'fim', 'alterado_por'],
  Leituras: ['id', 'carregamento', 'box', 'transacao', 'usuario_id', 'usuario_nome', 'equipe_id', 'equipe_nome',
    'lido_em', 'recebido_em', 'primeira_do_carregamento', 'aviso', 'cancelada', 'motivo_cancelamento',
    'corrigido_por', 'corrigido_em', 'lancamento_id'],
  // Lançamento = um caminhão: várias leituras, de vários carregamentos, salvas juntas
  Lancamentos: ['id', 'usuario_id', 'usuario_nome', 'equipe_id', 'equipe_nome', 'iniciado_em', 'salvo_em',
    'recebido_em', 'qtd_leituras', 'carregamentos'],
  Carregamentos967: ['numero', 'destino', 'rota', 'peso', 'data_ref', 'importado_em', 'importado_por'],
  Config: ['chave', 'valor'],
  Sessoes: ['token_hash', 'usuario_id', 'criado_em', 'expira_em'],
  // Quadro da Expedição: status = chamada atual de cada colaborador
  ExpColaboradores: ['chapa', 'nome', 'funcao', 'setor', 'nivel', 'admissao', 'ferias_mes', 'status'],
  ExpHistorico: ['data', 'ts', 'obs', 'foto'],
};

const PERFIS = ['admin', 'lider', 'carregador'];
const SIM = 'SIM';
const NAO = 'NAO';

// =====================================================================
// ENTRADA: o site manda POST com { acao, token, dados }
// =====================================================================

function doPost(e) {
  _tabelas = {};
  let resp;
  try {
    const req = JSON.parse(e.postData.contents);
    const acao = ACOES[req.acao];
    if (!acao) throw new ErroApp('ACAO_INVALIDA', 'Ação desconhecida.');
    const usuario = acao.publica ? null : autenticar(req.token, acao.perfis);
    resp = { ok: true, dados: acao.fn(req.dados || {}, usuario) };
  } catch (err) {
    if (err instanceof ErroApp) {
      resp = { ok: false, erro: err.codigo, msg: err.message, detalhe: err.detalhe || null };
    } else {
      console.error(err && err.stack || err);
      resp = { ok: false, erro: 'ERRO_INTERNO', msg: 'Erro no servidor: ' + (err && err.message || err) };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(resp)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Servidor das Ferramentas do CD funcionando.');
}

class ErroApp extends Error {
  constructor(codigo, msg, detalhe) {
    super(msg);
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

// perfis: null = qualquer usuário logado
const ACOES = {
  versao: { publica: true, fn: () => ({ versao: VERSAO_SERVIDOR }) },
  login: { publica: true, fn: acaoLogin },
  sair: { fn: acaoSair },
  eu: { fn: (d, u) => perfilPublico(u) },

  // Leitura de QR Code
  minhaEquipe: { fn: acaoMinhaEquipe },
  conferirLeitura: { perfis: ['lider', 'carregador'], fn: acaoConferirLeitura },
  registrarLancamento: { perfis: ['lider', 'carregador'], fn: acaoRegistrarLancamento },
  minhasLeituras: { fn: acaoMinhasLeituras },
  leiturasEquipe: { perfis: ['admin', 'lider'], fn: acaoLeiturasEquipe },
  corrigirLeitura: { perfis: ['admin', 'lider'], fn: acaoCorrigirLeitura },

  // Painel
  painelOpcoes: { perfis: ['admin', 'lider'], fn: acaoPainelOpcoes },
  painelDados: { perfis: ['admin', 'lider'], fn: acaoPainelDados },
  lerConfig: { fn: () => ({ permitir_multiplas_equipes: permitirMultiplas() }) },
  salvarConfig: { perfis: ['admin'], fn: acaoSalvarConfig },
  existentes967: { perfis: ['admin'], fn: acaoExistentes967 },
  importar967: { perfis: ['admin'], fn: acaoImportar967 },

  // Administração
  adminListar: { perfis: ['admin'], fn: acaoAdminListar },
  criarUsuario: { perfis: ['admin'], fn: acaoCriarUsuario },
  criarUsuariosEmLote: { perfis: ['admin'], fn: acaoCriarUsuariosEmLote },
  atualizarUsuario: { perfis: ['admin'], fn: acaoAtualizarUsuario },
  salvarEquipe: { perfis: ['admin'], fn: acaoSalvarEquipe },
  moverUsuario: { perfis: ['admin'], fn: acaoMoverUsuario },
  removerUsuario: { perfis: ['admin'], fn: acaoRemoverUsuario },
  desativarEquipe: { perfis: ['admin'], fn: acaoDesativarEquipe },
  reativarEquipe: { perfis: ['admin'], fn: acaoReativarEquipe },

  // Quadro da Expedição
  expedicaoDados: { perfis: ['admin'], fn: acaoExpedicaoDados },
  expedicaoImportar: { perfis: ['admin'], fn: acaoExpedicaoImportar },
  expedicaoSalvar: { perfis: ['admin'], fn: acaoExpedicaoSalvar },
  expedicaoSalvarColaborador: { perfis: ['admin'], fn: acaoExpedicaoSalvarColaborador },
  expedicaoExcluirColaborador: { perfis: ['admin'], fn: acaoExpedicaoExcluirColaborador },
  expedicaoSalvarDia: { perfis: ['admin'], fn: acaoExpedicaoSalvarDia },
  expedicaoLimparHistorico: { perfis: ['admin'], fn: acaoExpedicaoLimparHistorico },
};

// =====================================================================
// ACESSO ÀS PLANILHAS (todas as células como texto)
// =====================================================================

let _tabelas = {}; // leitura em memória durante uma requisição

function aba(nome) {
  const planilha = SpreadsheetApp.getActive();
  let sh = planilha.getSheetByName(nome);
  // Versão nova do código com aba nova: cria as abas que faltam sozinha
  if (!sh && planilha.getSheetByName('Usuarios')) {
    prepararPlanilha();
    sh = planilha.getSheetByName(nome);
  }
  if (!sh) throw new ErroApp('NAO_INSTALADO', 'A planilha ainda não foi preparada. Rode a função "instalar" no Apps Script.');
  return sh;
}

function texto(v) {
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function paraObjeto(nome, valores, linha) {
  const o = { _linha: linha };
  TABELAS[nome].forEach((c, j) => { o[c] = texto(valores[j]); });
  return o;
}

function paraLinha(nome, o) {
  return TABELAS[nome].map((c) => (o[c] === undefined || o[c] === null ? '' : String(o[c])));
}

/** Tabela inteira (use só nas tabelas pequenas). */
function ler(nome) {
  if (_tabelas[nome]) return _tabelas[nome];
  const sh = aba(nome);
  const n = sh.getLastRow() - 1;
  const vals = n > 0 ? sh.getRange(2, 1, n, TABELAS[nome].length).getValues() : [];
  _tabelas[nome] = vals.map((v, i) => paraObjeto(nome, v, i + 2));
  return _tabelas[nome];
}

function inserir(nome, objs) {
  if (!objs.length) return;
  const sh = aba(nome);
  const ncol = TABELAS[nome].length;
  const ini = sh.getLastRow() + 1;
  const ult = ini + objs.length - 1;
  if (ult > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), ult - sh.getMaxRows() + 500);
  sh.getRange(ini, 1, objs.length, ncol).setNumberFormat('@').setValues(objs.map((o) => paraLinha(nome, o)));
  objs.forEach((o, i) => { o._linha = ini + i; });
  delete _tabelas[nome];
}

function atualizar(nome, o) {
  aba(nome).getRange(o._linha, 1, 1, TABELAS[nome].length).setNumberFormat('@').setValues([paraLinha(nome, o)]);
  delete _tabelas[nome];
}

/** Regrava várias linhas já existentes (todas vindas de ler()) de uma vez. */
function regravar(nome, objs) {
  if (!objs.length) return;
  const sh = aba(nome);
  const min = Math.min.apply(null, objs.map((o) => o._linha));
  const max = Math.max.apply(null, objs.map((o) => o._linha));
  const bloco = ler(nome).filter((o) => o._linha >= min && o._linha <= max);
  const novos = {};
  objs.forEach((o) => { novos[o._linha] = o; });
  sh.getRange(min, 1, max - min + 1, TABELAS[nome].length).setNumberFormat('@')
    .setValues(bloco.map((o) => paraLinha(nome, novos[o._linha] || o)));
  delete _tabelas[nome];
}

/** Troca todas as linhas da tabela: grava primeiro e só depois limpa as que sobraram. */
function substituirTabela(nome, objs) {
  const sh = aba(nome);
  const ncol = TABELAS[nome].length;
  const antes = Math.max(0, sh.getLastRow() - 1);
  if (objs.length) {
    const ult = objs.length + 1;
    if (ult > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), ult - sh.getMaxRows() + 500);
    sh.getRange(2, 1, objs.length, ncol).setNumberFormat('@').setValues(objs.map((o) => paraLinha(nome, o)));
  }
  if (antes > objs.length) sh.getRange(objs.length + 2, 1, antes - objs.length, ncol).clearContent();
  delete _tabelas[nome];
}

/** Linhas em que `campo` é exatamente `valor` (busca rápida, sem ler a tabela toda). */
function buscar(nome, campo, valor) {
  const sh = aba(nome);
  const n = sh.getLastRow() - 1;
  if (n < 1 || valor === '' || valor === null || valor === undefined) return [];
  const col = TABELAS[nome].indexOf(campo) + 1;
  const achados = sh.getRange(2, col, n, 1).createTextFinder(String(valor)).matchEntireCell(true).findAll();
  if (!achados.length) return [];
  const linhas = achados.map((r) => r.getRow());
  const min = Math.min.apply(null, linhas);
  const max = Math.max.apply(null, linhas);
  const vals = sh.getRange(min, 1, max - min + 1, TABELAS[nome].length).getValues();
  const quero = {};
  linhas.forEach((l) => { quero[l] = true; });
  const out = [];
  vals.forEach((v, i) => { if (quero[min + i]) out.push(paraObjeto(nome, v, min + i)); });
  return out;
}

/**
 * Leituras com lido_em em [ini, fim). As linhas entram em ordem de chegada,
 * então lê de baixo para cima e para quando chega antes de (ini − 7 dias),
 * o atraso máximo aceito para leituras feitas offline.
 */
function leiturasEntre(ini, fim) {
  const sh = aba('Leituras');
  const ncol = TABELAS.Leituras.length;
  const colRecebido = TABELAS.Leituras.indexOf('recebido_em');
  const limite = new Date(new Date(ini).getTime() - 8 * 86400000).toISOString();
  const out = [];
  const BLOCO = 3000;
  let fimBloco = sh.getLastRow();
  while (fimBloco >= 2) {
    const iniBloco = Math.max(2, fimBloco - BLOCO + 1);
    const vals = sh.getRange(iniBloco, 1, fimBloco - iniBloco + 1, ncol).getValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      const o = paraObjeto('Leituras', vals[i], iniBloco + i);
      if (o.lido_em >= ini && o.lido_em < fim) out.push(o);
    }
    if (texto(vals[0][colRecebido]) < limite) break;
    fimBloco = iniBloco - 1;
  }
  return out.sort((a, b) => (a.lido_em < b.lido_em ? -1 : a.lido_em > b.lido_em ? 1 : 0));
}

/** Uma coluna inteira (rápido mesmo com muitas linhas). */
function coluna(nome, campo) {
  const sh = aba(nome);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, TABELAS[nome].indexOf(campo) + 1, n, 1).getValues().map((v) => texto(v[0]));
}

function comTrava(fn) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(25000)) throw new ErroApp('OCUPADO', 'Servidor ocupado. Tente de novo em alguns segundos.');
  try { return fn(); } finally { trava.releaseLock(); }
}

const agoraISO = () => new Date().toISOString();
const uuid = () => Utilities.getUuid();
const sim = (v) => v === SIM;

// =====================================================================
// LOGIN E SESSÕES
// =====================================================================

function sha256(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function hashSenha(senha, sal) {
  let h = sal + '|' + senha;
  for (let i = 0; i < 300; i++) h = sha256(h + '|' + sal);
  return h;
}

function perfilPublico(u) {
  return { id: u.id, login: u.login, nome: u.nome, perfil: u.perfil, ativo: sim(u.ativo) };
}

function acaoLogin(d) {
  const login = String(d.login || '').trim().toLowerCase();
  const senha = String(d.senha || '');
  const cache = CacheService.getScriptCache();
  const chave = 'falhas:' + login;
  const falhas = Number(cache.get(chave) || 0);
  if (falhas >= MAX_TENTATIVAS_LOGIN) {
    throw new ErroApp('MUITAS_TENTATIVAS', 'Muitas tentativas erradas. Aguarde 5 minutos e tente de novo.');
  }
  const u = ler('Usuarios').find((x) => x.login === login);
  if (!u || !senha || hashSenha(senha, u.sal) !== u.senha_hash) {
    cache.put(chave, String(falhas + 1), 300);
    throw new ErroApp('LOGIN_INVALIDO', 'Usuário ou senha incorretos.');
  }
  if (!sim(u.ativo)) throw new ErroApp('USUARIO_INATIVO', 'Usuário desativado. Procure o administrador.');
  cache.remove(chave);

  const token = uuid() + '-' + uuid();
  const agora = new Date();
  inserir('Sessoes', [{
    token_hash: sha256(token),
    usuario_id: u.id,
    criado_em: agora.toISOString(),
    expira_em: new Date(agora.getTime() + DIAS_SESSAO * 86400000).toISOString(),
  }]);
  return { token: token, perfil: perfilPublico(u) };
}

function autenticar(token, perfis) {
  if (!token) throw new ErroApp('SESSAO_INVALIDA', 'Sessão expirada. Entre novamente.');
  const th = sha256(String(token));
  const cache = CacheService.getScriptCache();
  let uid = cache.get('sessao:' + th);
  if (!uid) {
    const s = buscar('Sessoes', 'token_hash', th)[0];
    if (!s || s.expira_em < agoraISO()) throw new ErroApp('SESSAO_INVALIDA', 'Sessão expirada. Entre novamente.');
    uid = s.usuario_id;
    cache.put('sessao:' + th, uid, 21600);
  }
  const u = ler('Usuarios').find((x) => x.id === uid);
  if (!u || !sim(u.ativo)) {
    cache.remove('sessao:' + th);
    throw new ErroApp('USUARIO_INATIVO', 'Seu usuário foi desativado. Procure o administrador.');
  }
  if (perfis && perfis.indexOf(u.perfil) < 0) throw new ErroApp('ACESSO_NEGADO', 'Você não tem permissão para esta ação.');
  u._tokenHash = th;
  return u;
}

function acaoSair(d, u) {
  encerrarSessoes((s) => s.token_hash === u._tokenHash);
  return true;
}

/** Expira as sessões que passam no filtro (troca de senha, sair). */
function encerrarSessoes(filtro) {
  const agora = agoraISO();
  const cache = CacheService.getScriptCache();
  const alvo = ler('Sessoes').filter((s) => s.expira_em > agora && filtro(s));
  alvo.forEach((s) => { s.expira_em = agora; cache.remove('sessao:' + s.token_hash); });
  regravar('Sessoes', alvo);
}

// =====================================================================
// EQUIPES (regras usadas por várias ações)
// =====================================================================

function equipePorId(id) {
  return ler('Equipes').find((e) => e.id === id) || null;
}

function vinculoAtivo(usuarioId) {
  return ler('Membros').find((m) => m.usuario_id === usuarioId && !m.fim) || null;
}

/** Equipe em que o usuário estava no momento `quando` (pelo histórico). */
function equipeNoMomento(usuarioId, quando) {
  const meus = ler('Membros').filter((m) => m.usuario_id === usuarioId);
  const naHora = meus
    .filter((m) => m.inicio <= quando && (!m.fim || m.fim > quando))
    .sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0];
  // Tolerância a relógio do celular errado: usa a equipe atual
  const v = naHora || meus.find((m) => !m.fim);
  return v ? v.equipe_id : null;
}

/** Equipes que o usuário lidera (ativas ou não, como no histórico). */
function equipesLideradas(u) {
  return ler('Equipes').filter((e) => e.lider_id === u.id);
}

function podeVerEquipe(u, equipeId) {
  return u.perfil === 'admin' || equipesLideradas(u).some((e) => e.id === equipeId);
}

function permitirMultiplas() {
  const c = ler('Config').find((x) => x.chave === 'permitir_multiplas_equipes');
  return !!c && c.valor === 'true';
}

function nomeEquipeAtual(id, reserva) {
  const e = equipePorId(id);
  return e ? e.nome : reserva || '';
}

/** Primeira leitura (não cancelada) do carregamento feita por OUTRA equipe. */
function outraEquipeNoCarregamento(carregamento, equipeId, ignorarId) {
  return buscar('Leituras', 'carregamento', carregamento)
    .filter((l) => !sim(l.cancelada) && l.equipe_id !== equipeId && l.id !== ignorarId)
    .sort((a, b) => (a.lido_em < b.lido_em ? -1 : 1))[0] || null;
}

// =====================================================================
// LEITURAS
// =====================================================================

const RE_NUM20 = /^\d{1,20}$/;
const RE_NUM10 = /^\d{1,10}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leituraPublica(l) {
  const usuarios = ler('Usuarios');
  const us = usuarios.find((x) => x.id === l.usuario_id);
  return {
    id: l.id, carregamento: l.carregamento, box: l.box, transacao: l.transacao,
    usuario_id: l.usuario_id, usuario_nome: us ? us.nome : l.usuario_nome, usuario_login: us ? us.login : '',
    equipe_id: l.equipe_id, equipe_nome: nomeEquipeAtual(l.equipe_id, l.equipe_nome),
    lido_em: l.lido_em, primeira_do_carregamento: sim(l.primeira_do_carregamento), aviso: l.aviso || null,
    cancelada: sim(l.cancelada), motivo_cancelamento: l.motivo_cancelamento || null, corrigido_em: l.corrigido_em || null,
    lancamento_id: l.lancamento_id || null,
  };
}

function acaoMinhaEquipe(d, u) {
  const v = vinculoAtivo(u.id);
  const e = v && equipePorId(v.equipe_id);
  return {
    equipe: e && sim(e.ativa) ? { id: e.id, nome: e.nome } : null,
    lideradas: equipesLideradas(u).filter((x) => sim(x.ativa))
      .map((x) => ({ id: x.id, nome: x.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

function validarLeitura(d) {
  const l = {
    carregamento: String(d.carregamento || '').trim(),
    box: String(d.box || '').trim(),
    transacao: String(d.transacao || '').trim(),
  };
  if (!RE_NUM20.test(l.carregamento) || !RE_NUM10.test(l.box) || !RE_NUM20.test(l.transacao)) {
    throw new ErroApp('FORMATO_INVALIDO', 'Formato esperado: carregamento|box|transação (somente números).');
  }
  return l;
}

/** Hora informada pelo celular (vale para leituras feitas offline), com limites. */
function horaDoCelular(valor, agora) {
  let t = valor ? new Date(valor) : agora;
  if (isNaN(t.getTime()) || t.getTime() > agora.getTime() + 10 * 60000) t = agora;
  if (t.getTime() < agora.getTime() - 7 * 86400000) {
    throw new ErroApp('LEITURA_ANTIGA', 'Leituras com mais de 7 dias não podem ser enviadas.');
  }
  return t;
}

/** Destino do carregamento na 967 (para mostrar a cidade na hora da leitura). */
function destino967(carregamento) {
  const c = buscar('Carregamentos967', 'numero', carregamento)[0];
  return c ? c.destino || null : null;
}

/**
 * Confere uma leitura SEM gravar, para avisar na hora enquanto o lançamento
 * está aberto. A conferência que vale é a do registrarLancamento.
 */
function acaoConferirLeitura(d, u) {
  const l = validarLeitura(d);
  const equipeId = equipeNoMomento(u.id, agoraISO());
  if (!equipeId) throw new ErroApp('SEM_EQUIPE', 'Você não está em nenhuma equipe. Procure o administrador.');
  const doCarregamento = buscar('Leituras', 'carregamento', l.carregamento).filter((x) => !sim(x.cancelada));
  if (doCarregamento.some((x) => x.equipe_id === equipeId)) {
    throw new ErroApp('CARREGAMENTO_DUPLICADO', 'O carregamento ' + l.carregamento + ' já foi lançado anteriormente.');
  }
  const outra = doCarregamento.filter((x) => x.equipe_id !== equipeId)
    .sort((a, b) => (a.lido_em < b.lido_em ? -1 : 1))[0];
  let aviso = null;
  if (outra) {
    const nomeOutra = nomeEquipeAtual(outra.equipe_id, outra.equipe_nome);
    if (!permitirMultiplas()) throw new ErroApp('OUTRA_EQUIPE', 'Carregamento já iniciado pela ' + nomeOutra + '.', nomeOutra);
    aviso = 'OUTRA_EQUIPE:' + nomeOutra;
  }
  return {
    aviso: aviso,
    destino: destino967(l.carregamento),
  };
}

function lancamentoPublico(l) {
  const us = ler('Usuarios').find((x) => x.id === l.usuario_id);
  return {
    id: l.id, usuario_id: l.usuario_id, usuario_nome: us ? us.nome : l.usuario_nome,
    equipe_id: l.equipe_id, equipe_nome: nomeEquipeAtual(l.equipe_id, l.equipe_nome),
    iniciado_em: l.iniciado_em, salvo_em: l.salvo_em, qtd_leituras: Number(l.qtd_leituras || 0),
  };
}

/**
 * Salva um lançamento (um caminhão) com todas as leituras de uma vez.
 * Tudo ou nada: se alguma leitura for recusada, nada é gravado e a resposta
 * lista as recusadas, para o carregador tirar e salvar de novo.
 */
function acaoRegistrarLancamento(d, u) {
  const id = String(d.id || '').trim().toLowerCase();
  if (!RE_UUID.test(id)) throw new ErroApp('FORMATO_INVALIDO', 'Identificador do lançamento inválido.');
  const lista = (d.leituras || []).slice().sort((a, b) => (String(a.lido_em) < String(b.lido_em) ? -1 : 1));
  if (!lista.length) throw new ErroApp('DADOS_INVALIDOS', 'O lançamento não tem leituras.');
  if (lista.length > 3000) throw new ErroApp('DADOS_INVALIDOS', 'Lançamento grande demais (máximo 3.000 leituras).');
  const agora = new Date();

  return comTrava(() => {
    // Reenvio de um lançamento que já chegou (resposta perdida com sinal fraco)
    const ja = buscar('Lancamentos', 'id', id)[0];
    if (ja) return { lancamento: lancamentoPublico(ja), leituras: buscar('Leituras', 'lancamento_id', id).map(leituraPublica) };

    const inicio = horaDoCelular(lista[0].lido_em, agora);
    const equipeId = equipeNoMomento(u.id, inicio.toISOString());
    if (!equipeId) throw new ErroApp('SEM_EQUIPE', 'Você não está em nenhuma equipe. Procure o administrador.');
    const nomeEquipe = nomeEquipeAtual(equipeId);
    const multiplas = permitirMultiplas();

    // Uma leitura de colunas inteiras é bem mais rápida que uma busca por leitura
    const colCarregamento = coluna('Leituras', 'carregamento');
    const colEquipe = coluna('Leituras', 'equipe_id');
    const colNomeEquipe = coluna('Leituras', 'equipe_nome');
    const colLido = coluna('Leituras', 'lido_em');
    const colCancelada = coluna('Leituras', 'cancelada');
    const noLote = {};
    lista.forEach((x) => { noLote[String(x.carregamento || '').trim()] = true; });
    const carregamentos = {}; // número → { outra: nome da 1ª outra equipe, daEquipe: já tem leitura desta equipe }
    colCarregamento.forEach((c, i) => {
      if (colCancelada[i] === SIM || !noLote[c]) return;
      const info = carregamentos[c] || (carregamentos[c] = { outra: null, outraEm: '', daEquipe: false });
      if (colEquipe[i] === equipeId) info.daEquipe = true;
      else if (!info.outra || colLido[i] < info.outraEm) {
        info.outra = nomeEquipeAtual(colEquipe[i], colNomeEquipe[i]);
        info.outraEm = colLido[i];
      }
    });

    const erros = [];
    const leituras = [];
    const noLancamento = {};
    lista.forEach((x) => {
      const falha = (codigo, msg) => erros.push({ client_id: x.client_id, carregamento: x.carregamento, erro: codigo, msg: msg });
      let l;
      let lido;
      try {
        l = validarLeitura(x);
        lido = horaDoCelular(x.lido_em, agora);
      } catch (e) {
        return falha(e.codigo, e.message);
      }
      const cid = String(x.client_id || '').trim().toLowerCase();
      if (!RE_UUID.test(cid)) return falha('FORMATO_INVALIDO', 'Identificador da leitura inválido.');
      if (noLancamento[l.carregamento]) return falha('CARREGAMENTO_DUPLICADO', 'Carregamento lido duas vezes neste lançamento.');
      noLancamento[l.carregamento] = true;
      const info = carregamentos[l.carregamento] || (carregamentos[l.carregamento] = { outra: null, daEquipe: false });
      if (info.daEquipe) return falha('CARREGAMENTO_DUPLICADO', 'Já lançado anteriormente.');
      let aviso = '';
      if (info.outra) {
        if (!multiplas) return falha('OUTRA_EQUIPE', 'Carregamento ' + l.carregamento + ' já iniciado pela ' + info.outra + '.');
        aviso = 'OUTRA_EQUIPE:' + info.outra;
      }
      leituras.push({
        id: cid, carregamento: l.carregamento, box: l.box, transacao: l.transacao,
        usuario_id: u.id, usuario_nome: u.nome, equipe_id: equipeId, equipe_nome: nomeEquipe,
        lido_em: lido.toISOString(), recebido_em: agora.toISOString(),
        primeira_do_carregamento: SIM,
        aviso: aviso, cancelada: NAO, lancamento_id: id,
      });
    });
    if (erros.length) {
      throw new ErroApp('LANCAMENTO_RECUSADO', erros.length + ' leitura(s) recusada(s). Tire essas leituras e salve de novo.', erros);
    }

    let salvo = horaDoCelular(d.salvo_em, agora).toISOString();
    const ultima = leituras[leituras.length - 1].lido_em;
    if (salvo < ultima) salvo = ultima;
    const ordem = [];
    leituras.forEach((l) => { if (ordem.indexOf(l.carregamento) < 0) ordem.push(l.carregamento); });
    const lanc = {
      id: id, usuario_id: u.id, usuario_nome: u.nome, equipe_id: equipeId, equipe_nome: nomeEquipe,
      iniciado_em: leituras[0].lido_em, salvo_em: salvo, recebido_em: agora.toISOString(),
      qtd_leituras: String(leituras.length), carregamentos: ordem.join(', '),
    };
    inserir('Leituras', leituras);
    inserir('Lancamentos', [lanc]);
    return { lancamento: lancamentoPublico(lanc), leituras: leituras.map(leituraPublica) };
  });
}

function intervalo(d) {
  const ini = new Date(d.ini);
  const fim = new Date(d.fim);
  if (isNaN(ini.getTime()) || isNaN(fim.getTime()) || fim <= ini) throw new ErroApp('PERIODO_INVALIDO', 'Período inválido.');
  if (fim.getTime() - ini.getTime() > 400 * 86400000) throw new ErroApp('PERIODO_INVALIDO', 'Escolha um período de até 1 ano.');
  return [ini.toISOString(), fim.toISOString()];
}

/** Leituras da equipe atual da pessoa: o que um lança aparece para todos. */
function acaoMinhasLeituras(d, u) {
  const [ini, fim] = intervalo(d);
  const v = vinculoAtivo(u.id);
  return leiturasEntre(ini, fim).filter((l) => (v ? l.equipe_id === v.equipe_id : l.usuario_id === u.id))
    .reverse().map(leituraPublica);
}

function acaoLeiturasEquipe(d, u) {
  if (!podeVerEquipe(u, d.equipe_id)) throw new ErroApp('ACESSO_NEGADO', 'Você não tem permissão para ver esta equipe.');
  const [ini, fim] = intervalo(d);
  return leiturasEntre(ini, fim).filter((l) => l.equipe_id === d.equipe_id).reverse().map(leituraPublica);
}

/** Líder corrige carregamento/box ou cancela (com motivo). Nada é apagado. */
function acaoCorrigirLeitura(d, u) {
  return comTrava(() => {
    const l = buscar('Leituras', 'id', String(d.id || ''))[0];
    if (!l) throw new ErroApp('NAO_ENCONTRADO', 'Leitura não encontrada.');
    if (!podeVerEquipe(u, l.equipe_id)) throw new ErroApp('ACESSO_NEGADO', 'Só o líder da equipe pode alterar esta leitura.');
    if (sim(l.cancelada)) throw new ErroApp('JA_CANCELADA', 'Esta leitura já foi cancelada.');

    if (d.cancelar) {
      const motivo = String(d.motivo || '').trim();
      if (!motivo) throw new ErroApp('MOTIVO_OBRIGATORIO', 'Informe o motivo do cancelamento.');
      l.cancelada = SIM;
      l.motivo_cancelamento = motivo.slice(0, 300);
    } else {
      const carregamento = String(d.carregamento || '').trim();
      const box = String(d.box || '').trim();
      if (!RE_NUM20.test(carregamento) || !RE_NUM10.test(box)) throw new ErroApp('FORMATO_INVALIDO', 'Carregamento e box devem ter só números.');
      if (carregamento !== l.carregamento && buscar('Leituras', 'carregamento', carregamento)
        .some((x) => !sim(x.cancelada) && x.equipe_id === l.equipe_id)) {
        throw new ErroApp('CARREGAMENTO_DUPLICADO', 'O carregamento ' + carregamento + ' já foi lançado anteriormente.');
      }
      if (carregamento !== l.carregamento && !permitirMultiplas()) {
        const outra = outraEquipeNoCarregamento(carregamento, l.equipe_id, l.id);
        if (outra) {
          const nome = nomeEquipeAtual(outra.equipe_id, outra.equipe_nome);
          throw new ErroApp('OUTRA_EQUIPE', 'Carregamento já iniciado pela ' + nome + '.', nome);
        }
      }
      l.carregamento = carregamento;
      l.box = box;
    }
    l.corrigido_por = u.id;
    l.corrigido_em = agoraISO();
    atualizar('Leituras', l);
    return leituraPublica(l);
  });
}

// =====================================================================
// PAINEL
// =====================================================================

function acaoPainelOpcoes(d, u) {
  const admin = u.perfil === 'admin';
  const equipes = (admin ? ler('Equipes') : equipesLideradas(u))
    .map((e) => ({ id: e.id, nome: e.nome, ativa: sim(e.ativa) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let usuarios = ler('Usuarios');
  if (!admin) {
    const minhas = {};
    equipes.forEach((e) => { minhas[e.id] = true; });
    const ids = {};
    ler('Membros').forEach((m) => { if (minhas[m.equipe_id]) ids[m.usuario_id] = true; });
    usuarios = usuarios.filter((x) => ids[x.id]);
  }
  return {
    equipes: equipes,
    usuarios: usuarios.filter((x) => x.perfil !== 'admin').map((x) => ({ id: x.id, nome: x.nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

function registro967(c) {
  return { numero: c.numero, destino: c.destino, rota: c.rota, peso: c.peso === '' ? null : Number(c.peso), data_ref: c.data_ref || null };
}

function acaoPainelDados(d, u) {
  const admin = u.perfil === 'admin';
  const [ini, fim] = intervalo(d);
  const minhas = {};
  if (!admin) equipesLideradas(u).forEach((e) => { minhas[e.id] = true; });

  // Quem estava em cada equipe: a produção da equipe conta para todos eles
  const pessoas = {};
  ler('Usuarios').forEach((x) => { pessoas[x.id] = x; });
  const membros = ler('Membros').filter((m) => (admin || minhas[m.equipe_id])
    && pessoas[m.usuario_id] && pessoas[m.usuario_id].perfil !== 'admin');
  const contaPara = (usuarioId, l) => l.usuario_id === usuarioId || membros.some((m) => m.usuario_id === usuarioId
    && m.equipe_id === l.equipe_id && m.inicio <= l.lido_em && (!m.fim || m.fim > l.lido_em));

  const leituras = leiturasEntre(ini, fim).filter((l) => !sim(l.cancelada)
    && (admin || minhas[l.equipe_id])
    && (!d.equipe || l.equipe_id === d.equipe)
    && (!d.usuario || contaPara(d.usuario, l))
    && (!d.carregamento || l.carregamento === d.carregamento)).map(leituraPublica);

  const lidos = {};
  leituras.forEach((l) => { lidos[l.carregamento] = true; });
  const todos967 = ler('Carregamentos967');
  const c967 = todos967.filter((c) => lidos[c.numero]).map(registro967);

  // Carregamentos da 967 que ninguém lançou (só Admin, sem filtro de equipe/usuário)
  let naoLancados = null;
  if (admin && !d.equipe && !d.usuario) {
    const comLeitura = {};
    const carregs = coluna('Leituras', 'carregamento');
    const canc = coluna('Leituras', 'cancelada');
    carregs.forEach((c, i) => { if (canc[i] !== SIM) comLeitura[c] = true; });
    naoLancados = todos967.filter((c) => c.data_ref >= d.dataIni && c.data_ref <= d.dataFim
      && !comLeitura[c.numero] && (!d.carregamento || c.numero === d.carregamento))
      .map(registro967).sort((a, b) => (a.numero < b.numero ? -1 : 1));
  }
  // Lançamentos do período (sem filtro de usuário/carregamento: o tempo entre
  // um lançamento e outro da equipe precisa da sequência completa)
  const lancamentos = ler('Lancamentos').filter((l) => l.salvo_em >= ini && l.salvo_em < fim
    && (admin || minhas[l.equipe_id]) && (!d.equipe || l.equipe_id === d.equipe)).map(lancamentoPublico);

  return {
    leituras: leituras, c967: c967, naoLancados: naoLancados, lancamentos: lancamentos,
    membros: membros.map((m) => ({
      usuario_id: m.usuario_id, usuario_nome: pessoas[m.usuario_id].nome, usuario_login: pessoas[m.usuario_id].login,
      equipe_id: m.equipe_id, inicio: m.inicio, fim: m.fim || null,
    })),
    admins: Object.keys(pessoas).filter((id) => pessoas[id].perfil === 'admin'),
  };
}

function acaoSalvarConfig(d) {
  return comTrava(() => {
    const valor = d.permitir_multiplas_equipes ? 'true' : 'false';
    const c = ler('Config').find((x) => x.chave === 'permitir_multiplas_equipes');
    if (c) { c.valor = valor; atualizar('Config', c); } else inserir('Config', [{ chave: 'permitir_multiplas_equipes', valor: valor }]);
    return true;
  });
}

function acaoExistentes967(d) {
  const quero = {};
  (d.numeros || []).forEach((n) => { quero[String(n)] = true; });
  return coluna('Carregamentos967', 'numero').filter((n) => quero[n]);
}

/** Atualiza pelo número do carregamento, sem duplicar. Só grava os campos enviados. */
function acaoImportar967(d, u) {
  const regs = d.registros || [];
  if (!regs.length) return { novos: 0, atualizados: 0 };
  if (regs.length > 20000) throw new ErroApp('MUITOS_REGISTROS', 'Importe no máximo 20.000 carregamentos por vez.');
  return comTrava(() => {
    const porNumero = {};
    ler('Carregamentos967').forEach((c) => { porNumero[c.numero] = c; });
    const agora = agoraISO();
    const novos = [];
    const alterados = [];
    regs.forEach((r) => {
      const numero = String(r.numero || '').trim();
      if (!RE_NUM20.test(numero)) return;
      const c = porNumero[numero] || { numero: numero };
      ['destino', 'rota', 'data_ref'].forEach((k) => { if (k in r) c[k] = r[k] === null ? '' : String(r[k]).slice(0, 200); });
      if ('peso' in r) c.peso = r.peso === null || isNaN(Number(r.peso)) ? '' : String(Number(r.peso));
      c.importado_em = agora;
      c.importado_por = u.id;
      if (c._linha) alterados.push(c); else if (!porNumero[numero]) { porNumero[numero] = c; novos.push(c); }
    });
    regravar('Carregamentos967', alterados);
    inserir('Carregamentos967', novos);
    return { novos: novos.length, atualizados: alterados.length };
  });
}

// =====================================================================
// ADMINISTRAÇÃO
// =====================================================================

const RE_LOGIN = /^[a-z0-9._-]{3,40}$/;

function acaoAdminListar() {
  return {
    usuarios: ler('Usuarios').map(perfilPublico).sort((a, b) => a.nome.localeCompare(b.nome)),
    equipes: ler('Equipes').map((e) => ({ id: e.id, nome: e.nome, lider_id: e.lider_id || null, ativa: sim(e.ativa) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    membros: ler('Membros').map((m) => ({
      id: m.id, equipe_id: m.equipe_id, usuario_id: m.usuario_id, inicio: m.inicio, fim: m.fim || null, alterado_por: m.alterado_por || null,
    })).sort((a, b) => (a.inicio < b.inicio ? 1 : -1)),
  };
}

function validarNomePerfil(nome, perfil) {
  if (!String(nome || '').trim()) throw new ErroApp('DADOS_INVALIDOS', 'Informe o nome.');
  if (PERFIS.indexOf(perfil) < 0) throw new ErroApp('DADOS_INVALIDOS', 'Perfil inválido.');
}

function validarSenha(senha) {
  if (String(senha || '').length < 6) throw new ErroApp('DADOS_INVALIDOS', 'A senha precisa ter pelo menos 6 caracteres.');
}

/** Valida os dados e monta a linha de um usuário novo (ainda não gravada). */
function novoUsuario(d, prefixoErro) {
  const p = prefixoErro || '';
  const login = String(d.login || '').trim().toLowerCase();
  if (!RE_LOGIN.test(login)) throw new ErroApp('DADOS_INVALIDOS', p + 'Usuário inválido: use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.');
  try {
    validarNomePerfil(d.nome, d.perfil);
    validarSenha(d.senha);
  } catch (e) {
    e.message = p + e.message;
    throw e;
  }
  const sal = uuid();
  return {
    id: uuid(), login: login, nome: String(d.nome).trim().slice(0, 100), perfil: d.perfil, ativo: SIM,
    senha_hash: hashSenha(String(d.senha), sal), sal: sal, criado_em: agoraISO(),
  };
}

function acaoCriarUsuario(d) {
  const u = novoUsuario(d);
  return comTrava(() => {
    if (ler('Usuarios').some((x) => x.login === u.login)) throw new ErroApp('DUPLICADO', 'Já existe um usuário com esse login.');
    inserir('Usuarios', [u]);
    return perfilPublico(u);
  });
}

/** Cadastro de vários colaboradores de uma vez. Logins que já existem são pulados. */
function acaoCriarUsuariosEmLote(d) {
  const lista = d.usuarios || [];
  if (!lista.length) throw new ErroApp('DADOS_INVALIDOS', 'Nenhum colaborador informado.');
  if (lista.length > 200) throw new ErroApp('DADOS_INVALIDOS', 'Cadastre no máximo 200 colaboradores por vez.');
  return comTrava(() => {
    const existentes = {};
    ler('Usuarios').forEach((u) => { existentes[u.login] = true; });
    const novos = [];
    const jaExistiam = [];
    lista.forEach((x, i) => {
      const login = String(x.login || '').trim().toLowerCase();
      if (existentes[login]) { jaExistiam.push(login); return; }
      const u = novoUsuario(x, 'Linha ' + (i + 1) + ': ');
      existentes[u.login] = true;
      novos.push(u);
    });
    inserir('Usuarios', novos);
    return { criados: novos.map((u) => u.login), jaExistiam: jaExistiam };
  });
}

function acaoAtualizarUsuario(d, admin) {
  return comTrava(() => {
    const u = ler('Usuarios').find((x) => x.id === d.id);
    if (!u) throw new ErroApp('NAO_ENCONTRADO', 'Usuário não encontrado.');
    if (u.id === admin.id && (d.ativo === false || (d.perfil && d.perfil !== 'admin'))) {
      throw new ErroApp('DADOS_INVALIDOS', 'Você não pode desativar nem tirar o perfil de administrador de si mesmo.');
    }
    if (d.nome !== undefined) { validarNomePerfil(d.nome, d.perfil || u.perfil); u.nome = String(d.nome).trim().slice(0, 100); }
    if (d.perfil !== undefined) { validarNomePerfil(u.nome, d.perfil); u.perfil = d.perfil; }
    if (d.ativo !== undefined) u.ativo = d.ativo ? SIM : NAO;
    let trocouSenha = false;
    if (d.senha) {
      validarSenha(d.senha);
      u.sal = uuid();
      u.senha_hash = hashSenha(String(d.senha), u.sal);
      trocouSenha = true;
    }
    atualizar('Usuarios', u);
    if (u.perfil === 'admin') tirarAdminDasEquipes(u, admin);
    // Senha nova ou usuário desativado: desconecta os celulares dessa pessoa
    if (trocouSenha || !sim(u.ativo)) encerrarSessoes((s) => s.usuario_id === u.id && s.token_hash !== admin._tokenHash);
    return perfilPublico(u);
  });
}

/** O administrador é o gestor: não participa nem lidera equipes. */
function tirarAdminDasEquipes(u, admin) {
  const v = vinculoAtivo(u.id);
  if (v) { v.fim = agoraISO(); v.alterado_por = admin.id; atualizar('Membros', v); }
  equipesLideradas(u).forEach((e) => { e.lider_id = ''; atualizar('Equipes', e); });
}

function acaoSalvarEquipe(d, admin) {
  const nome = String(d.nome || '').trim().slice(0, 60);
  if (!nome) throw new ErroApp('DADOS_INVALIDOS', 'Informe o nome da equipe.');
  const liderId = d.lider_id || '';
  return comTrava(() => {
    if (liderId) {
      const l = ler('Usuarios').find((x) => x.id === liderId);
      if (!l || !sim(l.ativo) || l.perfil !== 'lider') throw new ErroApp('DADOS_INVALIDOS', 'O líder precisa ser um usuário ativo com perfil Líder.');
    }
    const equipes = ler('Equipes');
    if (equipes.some((e) => e.nome.toLowerCase() === nome.toLowerCase() && e.id !== d.id)) {
      throw new ErroApp('DUPLICADO', 'Já existe uma equipe com esse nome.');
    }
    let e;
    if (d.id) {
      e = equipes.find((x) => x.id === d.id);
      if (!e) throw new ErroApp('NAO_ENCONTRADO', 'Equipe não encontrada.');
      e.nome = nome;
      e.lider_id = liderId;
      atualizar('Equipes', e);
    } else {
      e = { id: uuid(), nome: nome, lider_id: liderId, ativa: SIM, criado_em: agoraISO() };
      inserir('Equipes', [e]);
    }
    return { id: e.id };
  });
}

/** Coloca o usuário na equipe, encerrando o vínculo anterior (fica no histórico). */
function acaoMoverUsuario(d, admin) {
  return comTrava(() => {
    const u = ler('Usuarios').find((x) => x.id === d.usuario_id);
    if (!u) throw new ErroApp('NAO_ENCONTRADO', 'Usuário não encontrado.');
    if (u.perfil === 'admin') throw new ErroApp('DADOS_INVALIDOS', 'O administrador não faz parte de equipes.');
    const e = equipePorId(d.equipe_id);
    if (!e || !sim(e.ativa)) throw new ErroApp('EQUIPE_INATIVA', 'Equipe inexistente ou desativada.');
    const v = vinculoAtivo(u.id);
    if (v && v.equipe_id === e.id) return true;
    const agora = agoraISO();
    if (v) { v.fim = agora; v.alterado_por = admin.id; atualizar('Membros', v); }
    inserir('Membros', [{ id: uuid(), equipe_id: e.id, usuario_id: u.id, inicio: agora, fim: '', alterado_por: admin.id }]);
    return true;
  });
}

function encerrarVinculos(filtro, adminId) {
  const agora = agoraISO();
  const alvo = ler('Membros').filter((m) => !m.fim && filtro(m));
  alvo.forEach((m) => { m.fim = agora; m.alterado_por = adminId; });
  regravar('Membros', alvo);
}

function acaoRemoverUsuario(d, admin) {
  return comTrava(() => { encerrarVinculos((m) => m.usuario_id === d.usuario_id, admin.id); return true; });
}

function acaoDesativarEquipe(d, admin) {
  return comTrava(() => {
    const e = equipePorId(d.equipe_id);
    if (!e) throw new ErroApp('NAO_ENCONTRADO', 'Equipe não encontrada.');
    encerrarVinculos((m) => m.equipe_id === e.id, admin.id);
    e.ativa = NAO;
    atualizar('Equipes', equipePorId(e.id));
    return true;
  });
}

function acaoReativarEquipe(d) {
  return comTrava(() => {
    const e = equipePorId(d.equipe_id);
    if (!e) throw new ErroApp('NAO_ENCONTRADO', 'Equipe não encontrada.');
    e.ativa = SIM;
    atualizar('Equipes', e);
    return true;
  });
}

// =====================================================================
// QUADRO DA EXPEDIÇÃO (somente administrador)
// =====================================================================

const EXP_STATUS = ['presente', 'falta', 'atestado', 'segundo_turno', 'folga', 'ferias'];
const RE_CHAPA = /^[1-9]\d{0,11}$/;
const RE_DIA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const EXP_MAX_DIAS = 365;

const expStatus = (v) => (EXP_STATUS.indexOf(v) >= 0 ? v : '');

function expMes(v) {
  const n = parseInt(v, 10);
  return n >= 0 && n <= 11 ? String(n) : '';
}

/** Valida os campos cadastrais de um colaborador (status fica de fora). */
function expColaborador(d) {
  const chapa = texto(d.Chapa).trim();
  const nome = texto(d.Nome).trim().slice(0, 120);
  if (!RE_CHAPA.test(chapa)) throw new ErroApp('DADOS_INVALIDOS', 'Chapa inválida: ' + chapa);
  if (!nome) throw new ErroApp('DADOS_INVALIDOS', 'Informe o nome da chapa ' + chapa + '.');
  const admissao = texto(d.Admissao).trim();
  return {
    chapa: chapa,
    nome: nome,
    funcao: texto(d['Nome Funcão']).trim().slice(0, 80),
    setor: texto(d.Setor).trim().slice(0, 60),
    nivel: texto(d.NIVEL).trim().slice(0, 20),
    admissao: /^\d{4}-\d{2}-\d{2}$/.test(admissao) ? admissao : '',
    ferias_mes: expMes(d.FeriasMes),
  };
}

function expPublico(c) {
  return {
    Chapa: Number(c.chapa), Nome: c.nome, 'Nome Funcão': c.funcao, Setor: c.setor, NIVEL: c.nivel,
    Admissao: c.admissao, FeriasMes: c.ferias_mes === '' ? null : Number(c.ferias_mes),
  };
}

function expFoto(foto) {
  const out = {};
  Object.keys(foto || {}).forEach((c) => { if (RE_CHAPA.test(c)) out[c] = expStatus(foto[c]) || null; });
  const json = JSON.stringify(out);
  if (json.length > 45000) throw new ErroApp('DADOS_INVALIDOS', 'Chamada grande demais para guardar no histórico.');
  return json;
}

function expDia(d) {
  const data = texto(d.date).trim();
  const m = RE_DIA_BR.exec(data);
  if (!m) throw new ErroApp('DADOS_INVALIDOS', 'Data inválida no histórico: ' + data);
  return {
    data: data,
    ts: texto(d.ts).slice(0, 40) || (m[3] + '-' + m[2] + '-' + m[1] + 'T12:00:00.000Z'),
    obs: texto(d.obs).slice(0, 500),
    foto: expFoto(d.snapshot),
  };
}

/** Mais recentes primeiro, um registro por data, no máximo EXP_MAX_DIAS. */
function expGravarHistorico(dias) {
  const vistos = {};
  const lista = dias.slice().sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .filter((d) => { if (vistos[d.data]) return false; vistos[d.data] = true; return true; })
    .slice(0, EXP_MAX_DIAS);
  substituirTabela('ExpHistorico', lista);
}

function expDiaPublico(d) {
  let foto = {};
  try { foto = JSON.parse(d.foto); } catch (e) { /* linha editada à mão: mostra vazio */ }
  return { date: d.data, ts: d.ts, obs: d.obs, snapshot: foto };
}

function acaoExpedicaoDados() {
  const lista = ler('ExpColaboradores');
  const chamada = {};
  lista.forEach((c) => { chamada[c.chapa] = c.status || null; });
  return {
    employees: lista.map(expPublico),
    attendance: chamada,
    history: ler('ExpHistorico').map(expDiaPublico).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)),
  };
}

/** Troca a lista inteira. Sem `attendance`, mantém a chamada de quem já existia. */
function acaoExpedicaoImportar(d) {
  const lista = d.employees || [];
  if (!lista.length) throw new ErroApp('DADOS_INVALIDOS', 'Nenhum colaborador informado.');
  if (lista.length > 1000) throw new ErroApp('DADOS_INVALIDOS', 'Importe no máximo 1000 colaboradores por vez.');
  return comTrava(() => {
    const atual = {};
    ler('ExpColaboradores').forEach((c) => { atual[c.chapa] = c.status; });
    const vistos = {};
    const novos = [];
    lista.forEach((x) => {
      const c = expColaborador(x);
      if (vistos[c.chapa]) return;
      vistos[c.chapa] = true;
      c.status = d.attendance ? expStatus(d.attendance[c.chapa]) : (atual[c.chapa] || '');
      novos.push(c);
    });
    const dias = Array.isArray(d.history) ? d.history.map(expDia) : null;
    substituirTabela('ExpColaboradores', novos);
    if (dias) expGravarHistorico(dias);
    return { colaboradores: novos.length };
  });
}

/** Lote de marcações: chamada { chapa: status } e férias { chapa: mês ou null }. */
function acaoExpedicaoSalvar(d) {
  const chamada = d.chamada || {};
  const ferias = d.ferias || {};
  return comTrava(() => {
    const mudou = ler('ExpColaboradores').filter((c) => {
      const temChamada = Object.prototype.hasOwnProperty.call(chamada, c.chapa);
      const temFerias = Object.prototype.hasOwnProperty.call(ferias, c.chapa);
      if (temChamada) c.status = expStatus(chamada[c.chapa]);
      if (temFerias) c.ferias_mes = expMes(ferias[c.chapa]);
      return temChamada || temFerias;
    });
    regravar('ExpColaboradores', mudou);
    return true;
  });
}

function acaoExpedicaoSalvarColaborador(d) {
  const c = expColaborador(d);
  return comTrava(() => {
    const atual = ler('ExpColaboradores').find((x) => x.chapa === c.chapa);
    if (d.novo) {
      if (atual) throw new ErroApp('DUPLICADO', 'Chapa já cadastrada.');
      c.status = '';
      inserir('ExpColaboradores', [c]);
    } else {
      if (!atual) throw new ErroApp('NAO_ENCONTRADO', 'Colaborador não encontrado.');
      Object.keys(c).forEach((k) => { atual[k] = c[k]; });
      atualizar('ExpColaboradores', atual);
    }
    return true;
  });
}

function acaoExpedicaoExcluirColaborador(d) {
  const chapa = texto(d.chapa);
  return comTrava(() => {
    substituirTabela('ExpColaboradores', ler('ExpColaboradores').filter((c) => c.chapa !== chapa));
    return true;
  });
}

function acaoExpedicaoSalvarDia(d) {
  const dia = expDia({ date: d.date, ts: agoraISO(), obs: d.obs, snapshot: d.snapshot });
  return comTrava(() => {
    expGravarHistorico([dia].concat(ler('ExpHistorico')));
    return expDiaPublico(dia);
  });
}

function acaoExpedicaoLimparHistorico() {
  return comTrava(() => { substituirTabela('ExpHistorico', []); return true; });
}

// =====================================================================
// INSTALAÇÃO (rode uma vez pelo editor do Apps Script)
// =====================================================================

function instalar() {
  prepararPlanilha();
  if (ler('Usuarios').some((u) => u.perfil === 'admin')) {
    console.log('Planilha conferida. Já existe administrador; nenhum usuário foi criado.');
    return true;
  }
  if (/^TROQUE-/.test(LOGIN_INICIAL_ADMIN) || /^TROQUE-/.test(SENHA_INICIAL_ADMIN)) {
    throw new Error('Preencha LOGIN_INICIAL_ADMIN e SENHA_INICIAL_ADMIN no topo do código e rode de novo.');
  }
  criarAdminInicial(LOGIN_INICIAL_ADMIN, SENHA_INICIAL_ADMIN);
  console.log('Pronto! Entre no app com o login e a senha que você colocou no topo do código. '
    + 'Agora volte os dois valores para TROQUE-... e salve.');
  return true;
}

/** Cria o primeiro administrador, se ainda não houver nenhum. */
function criarAdminInicial(login, senha) {
  _tabelas = {};
  if (ler('Usuarios').some((u) => u.perfil === 'admin')) return false;
  inserir('Usuarios', [novoUsuario({ login: login, nome: 'Administrador', perfil: 'admin', senha: senha })]);
  return true;
}

/** Cria as abas e o cabeçalho (não mexe nos dados que já existem). */
function prepararPlanilha() {
  _tabelas = {};
  const planilha = SpreadsheetApp.getActive();
  Object.keys(TABELAS).forEach((nome) => {
    let sh = planilha.getSheetByName(nome);
    if (!sh) sh = planilha.insertSheet(nome);
    const cab = TABELAS[nome];
    sh.getRange(1, 1, sh.getMaxRows(), cab.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  if (!ler('Config').some((c) => c.chave === 'permitir_multiplas_equipes')) {
    inserir('Config', [{ chave: 'permitir_multiplas_equipes', valor: 'false' }]);
  }
  const padrao = planilha.getSheetByName('Página1') || planilha.getSheetByName('Sheet1');
  if (padrao && planilha.getSheets().length > 1 && padrao.getLastRow() === 0) planilha.deleteSheet(padrao);
}
