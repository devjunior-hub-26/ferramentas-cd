// Importação da rotina 967 do Winthor (.xls/.xlsx) com SheetJS.
// As colunas são reconhecidas por nomes prováveis e podem ser ajustadas na tela.
import { api, mensagemErro } from '../../assets/js/auth.js';
import { $, $$, esc, toast, numero, hojeISO } from '../../assets/js/ui.js';

// Nomes prováveis de cada coluna (comparados sem acento, espaço ou pontuação).
// Os primeiros são os da 967 usada no CD (34 colunas, cabeçalho na linha 1):
// "Carregamento", "Destino", "Rota principal", "Peso total" e "Saída".
// Se a sua 967 usa outro nome, inclua aqui para ser reconhecido sozinho.
const APELIDOS = {
  carregamento: ['carregamento', 'numcar', 'numcarreg', 'numcarregamento', 'ncarregamento', 'nocarregamento', 'numerocarregamento', 'nrocarregamento', 'codcarregamento', 'carreg'],
  destino: ['destino', 'cidadedestino', 'destinocidade', 'cidade', 'municipio', 'praca', 'nomepraca', 'descdestino'],
  rota: ['rotaprincipal', 'rota', 'descrota', 'descricaorota', 'nomerota', 'codrota'],
  peso: ['pesototal', 'peso', 'totpeso', 'totalpeso', 'pesobruto', 'pesokg', 'pesocarga', 'pesoliquido'],
  data: ['saida', 'datasaida', 'dtsaida', 'data', 'datacarregamento', 'dtcarregamento', 'dtcarreg', 'datafaturamento', 'dtfaturamento', 'dtfat', 'dataemissao'],
};
const CAMPOS = Object.keys(APELIDOS);
const CH_IGNORAR = 'imp967-ignorar';

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

let livro = null;
let linhas = [];      // planilha como matriz
let previa = [];      // carregamentos prontos para importar
let perfilAtual = null;

export function iniciarImportacao(perfil) {
  perfilAtual = perfil;
  $('#imp-data-padrao').value = hojeISO();
  $('#imp-arquivo').addEventListener('change', lerArquivo);
  $('#imp-planilha').addEventListener('change', () => carregarPlanilha(true));
  $('#imp-linha').addEventListener('change', () => { montarSeletores(false); gerarPrevia(); });
  try { const salvo = localStorage.getItem(CH_IGNORAR); if (salvo !== null) $('#imp-ignorar').value = salvo; } catch { /* sem storage */ }
  $('#imp-ignorar').addEventListener('change', () => {
    try { localStorage.setItem(CH_IGNORAR, $('#imp-ignorar').value); } catch { /* sem storage */ }
  });
  $$('#imp-config select[data-col], #imp-somar, #imp-data-padrao, #imp-ignorar').forEach((el) => el.addEventListener('change', gerarPrevia));
  $('#imp-confirmar').addEventListener('click', confirmar);
  $('#imp-cancelar').addEventListener('click', limpar);
}

function limpar() {
  livro = null; linhas = []; previa = [];
  $('#imp-arquivo').value = '';
  $('#imp-config').hidden = true;
  $('#imp-previa-box').hidden = true;
  $('#imp-status').innerHTML = '';
}

async function lerArquivo(ev) {
  const arq = ev.target.files?.[0];
  if (!arq) return;
  try {
    const buffer = await arq.arrayBuffer();
    livro = XLSX.read(buffer, { type: 'array', cellDates: true });
    $('#imp-planilha').innerHTML = livro.SheetNames.map((n) => `<option>${esc(n)}</option>`).join('');
    carregarPlanilha(true);
    $('#imp-config').hidden = false;
  } catch (e) {
    toast('Não foi possível ler o arquivo: ' + e.message, 'erro', 6000);
  }
}

function carregarPlanilha(detectarCabecalho) {
  const ws = livro.Sheets[$('#imp-planilha').value];
  // blankrows: true mantém a numeração igual à do Excel
  linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
  if (detectarCabecalho) $('#imp-linha').value = detectarLinhaCabecalho() + 1;
  montarSeletores(true);
  gerarPrevia();
}

function encontrarColuna(cabecalho, campo) {
  const norm = cabecalho.map(normalizar);
  for (const ap of APELIDOS[campo]) { const i = norm.indexOf(ap); if (i >= 0) return i; }
  // Busca parcial: "Nº Carreg." → carreg. Evita confundir "Dt. Carregamento" com o número.
  const ehData = (h) => /^(dt|data|hora)/.test(h);
  for (const ap of APELIDOS[campo]) {
    const i = norm.findIndex((h) => h && h.includes(ap) && (campo === 'data' || !ehData(h)));
    if (i >= 0) return i;
  }
  return -1;
}

/** Exportações do Winthor costumam ter linhas de título antes do cabeçalho. */
function detectarLinhaCabecalho() {
  let melhor = 0, pontos = 0;
  linhas.slice(0, 30).forEach((linha, i) => {
    const p = CAMPOS.filter((c) => encontrarColuna(linha, c) >= 0).length;
    if (p > pontos) { pontos = p; melhor = i; }
  });
  return melhor;
}

function montarSeletores(autodetectar) {
  const idx = Math.max(0, Number($('#imp-linha').value || 1) - 1);
  const cab = linhas[idx] || [];
  const opcoes = '<option value="">— não usar —</option>' + cab.map((h, i) =>
    `<option value="${i}">${esc(String(h || `(coluna ${XLSX.utils.encode_col(i)})`))}</option>`).join('');
  for (const sel of $$('#imp-config select[data-col]')) {
    const atual = sel.value;
    sel.innerHTML = opcoes;
    const i = autodetectar || atual === '' ? encontrarColuna(cab, sel.dataset.col) : Number(atual);
    sel.value = i >= 0 && i < cab.length ? String(i) : '';
  }
}

// ---------- conversões ----------
function lerNumeroCarregamento(v) {
  const s = String(v ?? '').trim().replace(/\.0+$/, '');
  return /^\d{1,20}$/.test(s) ? s : null;
}

function lerPeso(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 → 1234.56
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function lerData(v) {
  const p = (n) => String(n).padStart(2, '0');
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  if (typeof v === 'number' && v > 20000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${p(d.m)}-${p(d.d)}` : null;
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${p(m[2])}-${p(m[1])}`;
  const iso = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function colunas() {
  const c = {};
  for (const sel of $$('#imp-config select[data-col]')) c[sel.dataset.col] = sel.value === '' ? -1 : Number(sel.value);
  return c;
}

async function gerarPrevia() {
  const col = colunas();
  const box = $('#imp-previa-box');
  $('#imp-status').innerHTML = '';
  if (col.carregamento < 0) {
    box.hidden = true;
    return toast('Escolha a coluna do número do carregamento.', 'alerta');
  }
  const somar = $('#imp-somar').checked;
  const dataPadrao = $('#imp-data-padrao').value || hojeISO();
  const inicio = Math.max(0, Number($('#imp-linha').value || 1) - 1) + 1;

  const ignorarDestinos = new Set($('#imp-ignorar').value.split(',').map(normalizar).filter(Boolean));
  const vazio = (v) => String(v ?? '').trim() === '';

  const mapa = new Map();
  let ignoradas = 0, repetidas = 0, porDestino = 0, pesosNegativos = 0;
  for (const linha of linhas.slice(inicio)) {
    if (!linha || linha.every(vazio)) continue; // linha em branco
    // Linha de totais no fim da 967: tem número, mas não tem destino nem data
    if (col.destino >= 0 && col.data >= 0 && vazio(linha[col.destino]) && vazio(linha[col.data])) { ignoradas++; continue; }
    const num = lerNumeroCarregamento(linha[col.carregamento]);
    if (!num) { ignoradas++; continue; }
    const destino = col.destino >= 0 ? String(linha[col.destino] ?? '').trim() : null;
    if (destino && ignorarDestinos.has(normalizar(destino))) { porDestino++; continue; }
    let peso = col.peso >= 0 ? lerPeso(linha[col.peso]) : null;
    if (peso != null && peso < 0) { pesosNegativos++; peso = null; } // erro de cadastro no Winthor
    const item = {
      numero: num,
      destino,
      rota: col.rota >= 0 ? String(linha[col.rota] ?? '').trim() : null,
      peso,
      data_ref: (col.data >= 0 ? lerData(linha[col.data]) : null) || dataPadrao,
    };
    const ex = mapa.get(num);
    if (!ex) { mapa.set(num, item); continue; }
    repetidas++;
    if (somar && item.peso != null) ex.peso = (ex.peso || 0) + item.peso;
    for (const k of ['destino', 'rota']) {
      if (item[k] && ex[k] && !ex[k].split(' / ').includes(item[k])) ex[k] += ' / ' + item[k];
      else if (item[k] && !ex[k]) ex[k] = item[k];
    }
  }
  previa = [...mapa.values()].map((x) => ({ ...x, peso: x.peso != null ? Math.round(x.peso * 1000) / 1000 : null }));

  // Quais já existem no banco (serão atualizados)
  let existentes = new Set();
  try {
    existentes = new Set(await api('existentes967', { numeros: previa.map((x) => x.numero) }));
  } catch { /* sem sinal: prévia sem essa informação */ }
  previa.forEach((x) => (x._existe = existentes.has(x.numero)));

  const pesoTotal = previa.reduce((s, x) => s + (x.peso || 0), 0);
  $('#imp-resumo').innerHTML = [
    ['Carregamentos', previa.length],
    ['Novos', previa.filter((x) => !x._existe).length],
    ['Serão atualizados', previa.filter((x) => x._existe).length],
    ['Peso total (kg)', numero(pesoTotal)],
    ['Fora (destino ignorado)', porDestino],
    ['Linhas ignoradas', ignoradas],
    ['Linhas agrupadas', repetidas],
    ['Peso negativo (ficou sem peso)', pesosNegativos],
  ].map(([k, v]) => `<div class="kpi"><div class="rotulo">${k}</div><div class="valor">${v}</div></div>`).join('');

  $('#imp-previa').innerHTML = previa.length ? previa.slice(0, 50).map((x) => `<tr>
    <td><b>${esc(x.numero)}</b></td><td>${esc(x.destino)}</td><td>${esc(x.rota)}</td><td class="num">${numero(x.peso)}</td>
    <td>${x.data_ref.split('-').reverse().join('/')}</td>
    <td>${x._existe ? '<span class="selo alerta">Atualizar</span>' : '<span class="selo sucesso">Novo</span>'}</td></tr>`).join('')
    + (previa.length > 50 ? `<tr><td colspan="6" class="vazio">... e mais ${previa.length - 50} carregamento(s)</td></tr>` : '')
    : '<tr><td colspan="6" class="vazio">Nenhum número de carregamento válido encontrado. Confira a coluna e a linha do cabeçalho.</td></tr>';
  $('#imp-confirmar').disabled = previa.length === 0;
  box.hidden = false;
}

async function confirmar() {
  if (!previa.length) return;
  if (!confirm(`Importar ${previa.length} carregamento(s) da 967?`)) return;
  const col = colunas();
  const btn = $('#imp-confirmar');
  btn.disabled = true;
  // Só envia as colunas mapeadas, para não apagar dados de importações anteriores
  const registros = previa.map((x) => {
    const r = { numero: x.numero, data_ref: x.data_ref };
    if (col.destino >= 0) r.destino = x.destino;
    if (col.rota >= 0) r.rota = x.rota;
    if (col.peso >= 0) r.peso = x.peso;
    return r;
  });
  try {
    const LOTE = 2000;
    for (let i = 0; i < registros.length; i += LOTE) {
      $('#imp-status').innerHTML = `<div class="aviso info">Enviando ${Math.min(i + LOTE, registros.length)} de ${registros.length}...</div>`;
      await api('importar967', { registros: registros.slice(i, i + LOTE) }, { tempo: 120000 });
    }
    $('#imp-status').innerHTML = `<div class="aviso sucesso">Importação concluída: ${registros.length} carregamento(s).</div>`;
    toast('967 importada com sucesso.', 'sucesso');
    $('#imp-arquivo').value = '';
  } catch (e) {
    $('#imp-status').innerHTML = `<div class="aviso erro">Erro na importação: ${esc(mensagemErro(e))}</div>`;
    btn.disabled = false;
  }
}
