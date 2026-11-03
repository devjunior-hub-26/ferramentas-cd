// Ferramenta: Produtividade de Carregamento (tela do carregador / líder)
import { api, exigirLogin, registrarPendencias, mensagemErro, comLimite } from '../../assets/js/auth.js';
import { $, esc, toast, iniciarAbas, abrirModal, hora, hojeISO, inicioDoDia, inicioDoDiaSeguinte } from '../../assets/js/ui.js';
import { icone } from '../../assets/js/icones.js';
import * as fila from './fila.js';

const perfil = await exigirLogin(['admin', 'lider', 'carregador']);

const MSG_SEM_EQUIPE = 'Você não está em nenhuma equipe. Procure o administrador.';
const CH_EQUIPE = `carreg-equipe-${perfil.id}`;
const CH_HIST = `carreg-hist-${perfil.id}`;

const estado = {
  equipe: null,            // { id, nome } — equipe ativa do usuário
  historico: [],           // leituras do dia já no servidor
  pendentes: [],           // itens da fila offline
  transacoes: new Set(),   // transações já lidas hoje (evita duplicar)
  lideradas: [],           // equipes que o usuário lidera
  aba: 'ler',
  processando: false,
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
  if (estado.processando) return;
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

async function processar(texto) {
  estado.processando = true;
  try {
    const d = interpretar(texto);
    if (!d) {
      return mostrarResultado('erro', 'QR Code inválido', `Formato esperado: carregamento|box|transação. Lido: "${String(texto).slice(0, 60)}"`);
    }
    if (!estado.equipe) return mostrarResultado('erro', 'Leitura bloqueada', MSG_SEM_EQUIPE, d);
    if (estado.transacoes.has(d.transacao)) {
      return mostrarResultado('erro', 'Transação já lida', `A transação ${d.transacao} já foi registrada.`, d);
    }

    const item = {
      client_id: crypto.randomUUID(),
      ...d,
      lido_em: new Date().toISOString(),
      usuario_id: perfil.id,
      equipe_nome: estado.equipe.nome,
      status: 'pendente',
      erro: null,
    };
    const primeiraLocal = ![...estado.historico, ...estado.pendentes].some((x) => x.carregamento === d.carregamento && !x.cancelada);
    estado.transacoes.add(d.transacao);

    if (navigator.onLine) {
      const r = await enviar(item);
      if (r.tipo === 'ok') {
        if (r.linha) adicionarHistorico(r.linha);
        return mostrarResultadoOk(d, r.linha);
      }
      if (r.tipo !== 'rede') {
        if (r.tipo !== 'duplicada') estado.transacoes.delete(d.transacao);
        if (r.recarregarEquipe) carregarEquipe();
        return mostrarResultado('erro', r.titulo, r.msg, d);
      }
    }

    // Sem sinal (ou servidor inacessível): guarda no celular
    await fila.adicionar(item);
    await atualizarPendentes();
    mostrarResultado('offline',
      primeiraLocal ? 'INÍCIO do carregamento (salvo no celular)' : 'Salvo no celular',
      'Sem sinal: será enviado automaticamente quando a conexão voltar.', d);
  } catch (e) {
    mostrarResultado('erro', 'Erro ao registrar', mensagemErro(e));
  } finally {
    estado.processando = false;
  }
}

// ---------------------------------------------------------------
// Envio ao servidor e tratamento de erros
// ---------------------------------------------------------------
async function enviar(item) {
  const payload = { client_id: item.client_id, carregamento: item.carregamento, box: item.box, transacao: item.transacao, lido_em: item.lido_em };
  try {
    // Demorou demais: vai para a fila. Se o servidor tiver gravado mesmo assim,
    // o reenvio usa o mesmo client_id e não duplica.
    return { tipo: 'ok', linha: await comLimite(api('registrarLeitura', payload), 8000) };
  } catch (e) {
    return classificarErro(e);
  }
}

function nomeEquipe(nome) {
  return /^equipe/i.test(nome || '') ? nome : `equipe ${nome}`;
}

function classificarErro(e) {
  switch (e.codigo) {
    case 'TRANSACAO_DUPLICADA': return { tipo: 'duplicada', titulo: 'Transação já lida', msg: e.message };
    case 'SEM_EQUIPE': return { tipo: 'negocio', titulo: 'Leitura bloqueada', msg: MSG_SEM_EQUIPE, recarregarEquipe: true };
    case 'OUTRA_EQUIPE': return { tipo: 'negocio', titulo: 'Carregamento de outra equipe', msg: `Carregamento já iniciado pela ${nomeEquipe(e.detalhe)}.` };
    case 'USUARIO_INATIVO': return { tipo: 'negocio', titulo: 'Usuário desativado', msg: e.message };
    case 'LEITURA_ANTIGA':
    case 'FORMATO_INVALIDO': return { tipo: 'negocio', titulo: 'Leitura recusada', msg: e.message };
    // Sem sinal, servidor ocupado ou sessão vencida: guarda e tenta de novo depois
    case 'REDE':
    case 'OCUPADO':
    case 'SERVIDOR':
    case 'SESSAO_INVALIDA':
    case undefined: return { tipo: 'rede' };
    default: return { tipo: 'negocio', titulo: 'Erro ao registrar', msg: mensagemErro(e) };
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

function mostrarResultadoOk(d, linha) {
  const inicio = !!linha?.primeira_do_carregamento;
  const titulo = inicio ? 'INÍCIO DO CARREGAMENTO' : 'Leitura registrada';
  if (linha?.aviso?.startsWith('OUTRA_EQUIPE:')) {
    const outra = linha.aviso.slice('OUTRA_EQUIPE:'.length);
    return mostrarResultado('alerta', titulo, `Atenção: carregamento já iniciado pela ${nomeEquipe(outra)}.`, d, inicio);
  }
  mostrarResultado('ok', titulo, `${hora(linha?.lido_em || new Date())} · ${estado.equipe?.nome || ''}`, d, inicio);
}

// ---------------------------------------------------------------
// Fila offline e sincronização
// ---------------------------------------------------------------
async function atualizarPendentes() {
  estado.pendentes = await fila.listar(perfil.id).catch(() => []);
  const pend = estado.pendentes.filter((i) => i.status === 'pendente');
  const erros = estado.pendentes.filter((i) => i.status === 'erro');

  const badge = $('#sync-pend');
  badge.hidden = pend.length === 0;
  badge.textContent = `${pend.length} pendente${pend.length === 1 ? '' : 's'}`;
  registrarPendencias('carregamento', pend.length);

  $('#problemas').hidden = erros.length === 0;
  $('#lista-problemas').innerHTML = erros.map((i) => `
    <div class="problema">
      <div><b>${esc(i.carregamento)} | ${esc(i.box)} | ${esc(i.transacao)}</b><br>
        <small class="suave">${hora(i.lido_em)} — ${esc(i.erro)}</small></div>
      <div class="btns">
        <button class="btn pequeno secundario" data-tentar="${i.client_id}">Tentar de novo</button>
        <button class="btn pequeno perigo" data-descartar="${i.client_id}">Descartar</button>
      </div>
    </div>`).join('');

  for (const i of estado.pendentes) estado.transacoes.add(i.transacao);
  renderMinhas();
}

$('#lista-problemas').addEventListener('click', async (ev) => {
  const tentar = ev.target.closest('[data-tentar]')?.dataset.tentar;
  const descartar = ev.target.closest('[data-descartar]')?.dataset.descartar;
  const item = estado.pendentes.find((i) => i.client_id === (tentar || descartar));
  if (!item) return;
  if (descartar) {
    if (!confirm(`Descartar a leitura da transação ${item.transacao}?`)) return;
    await fila.remover(item.client_id);
    estado.transacoes.delete(item.transacao);
  } else {
    await fila.atualizar({ ...item, status: 'pendente', erro: null });
  }
  await atualizarPendentes();
  if (tentar) sincronizar();
});

async function sincronizar() {
  if (estado.sincronizando || !navigator.onLine) return;
  estado.sincronizando = true;
  let enviados = 0;
  try {
    const itens = (await fila.listar(perfil.id)).filter((i) => i.status === 'pendente');
    for (const item of itens) {
      const r = await enviar(item);
      if (r.tipo === 'rede') break;
      if (r.tipo === 'ok') {
        await fila.remover(item.client_id);
        enviados++;
      } else if (r.tipo === 'duplicada') {
        await fila.remover(item.client_id);
        toast(`Transação ${item.transacao} já tinha sido lida — descartada.`, 'alerta', 6000);
      } else {
        await fila.atualizar({ ...item, status: 'erro', erro: `${r.titulo}: ${r.msg}` });
      }
    }
  } catch (e) {
    console.warn('Falha na sincronização', e);
  } finally {
    estado.sincronizando = false;
    await atualizarPendentes();
  }
  if (enviados) {
    toast(`${enviados} leitura(s) feitas offline foram enviadas.`, 'sucesso');
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
  estado.transacoes = new Set([
    ...estado.historico.filter((h) => !h.cancelada).map((h) => h.transacao),
    ...estado.pendentes.map((p) => p.transacao),
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
  const pend = estado.pendentes;
  const todas = [...pend.map((p) => ({ ...p, _local: true })), ...estado.historico]
    .sort((a, b) => b.lido_em.localeCompare(a.lido_em));
  const ativas = todas.filter((x) => !x.cancelada);
  const carregamentos = new Set(ativas.map((x) => x.carregamento));

  $('#k-leituras').textContent = ativas.length;
  $('#k-carregamentos').textContent = carregamentos.size;
  $('#k-pendentes').textContent = pend.length;
  $('#contador-dia').textContent = `Hoje: ${ativas.length} leitura(s) em ${carregamentos.size} carregamento(s)`
    + (pend.length ? ` · ${pend.length} não enviada(s)` : '');

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
        let sit = '<span class="selo sucesso">Enviada</span>';
        if (x._local) sit = x.status === 'erro' ? '<span class="selo erro">Recusada</span>' : '<span class="selo alerta">Pendente</span>';
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
renderEquipe();
await atualizarPendentes();
iniciarAbas($('#abas'), (aba) => {
  estado.aba = aba;
  if (aba === 'ler') iniciarCamera(); else pararCamera();
  if (aba === 'equipe') carregarLeiturasEquipe();
  if (aba === 'minhas') carregarHistorico();
});
$('#eq-data').value = hojeISO();
await Promise.all([carregarEquipe(), carregarHistorico()]);
sincronizar();
