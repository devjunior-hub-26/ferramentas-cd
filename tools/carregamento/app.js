// Ferramenta: Produtividade de Carregamento (tela do carregador / líder)
//
// Um LANÇAMENTO é um caminhão: o carregador lê os QR Codes de todos os
// carregamentos (de várias cidades) que vão nele e, no fim, toca em
// "Salvar lançamento". As leituras ficam guardadas no celular até salvar.
import { api, exigirLogin, registrarPendencias, mensagemErro, comLimite } from '../../assets/js/auth.js';
import { $, esc, toast, iniciarAbas, abrirModal, hora, hojeISO, inicioDoDia, inicioDoDiaSeguinte } from '../../assets/js/ui.js';
import { icone } from '../../assets/js/icones.js';
import * as fila from './fila.js';

const perfil = await exigirLogin(['admin', 'lider', 'carregador']);

const MSG_SEM_EQUIPE = 'Você não está em nenhuma equipe. Procure o administrador.';
const CH_EQUIPE = `carreg-equipe-${perfil.id}`;
const CH_HIST = `carreg-hist-${perfil.id}`;
const CH_LANC = `carreg-lanc-${perfil.id}`;

const estado = {
  equipe: null,            // { id, nome } — equipe ativa do usuário
  lancamento: null,        // { id, leituras: [...] } — caminhão sendo lido agora
  historico: [],           // leituras do dia já no servidor
  pendentes: [],           // lançamentos salvos sem sinal (fila offline)
  jaLidos: new Set(),      // carregamentos já lidos (evita duplicar)
  lideradas: [],           // equipes que o usuário lidera
  aba: 'ler',
  salvando: false,
  sincronizando: false,
  ultimoTexto: '',
  ultimoTempo: 0,
};

// ---------------------------------------------------------------
// Cabeçalho e status de conexão
// ---------------------------------------------------------------
$('#btn-voltar').innerHTML = icone('voltar');
$('#btn-digitar').innerHTML = `${icone('teclado')} Digitar`;
$('#btn-lanterna').innerHTML = `${icone('lanterna')} Lanterna`;
$('#t-usuario').textContent = perfil.nome;
$('#link-painel').hidden = !['admin', 'lider'].includes(perfil.perfil);

function atualizarRede() {
  const el = $('#sync-status');
  el.textContent = navigator.onLine ? 'Online' : 'Offline';
  el.classList.toggle('off', !navigator.onLine);
}

// ---------------------------------------------------------------
// Equipe do usuário (buscada no cadastro; nunca escolhida por ele)
// ---------------------------------------------------------------
function equipeEmCache() {
  try { return JSON.parse(localStorage.getItem(CH_EQUIPE)); } catch { return null; }
}

/** Equipe atual e equipes lideradas, numa chamada só. */
async function carregarEquipe() {
  try {
    const r = await comLimite(api('minhaEquipe'));
    estado.equipe = r.equipe;
    localStorage.setItem(CH_EQUIPE, JSON.stringify(estado.equipe));
    renderLideradas(r.lideradas);
  } catch {
    estado.equipe = equipeEmCache(); // sem sinal: usa a última equipe conhecida
  }
  renderEquipe();
}

function renderEquipe() {
  const eq = estado.equipe;
  $('#t-equipe').textContent = eq ? eq.nome : 'Sem equipe';
  $('#faixa-equipe').hidden = !eq;
  $('#faixa-nome').textContent = eq?.nome || '';
  $('#bloqueio').hidden = !!eq;
  $('#leitor-wrap').hidden = !eq;
  $('#btn-digitar').disabled = !eq;
  if (eq && estado.aba === 'ler') iniciarCamera();
  if (!eq) pararCamera();
}

// ---------------------------------------------------------------
// Câmera / leitura de QR Code
// ---------------------------------------------------------------
let leitor = null;
let lendo = false;
let iniciando = false;
let lanternaLigada = false;
let wakeLock = null;

async function iniciarCamera() {
  if (lendo || iniciando || !estado.equipe || document.hidden) return;
  iniciando = true;
  const msg = $('#leitor-msg');
  msg.hidden = false;
  msg.textContent = 'Iniciando câmera...';
  try {
    leitor ??= new Html5Qrcode('leitor', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
    await leitor.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        aspectRatio: 1,
        qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; },
      },
      aoLer,
      () => {},
    );
    lendo = true;
    msg.hidden = true;
    const caps = leitor.getRunningTrackCapabilities?.() || {};
    $('#btn-lanterna').disabled = !caps.torch;
    manterTelaLigada();
  } catch (e) {
    msg.innerHTML = `Não foi possível abrir a câmera.<br><small>Permita o uso da câmera nas configurações do navegador e toque aqui para tentar de novo.</small>`;
    msg.onclick = () => { msg.onclick = null; iniciarCamera(); };
    console.warn(e);
  } finally {
    iniciando = false;
  }
}

async function pararCamera() {
  if (leitor && lendo) {
    try { await leitor.stop(); } catch { /* já parado */ }
  }
  lendo = false;
  lanternaLigada = false;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

async function manterTelaLigada() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* não suportado */ }
}

$('#btn-lanterna').addEventListener('click', async () => {
  if (!lendo) return;
  try {
    lanternaLigada = !lanternaLigada;
    await leitor.applyVideoConstraints({ advanced: [{ torch: lanternaLigada }] });
  } catch { toast('Lanterna não disponível neste aparelho.', 'alerta'); }
});

function aoLer(texto) {
  const agora = Date.now();
  if (texto === estado.ultimoTexto && agora - estado.ultimoTempo < 3000) return; // mesma etiqueta ainda na frente da câmera
  estado.ultimoTexto = texto;
  estado.ultimoTempo = agora;
  processar(texto);
}

/** "3354419|3|2734182" → { carregamento, box, transacao } ou null se inválido. */
function interpretar(texto) {
  const partes = String(texto).trim().split('|').map((p) => p.trim());
  if (partes.length !== 3) return null;
  const [carregamento, box, transacao] = partes;
  if (!/^\d{1,20}$/.test(carregamento) || !/^\d{1,10}$/.test(box) || !/^\d{1,20}$/.test(transacao)) return null;
  return { carregamento, box, transacao };
}

/** Cada leitura válida entra no lançamento atual; o servidor confere em segundo plano. */
function processar(texto) {
  const d = interpretar(texto);
  if (!d) {
    return mostrarResultado('erro', 'QR Code inválido', `Formato esperado: carregamento|box|transação. Lido: "${String(texto).slice(0, 60)}"`);
  }
  if (!estado.equipe) return mostrarResultado('erro', 'Leitura bloqueada', MSG_SEM_EQUIPE, d);
  if (estado.salvando) return mostrarResultado('alerta', 'Aguarde', 'O lançamento está sendo salvo. Leia de novo em instantes.', d);
  if (estado.jaLidos.has(d.carregamento)) {
    return mostrarResultado('erro', 'Carregamento já lido', `O carregamento ${d.carregamento} já foi lançado.`, d);
  }

  estado.lancamento ??= { id: crypto.randomUUID(), leituras: [] };
  const lanc = estado.lancamento;
  const item = {
    client_id: crypto.randomUUID(), ...d, lido_em: new Date().toISOString(),
    conferencia: navigator.onLine ? 'conferindo' : 'sem_sinal', msg: '', destino: destinoConhecido(d.carregamento),
  };
  lanc.leituras.push(item);
  estado.jaLidos.add(d.carregamento);
  salvarLancamentoAtual();
  renderLancamento();

  const n = lanc.leituras.length;
  mostrarResultado('ok', 'Carregamento adicionado',
    `${n} carregamento(s) no lançamento · toque em "Salvar lançamento" ao terminar o caminhão`, d);
  if (item.conferencia === 'conferindo') conferir(item);
}

function destinoConhecido(carregamento) {
  return estado.lancamento?.leituras.find((x) => x.carregamento === carregamento && x.destino)?.destino || '';
}

/** Pergunta ao servidor se a leitura será aceita (sem gravar) e traz a cidade. */
async function conferir(item) {
  try {
    const r = await comLimite(api('conferirLeitura', { carregamento: item.carregamento, box: item.box, transacao: item.transacao }));
    item.conferencia = r.aviso ? 'aviso' : 'ok';
    item.msg = r.aviso ? `Carregamento já iniciado pela ${nomeEquipe(r.aviso.slice('OUTRA_EQUIPE:'.length))}.` : '';
    if (r.destino) estado.lancamento?.leituras.filter((x) => x.carregamento === item.carregamento).forEach((x) => { x.destino = r.destino; });
    if (r.aviso) mostrarResultado('alerta', 'Atenção', item.msg, item);
  } catch (e) {
    const c = classificarErro(e);
    if (c.tipo === 'rede') {
      item.conferencia = 'sem_sinal';
    } else {
      item.conferencia = 'erro';
      item.msg = c.msg;
      mostrarResultado('erro', `${c.titulo} — tire do lançamento`, c.msg, item);
      if (c.recarregarEquipe) carregarEquipe();
    }
  }
  if (!estado.lancamento?.leituras.includes(item)) return; // lançamento já salvo ou descartado
  salvarLancamentoAtual();
  renderLancamento();
}

function nomeEquipe(nome) {
  return /^equipe/i.test(nome || '') ? nome : `equipe ${nome}`;
}

function classificarErro(e) {
  switch (e.codigo) {
    case 'CARREGAMENTO_DUPLICADO': return { tipo: 'negocio', titulo: 'Carregamento já lido', msg: e.message };
    case 'SEM_EQUIPE': return { tipo: 'negocio', titulo: 'Leitura bloqueada', msg: MSG_SEM_EQUIPE, recarregarEquipe: true };
    case 'OUTRA_EQUIPE': return { tipo: 'negocio', titulo: 'Carregamento de outra equipe', msg: `Carregamento já iniciado pela ${nomeEquipe(e.detalhe)}.` };
    case 'USUARIO_INATIVO': return { tipo: 'negocio', titulo: 'Usuário desativado', msg: e.message };
    case 'LANCAMENTO_RECUSADO': return { tipo: 'recusado', titulo: 'Lançamento não salvo', msg: e.message, erros: e.detalhe || [] };
    case 'LEITURA_ANTIGA':
    case 'FORMATO_INVALIDO':
    case 'DADOS_INVALIDOS': return { tipo: 'negocio', titulo: 'Recusado', msg: e.message };
    // Sem sinal, servidor ocupado ou sessão vencida: guarda e tenta de novo depois
    case 'REDE':
    case 'OCUPADO':
    case 'SERVIDOR':
    case 'SESSAO_INVALIDA':
    case undefined: return { tipo: 'rede' };
    default: return { tipo: 'negocio', titulo: 'Erro', msg: mensagemErro(e) };
  }
}

// ---------------------------------------------------------------
// Lançamento atual (caminhão): lista, salvar e descartar
// ---------------------------------------------------------------
function salvarLancamentoAtual() {
  try {
    if (estado.lancamento?.leituras.length) localStorage.setItem(CH_LANC, JSON.stringify(estado.lancamento));
    else localStorage.removeItem(CH_LANC);
  } catch { /* sem storage */ }
  atualizarContagemPendente();
}

function lancamentoGuardado() {
  try {
    const l = JSON.parse(localStorage.getItem(CH_LANC));
    if (!l?.leituras?.length) return null;
    // Conferências que estavam em andamento quando a página fechou
    l.leituras.forEach((x) => { if (x.conferencia === 'conferindo') x.conferencia = 'sem_sinal'; });
    return l;
  } catch { return null; }
}

const SELO_CONFERENCIA = {
  conferindo: '<span class="selo neutro">Conferindo…</span>',
  ok: '<span class="selo sucesso">OK</span>',
  aviso: '<span class="selo alerta">Atenção</span>',
  erro: '<span class="selo erro">Recusada</span>',
  sem_sinal: '<span class="selo neutro">Sem conferir</span>',
};

function renderLancamento() {
  const leituras = estado.lancamento?.leituras || [];
  const box = $('#lanc-atual');
  box.hidden = leituras.length === 0;
  if (!leituras.length) return;

  const porCarreg = new Map();
  for (const x of leituras) {
    const c = porCarreg.get(x.carregamento) || { qtd: 0, destino: '' };
    c.qtd++;
    c.destino ||= x.destino;
    porCarreg.set(x.carregamento, c);
  }
  const recusadas = leituras.filter((x) => x.conferencia === 'erro').length;
  $('#lanc-titulo').textContent = `Lançamento atual · ${leituras.length} leitura(s) · ${porCarreg.size} carregamento(s)`;
  $('#lanc-carregamentos').innerHTML = [...porCarreg].map(([num, c]) =>
    `<span class="chip-carreg"><b>${esc(num)}</b>${c.destino ? ` · ${esc(c.destino)}` : ''} <small>(${c.qtd})</small></span>`).join('');
  $('#lanc-aviso').hidden = recusadas === 0;
  $('#lanc-aviso').textContent = `${recusadas} leitura(s) recusada(s). Toque em "Tirar" em cada uma para poder salvar.`;
  $('#tb-lanc-atual').innerHTML = [...leituras].reverse().map((x) => `<div class="item-lanc ${x.conferencia === 'erro' ? 'linha-erro' : ''}">
    <div><b>${esc(x.carregamento)}</b> · box ${esc(x.box)} · ${esc(x.transacao)}<br>
      <small class="suave">${hora(x.lido_em)}</small> ${SELO_CONFERENCIA[x.conferencia] || ''}${x.msg ? `<br><small>${esc(x.msg)}</small>` : ''}</div>
    <button class="btn pequeno secundario" data-tirar="${x.client_id}">Tirar</button></div>`).join('');
  $('#btn-salvar-lanc').disabled = recusadas > 0 || estado.salvando;
  $('#btn-salvar-lanc').textContent = estado.salvando ? 'Salvando...' : `Salvar lançamento (${leituras.length})`;
}

$('#tb-lanc-atual').addEventListener('click', (ev) => {
  const id = ev.target.closest('[data-tirar]')?.dataset.tirar;
  const lanc = estado.lancamento;
  const item = lanc?.leituras.find((x) => x.client_id === id);
  if (!item || estado.salvando) return;
  lanc.leituras = lanc.leituras.filter((x) => x !== item);
  estado.jaLidos.delete(item.carregamento);
  if (!lanc.leituras.length) estado.lancamento = null;
  salvarLancamentoAtual();
  renderLancamento();
  renderMinhas();
});

$('#btn-descartar-lanc').addEventListener('click', () => {
  const lanc = estado.lancamento;
  if (!lanc || estado.salvando) return;
  if (!confirm(`Descartar o lançamento atual com ${lanc.leituras.length} leitura(s)? Elas não serão salvas.`)) return;
  lanc.leituras.forEach((x) => estado.jaLidos.delete(x.carregamento));
  estado.lancamento = null;
  salvarLancamentoAtual();
  renderLancamento();
  renderMinhas();
  mostrarResultado('alerta', 'Lançamento descartado', 'Pode começar a ler o próximo caminhão.');
});

const paraEnvio = (lanc, salvoEm) => ({
  id: lanc.id,
  salvo_em: salvoEm,
  leituras: lanc.leituras.map(({ client_id, carregamento, box, transacao, lido_em }) => ({ client_id, carregamento, box, transacao, lido_em })),
});

async function enviarLancamento(corpo) {
  try {
    // Se a resposta se perder, o reenvio usa o mesmo id e o servidor não duplica
    return { tipo: 'ok', r: await comLimite(api('registrarLancamento', corpo), 30000) };
  } catch (e) {
    return classificarErro(e);
  }
}

$('#btn-salvar-lanc').addEventListener('click', async () => {
  const lanc = estado.lancamento;
  if (!lanc?.leituras.length || estado.salvando) return;
  estado.salvando = true;
  renderLancamento();
  const corpo = paraEnvio(lanc, new Date().toISOString());
  const qtdCarreg = new Set(lanc.leituras.map((x) => x.carregamento)).size;
  try {
    const res = navigator.onLine ? await enviarLancamento(corpo) : { tipo: 'rede' };
    if (res.tipo === 'ok') {
      res.r.leituras.forEach(adicionarHistorico);
      estado.lancamento = null;
      mostrarResultado('ok', 'Lançamento salvo', `${corpo.leituras.length} leitura(s) em ${qtdCarreg} carregamento(s). Pode começar o próximo caminhão.`);
    } else if (res.tipo === 'rede') {
      // Sem sinal: o lançamento fica no celular e é enviado sozinho depois
      await fila.adicionar({ client_id: lanc.id, usuario_id: perfil.id, lido_em: corpo.salvo_em, ...corpo, status: 'pendente', erro: null, erros: null });
      estado.lancamento = null;
      mostrarResultado('offline', 'Lançamento salvo no celular',
        `Sem sinal: ${corpo.leituras.length} leitura(s) serão enviadas automaticamente quando a conexão voltar.`);
    } else if (res.tipo === 'recusado') {
      marcarRecusadas(lanc, res.erros);
      mostrarResultado('erro', res.titulo, res.msg);
    } else {
      mostrarResultado('erro', res.titulo, res.msg);
      if (res.recarregarEquipe) carregarEquipe();
    }
  } finally {
    estado.salvando = false;
    salvarLancamentoAtual();
    renderLancamento();
    await atualizarPendentes();
  }
});

function marcarRecusadas(lanc, erros) {
  for (const er of erros) {
    const x = lanc.leituras.find((l) => l.client_id === er.client_id);
    if (x) { x.conferencia = 'erro'; x.msg = er.msg; }
  }
}

// ---------------------------------------------------------------
// Feedback (cartão + som + vibração)
// ---------------------------------------------------------------
let audioCtx = null;
function som(tipo) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notas = {
      ok: [[1046, 0.12]],
      offline: [[880, 0.09], [1046, 0.09]],
      alerta: [[660, 0.15], [660, 0.15]],
      erro: [[220, 0.2], [170, 0.3]],
    }[tipo];
    let t = audioCtx.currentTime;
    for (const [freq, dur] of notas) {
      const osc = audioCtx.createOscillator();
      const ganho = audioCtx.createGain();
      osc.type = tipo === 'erro' ? 'square' : 'sine';
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.3, t);
      ganho.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(ganho).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + 0.05;
    }
  } catch { /* sem áudio */ }
  navigator.vibrate?.({ ok: [90], offline: [70, 50, 70], alerta: [150, 80, 150], erro: [300, 100, 300] }[tipo]);
}
// Navegadores só liberam áudio depois de um toque na tela
document.addEventListener('pointerdown', () => {
  try { audioCtx ??= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* ignora */ }
}, { once: true });

function mostrarResultado(tipo, titulo, msg, d, inicio = false) {
  const el = $('#resultado');
  el.className = `resultado ${tipo}${inicio ? ' inicio' : ''}`;
  el.innerHTML = `
    <div class="r-titulo">${esc(titulo)}</div>
    ${msg ? `<div class="r-msg">${esc(msg)}</div>` : ''}
    ${d ? `<div class="r-dados">
      <div><small>Carregamento</small><b>${esc(d.carregamento)}</b></div>
      <div><small>Box</small><b>${esc(d.box)}</b></div>
      <div><small>Transação</small><b>${esc(d.transacao)}</b></div>
    </div>` : ''}`;
  void el.offsetWidth;
  el.classList.add('pisca');
  som(tipo);
}

// ---------------------------------------------------------------
// Fila offline (lançamentos salvos sem sinal) e sincronização
// ---------------------------------------------------------------
/** Itens antigos da fila (uma leitura cada, versão anterior do app) viram lançamento. */
function comoLancamento(item) {
  if (item.leituras) return item;
  const { client_id, carregamento, box, transacao, lido_em } = item;
  return { ...item, id: client_id, salvo_em: lido_em, leituras: [{ client_id, carregamento, box, transacao, lido_em }] };
}

function atualizarContagemPendente() {
  const naFila = estado.pendentes.filter((i) => i.status === 'pendente').reduce((s, i) => s + i.leituras.length, 0);
  registrarPendencias('carregamento', naFila + (estado.lancamento?.leituras.length || 0));
}

async function atualizarPendentes() {
  estado.pendentes = (await fila.listar(perfil.id).catch(() => [])).map(comoLancamento);
  const pend = estado.pendentes.filter((i) => i.status === 'pendente');
  const erros = estado.pendentes.filter((i) => i.status === 'erro');

  const badge = $('#sync-pend');
  badge.hidden = pend.length === 0;
  badge.textContent = `${pend.length} lançamento${pend.length === 1 ? '' : 's'} pendente${pend.length === 1 ? '' : 's'}`;
  atualizarContagemPendente();

  $('#problemas').hidden = erros.length === 0;
  $('#lista-problemas').innerHTML = erros.map((i) => {
    const recusadas = (i.erros || []).map((er) => `<li>Carregamento ${esc(er.carregamento || er.transacao)}: ${esc(er.msg)}</li>`).join('');
    return `<div class="problema">
      <div><b>Lançamento de ${hora(i.salvo_em)} · ${i.leituras.length} leitura(s)</b><br>
        <small class="suave">${esc(i.erro)}</small>${recusadas ? `<ul class="recusadas">${recusadas}</ul>` : ''}</div>
      <div class="btns">
        ${i.erros?.length ? `<button class="btn pequeno secundario" data-tirar-recusadas="${i.client_id}">Tirar recusadas e reenviar</button>`
          : `<button class="btn pequeno secundario" data-tentar="${i.client_id}">Tentar de novo</button>`}
        <button class="btn pequeno perigo" data-descartar="${i.client_id}">Descartar</button>
      </div>
    </div>`;
  }).join('');

  for (const i of estado.pendentes) i.leituras.forEach((l) => estado.jaLidos.add(l.carregamento));
  renderMinhas();
}

$('#lista-problemas').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  const id = b?.dataset.tentar || b?.dataset.descartar || b?.dataset.tirarRecusadas;
  const item = estado.pendentes.find((i) => i.client_id === id);
  if (!item) return;
  if (b.dataset.descartar) {
    if (!confirm(`Descartar este lançamento com ${item.leituras.length} leitura(s)?`)) return;
    await fila.remover(item.client_id);
    item.leituras.forEach((l) => estado.jaLidos.delete(l.carregamento));
  } else {
    let leituras = item.leituras;
    if (b.dataset.tirarRecusadas) {
      const fora = new Set((item.erros || []).map((er) => er.client_id));
      leituras.filter((l) => fora.has(l.client_id)).forEach((l) => estado.jaLidos.delete(l.carregamento));
      leituras = leituras.filter((l) => !fora.has(l.client_id));
    }
    if (!leituras.length) await fila.remover(item.client_id);
    else await fila.atualizar({ ...item, leituras, status: 'pendente', erro: null, erros: null });
  }
  await atualizarPendentes();
  if (!b.dataset.descartar) sincronizar();
});

async function sincronizar() {
  if (estado.sincronizando || !navigator.onLine) return;
  estado.sincronizando = true;
  let enviados = 0;
  try {
    const itens = (await fila.listar(perfil.id)).map(comoLancamento).filter((i) => i.status === 'pendente');
    for (const item of itens) {
      const res = await enviarLancamento({ id: item.id, salvo_em: item.salvo_em, leituras: item.leituras });
      if (res.tipo === 'rede') break;
      if (res.tipo === 'ok') {
        await fila.remover(item.client_id);
        enviados++;
      } else {
        await fila.atualizar({ ...item, status: 'erro', erro: `${res.titulo}: ${res.msg}`, erros: res.erros || null });
      }
    }
  } catch (e) {
    console.warn('Falha na sincronização', e);
  } finally {
    estado.sincronizando = false;
    await atualizarPendentes();
  }
  if (enviados) {
    toast(`${enviados} lançamento(s) feitos sem sinal foram enviados.`, 'sucesso');
    carregarHistorico();
  }
}

// ---------------------------------------------------------------
// Minhas leituras do dia
// ---------------------------------------------------------------
async function carregarHistorico() {
  const dia = hojeISO();
  try {
    estado.historico = await comLimite(api('minhasLeituras', { ini: inicioDoDia(dia), fim: inicioDoDiaSeguinte(dia) }));
    salvarHistorico();
  } catch {
    try {
      const c = JSON.parse(localStorage.getItem(CH_HIST));
      estado.historico = c?.dia === dia ? c.itens : [];
    } catch { estado.historico = []; }
  }
  estado.jaLidos = new Set([
    ...estado.historico.filter((h) => !h.cancelada).map((h) => h.carregamento),
    ...estado.pendentes.flatMap((p) => p.leituras.map((l) => l.carregamento)),
    ...(estado.lancamento?.leituras || []).map((l) => l.carregamento),
  ]);
  renderMinhas();
}

function salvarHistorico() {
  try { localStorage.setItem(CH_HIST, JSON.stringify({ dia: hojeISO(), itens: estado.historico })); } catch { /* cheio */ }
}

function adicionarHistorico(linha) {
  estado.historico.unshift(linha);
  salvarHistorico();
  renderMinhas();
}

function renderMinhas() {
  const atuais = (estado.lancamento?.leituras || []).map((l) => ({ ...l, _atual: true }));
  const pend = estado.pendentes.flatMap((p) => p.leituras.map((l) => ({ ...l, _local: true, status: p.status })));
  const todas = [...atuais, ...pend, ...estado.historico].sort((a, b) => b.lido_em.localeCompare(a.lido_em));
  const ativas = todas.filter((x) => !x.cancelada);
  const carregamentos = new Set(ativas.map((x) => x.carregamento));
  const lancamentos = new Set(estado.historico.filter((h) => h.lancamento_id).map((h) => h.lancamento_id)).size
    + estado.pendentes.length;
  const naoEnviadas = atuais.length + pend.length;

  $('#k-lancamentos').textContent = lancamentos;
  $('#k-leituras').textContent = ativas.length;
  $('#k-carregamentos').textContent = carregamentos.size;
  $('#k-pendentes').textContent = naoEnviadas;
  $('#contador-dia').textContent = `Hoje: ${lancamentos} lançamento(s), ${ativas.length} leitura(s) em ${carregamentos.size} carregamento(s)`
    + (naoEnviadas ? ` · ${naoEnviadas} não enviada(s)` : '');

  const resumo = new Map();
  for (const x of ativas) {
    const r = resumo.get(x.carregamento) || { qtd: 0, inicio: x.lido_em, ultima: x.lido_em };
    r.qtd++;
    if (x.lido_em < r.inicio) r.inicio = x.lido_em;
    if (x.lido_em > r.ultima) r.ultima = x.lido_em;
    resumo.set(x.carregamento, r);
  }
  $('#tb-resumo').innerHTML = resumo.size
    ? [...resumo].map(([c, r]) => `<tr><td><b>${esc(c)}</b></td><td class="num">${r.qtd}</td><td>${hora(r.inicio)}</td><td>${hora(r.ultima)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="vazio">Nenhuma leitura hoje.</td></tr>';

  $('#tb-minhas').innerHTML = todas.length
    ? todas.map((x) => {
        let sit = '<span class="selo sucesso">Salva</span>';
        if (x._atual) sit = '<span class="selo neutro">No lançamento atual</span>';
        else if (x._local) sit = x.status === 'erro' ? '<span class="selo erro">Recusada</span>' : '<span class="selo alerta">Pendente</span>';
        else if (x.cancelada) sit = '<span class="selo neutro">Cancelada</span>';
        else if (x.primeira_do_carregamento) sit = '<span class="selo">Início</span>';
        return `<tr><td>${hora(x.lido_em)}</td><td><b>${esc(x.carregamento)}</b></td><td>${esc(x.box)}</td><td>${esc(x.transacao)}</td><td>${sit}</td></tr>`;
      }).join('')
    : '<tr><td colspan="5" class="vazio">Nenhuma leitura hoje.</td></tr>';
}

// ---------------------------------------------------------------
// Minha equipe (líder): acompanhar e corrigir leituras
// ---------------------------------------------------------------
let leiturasEquipe = [];

function renderLideradas(lideradas) {
  const antes = $('#eq-equipe').value;
  estado.lideradas = lideradas || [];
  $('button[data-aba="equipe"]').hidden = estado.lideradas.length === 0;
  $('#eq-equipe').innerHTML = estado.lideradas.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
  if (estado.lideradas.some((e) => e.id === antes)) $('#eq-equipe').value = antes;
}

async function carregarLeiturasEquipe() {
  const equipe = $('#eq-equipe').value;
  const dia = $('#eq-data').value || hojeISO();
  if (!equipe) return;
  $('#tb-equipe').innerHTML = '<tr><td colspan="7" class="carregando">Carregando...</td></tr>';
  let data;
  try {
    data = await api('leiturasEquipe', { equipe_id: equipe, ini: inicioDoDia(dia), fim: inicioDoDiaSeguinte(dia) });
  } catch (e) {
    $('#tb-equipe').innerHTML = `<tr><td colspan="7" class="vazio">${esc(mensagemErro(e))}</td></tr>`;
    return;
  }
  leiturasEquipe = data;
  const ativas = data.filter((l) => !l.cancelada);
  $('#ke-leituras').textContent = ativas.length;
  $('#ke-carregamentos').textContent = new Set(ativas.map((l) => l.carregamento)).size;
  $('#ke-canceladas').textContent = data.length - ativas.length;
  $('#tb-equipe').innerHTML = data.length ? data.map((l) => {
    let sit = l.primeira_do_carregamento ? '<span class="selo">Início</span>' : '<span class="selo sucesso">OK</span>';
    if (l.cancelada) sit = `<span class="selo neutro" title="${esc(l.motivo_cancelamento)}">Cancelada</span>`;
    else if (l.corrigido_em) sit += ' <span class="selo alerta">Corrigida</span>';
    const acoes = l.cancelada ? '' : `
      <button class="btn pequeno secundario" data-corrigir="${l.id}">Corrigir</button>
      <button class="btn pequeno perigo" data-cancelar-leitura="${l.id}">Cancelar</button>`;
    return `<tr><td>${hora(l.lido_em)}</td><td>${esc(l.usuario_nome)}</td><td><b>${esc(l.carregamento)}</b></td>
      <td>${esc(l.box)}</td><td>${esc(l.transacao)}</td><td>${sit}</td><td><div class="btns">${acoes}</div></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="vazio">Nenhuma leitura nesta data.</td></tr>';
}

$('#eq-atualizar').addEventListener('click', carregarLeiturasEquipe);
$('#eq-equipe').addEventListener('change', carregarLeiturasEquipe);
$('#eq-data').addEventListener('change', carregarLeiturasEquipe);

$('#tb-equipe').addEventListener('click', async (ev) => {
  const idCorrigir = ev.target.closest('[data-corrigir]')?.dataset.corrigir;
  const idCancelar = ev.target.closest('[data-cancelar-leitura]')?.dataset.cancelarLeitura;
  const l = leiturasEquipe.find((x) => String(x.id) === (idCorrigir || idCancelar));
  if (!l) return;

  let mudanca = null;
  if (idCorrigir) {
    const dados = await abrirModal($('#modal-corrigir'), (form) => {
      $('#corrigir-info').textContent = `Transação ${l.transacao} · ${l.usuario_nome || ''} · ${hora(l.lido_em)}`;
      form.carregamento.value = l.carregamento;
      form.box.value = l.box;
    });
    if (!dados) return;
    mudanca = { carregamento: dados.carregamento.trim(), box: dados.box.trim() };
  } else {
    const dados = await abrirModal($('#modal-cancelar'), () => {
      $('#cancelar-info').textContent = `Carregamento ${l.carregamento} · transação ${l.transacao} · ${l.usuario_nome || ''}`;
    });
    if (!dados) return;
    mudanca = { cancelar: true, motivo: dados.motivo.trim() };
  }

  try {
    await api('corrigirLeitura', { id: l.id, ...mudanca });
  } catch (e) {
    const msg = e.codigo === 'OUTRA_EQUIPE' ? `Carregamento já iniciado pela ${nomeEquipe(e.detalhe)}.` : mensagemErro(e);
    return toast(msg, 'erro', 5000);
  }
  toast(idCorrigir ? 'Leitura corrigida.' : 'Leitura cancelada.', 'sucesso');
  carregarLeiturasEquipe();
});

// ---------------------------------------------------------------
// Digitar código manualmente
// ---------------------------------------------------------------
$('#btn-digitar').addEventListener('click', async () => {
  const dados = await abrirModal($('#modal-digitar'));
  if (dados) processar(`${dados.carregamento.trim()}|${dados.box.trim()}|${dados.transacao.trim()}`);
});

// ---------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------
window.addEventListener('online', () => { atualizarRede(); sincronizar(); carregarEquipe(); });
window.addEventListener('offline', atualizarRede);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pararCamera();
  else {
    if (estado.aba === 'ler') iniciarCamera();
    sincronizar();
  }
});
setInterval(sincronizar, 20000);
setInterval(() => { if (navigator.onLine) carregarEquipe(); }, 60000);

atualizarRede();
// Abre a câmera já com a última equipe conhecida; o servidor confirma em seguida
estado.equipe = equipeEmCache();
estado.lancamento = lancamentoGuardado(); // caminhão que estava sendo lido quando o app fechou
renderEquipe();
renderLancamento();
await atualizarPendentes();
iniciarAbas($('#abas'), (aba) => {
  estado.aba = aba;
  if (aba === 'ler') iniciarCamera(); else pararCamera();
  if (aba === 'equipe') carregarLeiturasEquipe();
  if (aba === 'minhas') carregarHistorico();
});
$('#eq-data').value = hojeISO();
await Promise.all([carregarEquipe(), carregarHistorico()]);
// Confere as leituras do lançamento guardado que ficaram sem conferir
if (navigator.onLine) estado.lancamento?.leituras.filter((x) => x.conferencia === 'sem_sinal').forEach((x) => { x.conferencia = 'conferindo'; conferir(x); });
renderLancamento();
sincronizar();
