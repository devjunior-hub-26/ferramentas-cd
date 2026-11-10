// Quadro da Expedição: organograma, chamada, histórico, férias e hierarquia.
//
// IMPORTANTE: a lista de colaboradores NÃO pode ficar neste código, porque o
// repositório é público. Ela é importada de um arquivo e fica na planilha.
import { exigirLogin, PERFIS, mensagemErro } from '../../assets/js/auth.js';
import { api } from '../../assets/js/api.js';
import { $, $$, esc, toast, iniciarAbas, hojeISO } from '../../assets/js/ui.js';
import { icone } from '../../assets/js/icones.js';

const perfil = await exigirLogin(['admin']);

$('#btn-voltar').innerHTML = icone('voltar');
$('#t-usuario').textContent = `${perfil.nome} · ${PERFIS[perfil.perfil]}`;
$$('[data-icone]').forEach((el) => el.insertAdjacentHTML('afterbegin', icone(el.dataset.icone)));

// ---------- Constantes ----------
const CHAVE = 'cd-expedicao';
const agora = new Date();
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SETORES = ['EXPEDIÇÃO', 'EXPEDIÇÃO ADEGA', 'EXPEDIÇÃO CAMINHÃO', 'CONFERENCIA'];
const NO_L = 190, NO_A = 92, ESP_H = 18, ESP_V = 60, LINHA_GRUPO = 18;
const COR_LINHA = '#CBD5E6';

const STATUS = {
  presente: { rotulo: 'Presente', plural: 'Presentes', selo: 'sucesso' },
  falta: { rotulo: 'Falta', plural: 'Faltas', selo: 'erro' },
  atestado: { rotulo: 'Atestado', plural: 'Atestados', selo: 'alerta' },
  segundo_turno: { rotulo: '2º Turno', plural: '2º Turno', selo: '' },
  folga: { rotulo: 'Folga', plural: 'Folgas', selo: 'neutro' },
  ferias: { rotulo: 'Férias', plural: 'Férias', selo: 'marinho' },
};
const ORDEM_STATUS = [null, ...Object.keys(STATUS)];
const AUSENCIAS = ORDEM_STATUS.slice(2);
const selo = (st) => (st && STATUS[st]
  ? `<span class="selo ${STATUS[st].selo}">${STATUS[st].rotulo}</span>`
  : '<span class="selo vazio">Não marcado</span>');

// ---------- Estado ----------
let colaboradores = [];
let chamada = {};
let historico = [];
let abaAtual = 'org';
let abasProntas = false;
let filtroOrg = 'all', filtroAtt = 'all', filtroFerias = 'all', filtroFeriasMes = 'all', filtroMotivo = 'all';
let colOrdem = 'NIVEL', ordemAsc = true;
let editando = null;
let classificacao = {};
let relSetor = 'all';
let pendentes = { chamada: {}, ferias: {} };
let timerEnvio = null;
let envioAtual = null;
let servidorRespondeu = false;
let fotoAtual = null;

const funcao = (e) => e['Nome Funcão'] || '';
const primeiros = (nome, n) => nome.split(' ').slice(0, n).join(' ');
const statusDe = (c) => chamada[c] || null;
const contar = (st, lista = colaboradores) => lista.filter((e) => statusDe(e.Chapa) === st).length;
const kpi = (rotulo, valor) => `<div class="kpi"><div class="rotulo">${esc(rotulo)}</div><div class="valor">${esc(valor)}</div></div>`;
const hojeArquivo = () => hojeISO();

// ---------- Servidor (planilha) e cópia local ----------
// Os dados ficam na planilha. A cópia local abre a tela mais rápido e guarda
// as marcações feitas sem sinal até conseguir enviar.
function guardarCopia() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ employees: colaboradores, attendance: chamada, history: historico, pendentes }));
  } catch { /* sem espaço: os dados continuam no servidor */ }
}

const qtdPendente = () => Object.keys(pendentes.chamada).length + Object.keys(pendentes.ferias).length;

function mostrarSync(rotulo, semSinal = false) {
  $('#sync-status').textContent = rotulo;
  $('#sync-status').classList.toggle('off', semSinal);
  const n = qtdPendente();
  $('#sync-pend').hidden = !(semSinal && n);
  $('#sync-pend').textContent = n;
  $('#dados-status').textContent = semSinal
    ? 'Sem conexão: as marcações serão enviadas quando o sinal voltar.'
    : 'Dados guardados na planilha do servidor.';
}

function agendarEnvio() {
  guardarCopia();
  mostrarSync('Salvando…');
  clearTimeout(timerEnvio);
  timerEnvio = setTimeout(enviarPendentes, 800);
}

function marcar(chapa, status) {
  chamada[chapa] = status;
  pendentes.chamada[chapa] = status;
}

// Envia chamada e férias em lote. O que falhar volta para a fila.
async function enviarPendentes() {
  clearTimeout(timerEnvio);
  while (envioAtual) await envioAtual;
  if (!qtdPendente()) return true;
  const lote = pendentes;
  pendentes = { chamada: {}, ferias: {} };
  let ok = true;
  mostrarSync('Salvando…');
  envioAtual = api('expedicaoSalvar', lote).catch((e) => {
    ok = false;
    pendentes = { chamada: { ...lote.chamada, ...pendentes.chamada }, ferias: { ...lote.ferias, ...pendentes.ferias } };
    if (e.codigo !== 'REDE') toast(mensagemErro(e), 'erro');
  }).finally(() => { envioAtual = null; });
  await envioAtual;
  guardarCopia();
  mostrarSync(ok ? 'Salvo' : 'Sem conexão', !ok);
  return ok;
}

/** Gravações que precisam da resposta do servidor antes de valer na tela. */
async function noServidor(acao, dados) {
  try {
    mostrarSync('Salvando…');
    const r = await api(acao, dados);
    mostrarSync('Salvo');
    return r;
  } catch (e) {
    mostrarSync(e.codigo === 'REDE' ? 'Sem conexão' : 'Salvo', e.codigo === 'REDE');
    toast(mensagemErro(e), 'erro');
    return null;
  }
}

function normalizarColaboradores(lista) {
  const vistos = new Set();
  return lista.map((e) => ({
    Chapa: Number(e.Chapa),
    Nome: String(e.Nome ?? '').trim(),
    'Nome Funcão': String(e['Nome Funcão'] ?? '').trim(),
    Setor: String(e.Setor ?? '').trim(),
    NIVEL: String(e.NIVEL ?? '').trim(),
    Admissao: /^\d{4}-\d{2}-\d{2}$/.test(e.Admissao) ? e.Admissao : '',
    FeriasMes: Number.isInteger(e.FeriasMes) && e.FeriasMes >= 0 && e.FeriasMes < 12 ? e.FeriasMes : null,
  })).filter((e) => {
    if (!Number.isSafeInteger(e.Chapa) || e.Chapa <= 0 || !e.Nome || vistos.has(e.Chapa)) return false;
    vistos.add(e.Chapa);
    return true;
  });
}

function normalizarStatus(v) {
  if (v === true) return 'presente';
  return STATUS[v] ? v : null;
}

const historicoValido = (lista) => lista.filter((d) => typeof d?.date === 'string' && d.snapshot && typeof d.snapshot === 'object');

function aplicarEstado(estado) {
  colaboradores = normalizarColaboradores(estado.employees || []);
  const salvo = estado.attendance || {};
  chamada = {};
  colaboradores.forEach((e) => { chamada[e.Chapa] = normalizarStatus(salvo[e.Chapa]); });
  historico = Array.isArray(estado.history) ? historicoValido(estado.history) : [];
}

// Marcações ainda não enviadas valem mais do que o que veio do servidor.
function reaplicarPendentes() {
  Object.entries(pendentes.chamada).forEach(([c, st]) => { if (c in chamada) chamada[c] = st; });
  Object.entries(pendentes.ferias).forEach(([c, m]) => {
    const e = colaboradores.find((x) => x.Chapa === Number(c));
    if (e) e.FeriasMes = m;
  });
}

function carregarCopia() {
  try {
    const estado = JSON.parse(localStorage.getItem(CHAVE));
    if (!estado) return;
    aplicarEstado(estado);
    if (estado.pendentes) pendentes = { chamada: estado.pendentes.chamada || {}, ferias: estado.pendentes.ferias || {} };
  } catch { /* cópia inválida: busca no servidor */ }
}

function mostrarAviso(texto) {
  $('#aviso-caixa').hidden = !texto;
  $('#aviso').textContent = texto || '';
}

async function carregarDoServidor() {
  try {
    await enviarPendentes();
    aplicarEstado(await api('expedicaoDados'));
    servidorRespondeu = true;
    reaplicarPendentes();
    mostrarAviso('');
    mostrarSync(qtdPendente() ? 'Sem conexão' : 'Salvo', !!qtdPendente());
    if (preencherFeriasNaChamada()) agendarEnvio(); else guardarCopia();
  } catch (e) {
    if (e.codigo === 'ACAO_INVALIDA') {
      mostrarAviso('O servidor do Google precisa ser atualizado: publique a Nova versão do Apps Script.');
    } else if (e.codigo === 'REDE') {
      mostrarSync('Sem conexão', true);
      mostrarAviso(colaboradores.length
        ? 'Sem conexão: mostrando a última cópia. Chamada e férias serão enviadas quando o sinal voltar.'
        : 'Sem conexão com o servidor. Abra de novo quando tiver sinal.');
    } else {
      mostrarAviso(mensagemErro(e));
    }
  }
}

// Aceita backup .json, lista de colaboradores .json ou o arquivo .html do quadro.
async function importarArquivo(arquivo) {
  const texto = await arquivo.text();
  let estado = null;
  try { estado = JSON.parse(texto); } catch { /* não é JSON: procura a lista no HTML */ }
  const bruta = Array.isArray(estado) ? estado
    : estado?.employees || (texto.match(/\{"Chapa":[^{}]*\}/g) || []).map((s) => JSON.parse(s));
  const novos = normalizarColaboradores(bruta);
  const lista = novos.length ? novos : colaboradores;
  if (!novos.length && !(estado?.attendance && lista.length)) throw new Error('Nenhum colaborador encontrado neste arquivo.');
  if (colaboradores.length && !(await confirmar('Substituir os dados atuais pelos do arquivo?', 'Substituir', true))) return;
  await enviarPendentes();
  const dados = { employees: lista };
  if (estado?.attendance) {
    dados.attendance = {};
    lista.forEach((e) => { dados.attendance[e.Chapa] = normalizarStatus(estado.attendance[e.Chapa]); });
  }
  if (Array.isArray(estado?.history)) dados.history = historicoValido(estado.history);
  toast(`Enviando ${lista.length} colaboradores para o servidor…`);
  if (!(await noServidor('expedicaoImportar', dados))) return;
  await carregarDoServidor();
  atualizarTela();
  toast(`${colaboradores.length} colaboradores guardados no servidor.`, 'sucesso');
}

function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function baixarBackup() {
  const estado = { versao: 8, salvoEm: new Date().toISOString(), employees: colaboradores, attendance: chamada, history: historico };
  baixarArquivo(new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' }), `expedicao_${hojeArquivo()}.json`);
  toast('Backup baixado. Guarde em local seguro: ele tem dados dos colaboradores.', 'sucesso');
}

function baixarExcel(nome, abas) {
  if (!window.XLSX) { toast('Excel indisponível sem internet.', 'erro'); return false; }
  const livro = XLSX.utils.book_new();
  abas.forEach(([titulo, linhas]) => XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), titulo));
  XLSX.writeFile(livro, nome);
  return true;
}

// ---------- Foto: prévia com Compartilhar e Baixar ----------
// O compartilhamento exige um toque na tela logo antes, por isso a foto é
// gerada primeiro e o botão aparece na janela de prévia.
function mostrarFoto(canvas, nome, titulo) {
  canvas.toBlob((blob) => {
    if (!blob) { toast('Erro ao gerar a imagem.', 'erro'); return; }
    if (fotoAtual) URL.revokeObjectURL(fotoAtual.url);
    fotoAtual = { blob, nome, url: URL.createObjectURL(blob) };
    $('#foto-titulo').textContent = titulo;
    $('#foto-img').src = fotoAtual.url;
    $('#dlg-foto').showModal();
  }, 'image/png');
}

function baixarFoto() {
  if (fotoAtual) baixarArquivo(fotoAtual.blob, fotoAtual.nome);
}

async function compartilharFoto() {
  if (!fotoAtual) return;
  const arquivo = new File([fotoAtual.blob], fotoAtual.nome, { type: 'image/png' });
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo] });
    } catch (e) {
      if (e.name !== 'AbortError') toast('Não foi possível compartilhar. Use Baixar.', 'erro');
    }
    return;
  }
  // Navegador sem compartilhamento de arquivos: copia para colar na conversa
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': fotoAtual.blob })]);
    toast('Imagem copiada. Cole na conversa com Ctrl+V.', 'sucesso');
  } catch {
    baixarFoto();
    toast('Este navegador não compartilha imagens. A foto foi baixada.', 'alerta');
  }
}

function confirmar(mensagem, rotulo = 'Confirmar', perigo = false) {
  const d = $('#dlg-confirmar');
  $('#confirmar-msg').textContent = mensagem;
  const ok = $('#confirmar-ok');
  ok.textContent = rotulo;
  ok.className = `btn pequeno${perigo ? ' perigo' : ''}`;
  d.returnValue = '';
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'sim'), { once: true });
    d.showModal();
  });
}

// ---------- Datas e níveis ----------
const nivelNum = (n) => (n ? parseFloat(n.replace(/[^0-9.]/g, '')) || 999 : 999);
const nivelFaixa = (n) => (n ? parseInt(n.split('.')[0], 10) || 99 : 99);
const nivelProf = (n) => (n ? n.split('.').slice(1).filter((p) => p !== '0').length : 0);
const nivelRank = (n) => nivelFaixa(n) * 10 + nivelProf(n);
const dataBR = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
};

function vencimento(admissao) {
  if (!admissao) return null;
  const adm = new Date(`${admissao}T00:00:00`);
  if (isNaN(adm)) return null;
  const venc = new Date(adm);
  venc.setFullYear(agora.getFullYear());
  if (venc <= agora) venc.setFullYear(venc.getFullYear() + 1);
  return venc;
}

function mesLimite(admissao) {
  if (!admissao) return null;
  const d = new Date(`${admissao}T00:00:00`);
  return isNaN(d) ? null : d.getMonth();
}

function seloVencimento(admissao) {
  const v = vencimento(admissao);
  if (!v) return '<span class="selo neutro">Sem admissão</span>';
  const dias = Math.ceil((v - agora) / 86400000);
  if (dias < 90) return `<span class="selo alerta">Vence em ${dias}d</span>`;
  return `<span class="selo sucesso">Vence ${v.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>`;
}

function classeNo(f) {
  const r = f.toUpperCase();
  if (r.includes('SUPERVISOR')) return 'sup';
  if (r.includes('LIDER') || r.includes('LÍDER') || r.includes('SUB ENCARREGADO')) return 'sub';
  if (r.includes('ANALISTA') || r.includes('ASSISTENTE')) return 'lider';
  if (r.includes('CONFERENTE')) return 'conf';
  return 'aux';
}

function preencherFeriasNaChamada() {
  let mudou = false;
  colaboradores.forEach((e) => {
    if (e.FeriasMes === agora.getMonth() && !chamada[e.Chapa]) { marcar(e.Chapa, 'ferias'); mudou = true; }
  });
  return mudou;
}

// ---------- Organograma ----------
function montarArvore(lista) {
  const mapa = {};
  lista.forEach((e) => {
    const n = e.NIVEL || '?';
    if (!mapa[n]) mapa[n] = { nivel: n, pessoas: [], filhos: [], pai: null, rank: nivelRank(n) };
    mapa[n].pessoas.push(e);
  });
  const ordenados = Object.values(mapa).sort((a, b) => nivelNum(a.nivel) - nivelNum(b.nivel));
  ordenados.forEach((no, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (ordenados[j].rank < no.rank) {
        no.pai = ordenados[j].nivel;
        ordenados[j].filhos.push(no);
        break;
      }
    }
  });
  ordenados.forEach((n) => n.filhos.sort((a, b) => nivelNum(a.nivel) - nivelNum(b.nivel)));
  return ordenados.filter((n) => !n.pai);
}

const alturaNo = (no) => (!no.filhos.length && no.pessoas.length > 1 ? 40 + no.pessoas.length * LINHA_GRUPO + 8 : NO_A);

function posicionar(raizes) {
  const pos = new Map();
  const largura = (no) => (no.filhos.length
    ? Math.max(NO_L, no.filhos.reduce((s, f) => s + largura(f), 0) + (no.filhos.length - 1) * ESP_H)
    : NO_L);
  function colocar(no, esq, topo) {
    const a = alturaNo(no);
    let x = esq + largura(no) / 2 - NO_L / 2;
    if (no.filhos.length) {
      let e = esq;
      no.filhos.forEach((f) => { colocar(f, e, topo + a + ESP_V); e += largura(f) + ESP_H; });
      x = (pos.get(no.filhos[0].nivel).x + pos.get(no.filhos[no.filhos.length - 1].nivel).x) / 2;
    }
    pos.set(no.nivel, { x, y: topo, a, no });
  }
  let esq = 40;
  raizes.forEach((r) => { colocar(r, esq, 40); esq += largura(r) + ESP_H * 3; });
  return pos;
}

function cartaoPessoa(e, x, y) {
  return `<div class="no ${classeNo(funcao(e))}" style="left:${x}px;top:${y}px;width:${NO_L}px;height:${NO_A}px;">
    <strong>${esc(primeiros(e.Nome, 3))}</strong>
    <small>${esc(funcao(e))}</small>
    <span class="nivel">Nível ${esc(e.NIVEL)}</span>
    <span class="setor">${esc(e.Setor)}</span>
  </div>`;
}

function renderOrg() {
  const kpis = [['Total', colaboradores.length], ['Exp. Adega', 'EXPEDIÇÃO ADEGA'], ['Exp. Caminhão', 'EXPEDIÇÃO CAMINHÃO'], ['Conferência', 'CONFERENCIA'], ['Expedição', 'EXPEDIÇÃO']];
  $('#org-kpis').innerHTML = kpis.map(([r, s]) => kpi(r, typeof s === 'number' ? s : colaboradores.filter((e) => e.Setor === s).length)).join('');

  const lista = filtroOrg === 'all' ? colaboradores
    : colaboradores.filter((e) => e.Setor === filtroOrg || /SUPERVISOR|ANALISTA/i.test(funcao(e)));
  const area = $('#org-area'), svg = $('#org-svg'), nos = $('#org-nos');
  if (!lista.length) {
    nos.innerHTML = '<p class="carregando">Nenhum colaborador neste filtro.</p>';
    svg.innerHTML = '';
    area.style.cssText = 'width:100%;height:420px;';
    return;
  }
  const pos = posicionar(montarArvore(lista));
  let maxX = 0, maxY = 0, linhas = '', html = '';
  pos.forEach(({ x, y, a, no }) => {
    const grupo = !no.filhos.length && no.pessoas.length > 1;
    const extras = grupo ? 0 : no.pessoas.length - 1;
    maxX = Math.max(maxX, x + NO_L + extras * (NO_L + 8) + 40);
    maxY = Math.max(maxY, y + a + 40);
    no.filhos.forEach((f) => {
      const c = pos.get(f.nivel);
      const px = x + NO_L / 2, py = y + a, cx = c.x + NO_L / 2, my = py + ESP_V / 2;
      linhas += `<path d="M${px},${py} L${px},${my} L${cx},${my} L${cx},${c.y}" fill="none" stroke="${COR_LINHA}" stroke-width="2"/>`;
    });
    if (grupo) {
      const f0 = funcao(no.pessoas[0]);
      html += `<div class="no grupo ${classeNo(f0)}" style="left:${x}px;top:${y}px;width:${NO_L}px;">
        <div class="grupo-titulo">${esc(f0)} (${no.pessoas.length})</div>
        ${no.pessoas.map((e) => `<div class="membro" title="${esc(e.Nome)}">${esc(primeiros(e.Nome, 2))}</div>`).join('')}
      </div>`;
    } else {
      no.pessoas.forEach((e, i) => { html += cartaoPessoa(e, x + (NO_L + 8) * i, y); });
    }
  });
  const L = Math.max(maxX, 600), A = Math.max(maxY, 420);
  area.style.cssText = `width:${L}px;height:${A}px;`;
  svg.setAttribute('width', L);
  svg.setAttribute('height', A);
  svg.innerHTML = linhas;
  nos.innerHTML = html;
}

async function fotoOrg() {
  if (!window.html2canvas) { toast('Foto indisponível sem internet.', 'erro'); return; }
  toast('Gerando imagem…');
  try {
    const area = $('#org-area');
    const tela = await html2canvas(area, { scale: 2, backgroundColor: '#F3F6FC', useCORS: true, scrollX: 0, scrollY: 0, width: area.scrollWidth, height: area.scrollHeight });
    mostrarFoto(tela, `organograma_expedicao_${hojeArquivo()}.png`, 'Foto do organograma');
  } catch {
    toast('Erro ao gerar a imagem.', 'erro');
  }
}

// ---------- Chamada ----------
function renderChamada() {
  const total = colaboradores.length;
  const pres = contar('presente');
  const naoMarcados = contar(null);
  const pct = total ? Math.round((pres / total) * 100) : 0;
  $('#att-kpis').innerHTML = kpi('Total', total)
    + Object.keys(STATUS).map((s) => kpi(STATUS[s].plural, contar(s))).join('')
    + (naoMarcados ? kpi('Não marcados', naoMarcados) : '');
  $('#att-barra').style.width = `${pct}%`;
  $('#att-pct').textContent = `${pct}% presença`;

  const setores = filtroAtt === 'all' ? SETORES : [filtroAtt];
  $('#att-lista').innerHTML = setores.map((setor) => {
    const membros = colaboradores.filter((e) => e.Setor === setor).sort((a, b) => a.Nome.localeCompare(b.Nome));
    if (!membros.length) return '';
    return `<div class="setor-bloco">
      <h3>${esc(setor)} <span class="selo">${contar('presente', membros)}/${membros.length} presentes</span></h3>
      <div class="pessoas">${membros.map((e) => {
    const st = statusDe(e.Chapa);
    return `<button class="pessoa ${st ? `st-${st}` : ''}" data-acao="ciclo" data-chapa="${e.Chapa}">
          <span class="dados"><b>${esc(e.Nome)}</b><small>${esc(funcao(e))}</small></span>${selo(st)}
        </button>`;
  }).join('')}</div>
    </div>`;
  }).join('');
}

function marcarTodos(valor) {
  const lista = filtroAtt === 'all' ? colaboradores : colaboradores.filter((e) => e.Setor === filtroAtt);
  lista.forEach((e) => { marcar(e.Chapa, valor); });
  if (valor === null) preencherFeriasNaChamada();
  agendarEnvio();
  renderChamada();
}

function abrirExportar() {
  const ausentes = colaboradores.filter((e) => statusDe(e.Chapa) !== 'presente').sort((a, b) => a.Nome.localeCompare(b.Nome));
  classificacao = {};
  if (!ausentes.length) { gerarPNGChamada(); return; }
  ausentes.forEach((e) => {
    const st = statusDe(e.Chapa);
    classificacao[e.Chapa] = AUSENCIAS.includes(st) ? st : 'falta';
  });
  $('#exportar-lista').innerHTML = ausentes.map((e) => `<div class="ausente">
    <div class="dados"><b>${esc(e.Nome)}</b><small>${esc(funcao(e))} · ${esc(e.Setor)}</small></div>
    <div class="chips">${AUSENCIAS.map((st) => `<button class="chip ${classificacao[e.Chapa] === st ? 'ativo' : ''}" data-acao="classificar" data-chapa="${e.Chapa}" data-valor="${st}">${STATUS[st].rotulo}</button>`).join('')}</div>
  </div>`).join('');
  $('#dlg-exportar').showModal();
}

function secaoPNG(titulo, lista) {
  if (!lista.length) return '';
  return `<div class="pa-secao"><h4>${esc(titulo)} (${lista.length})</h4>
    <div class="pa-itens">${lista.map((e) => `<span>${esc(e.Nome)} <small>(${esc(funcao(e))})</small></span>`).join('')}</div></div>`;
}

async function gerarPNGChamada() {
  if (!window.html2canvas) { toast('PNG indisponível sem internet.', 'erro'); return; }
  const d = new Date();
  const total = colaboradores.length;
  const pres = contar('presente');
  const pct = total ? Math.round((pres / total) * 100) : 0;
  const naoMarcados = colaboradores.filter((e) => !statusDe(e.Chapa));
  const secoes = AUSENCIAS.map((st) => secaoPNG(STATUS[st].plural, colaboradores.filter((e) => statusDe(e.Chapa) === st))).join('');
  const el = $('#print-area');
  el.innerHTML = `<div class="pa-topo"><div><strong>Chamada · Expedição</strong><small>${d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</small></div></div>
    <div class="pa-kpis">
      <div class="pa-kpi"><b>${total}</b><span>Total</span></div>
      ${Object.keys(STATUS).map((s) => `<div class="pa-kpi"><b>${contar(s)}</b><span>${STATUS[s].plural}</span></div>`).join('')}
      <div class="pa-kpi"><b>${pct}%</b><span>Presença</span></div>
    </div>
    ${secoes}${secaoPNG('Não marcados', naoMarcados)}
    ${pres === total ? '<div class="pa-ok">Todos presentes!</div>' : ''}
    <div class="pa-rodape"><span>Quadro da Expedição</span><span>Gerado em ${d.toLocaleString('pt-BR')}</span></div>`;
  el.style.cssText = 'display:block;position:fixed;top:-9999px;left:0;';
  try {
    const tela = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    mostrarFoto(tela, `chamada_${hojeArquivo()}.png`, 'Foto da chamada');
  } catch {
    toast('Erro ao gerar o PNG.', 'erro');
  } finally {
    el.style.cssText = '';
  }
}

async function salvarHistorico() {
  const dia = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const existe = historico.some((h) => h.date === dia);
  if (!(await confirmar(existe ? `Já existe um registro para hoje (${dia}). Substituir?` : `Salvar a chamada de ${dia} no histórico?`, existe ? 'Substituir' : 'Salvar'))) return;
  const foto = {};
  colaboradores.forEach((e) => { foto[e.Chapa] = statusDe(e.Chapa); });
  const salvo = await noServidor('expedicaoSalvarDia', { date: dia, obs: '', snapshot: foto });
  if (!salvo) return;
  historico = [salvo, ...historico.filter((h) => h.date !== dia)].slice(0, 365);
  guardarCopia();
  toast('Chamada salva no histórico.', 'sucesso');
}

// ---------- Histórico ----------
function dataDoDia(texto) {
  const [d, m, a] = texto.split('/');
  return new Date(`${a}-${m}-${d}T00:00:00`);
}

function historicoFiltrado() {
  const de = $('#hist-de').value ? new Date(`${$('#hist-de').value}T00:00:00`) : null;
  const ate = $('#hist-ate').value ? new Date(`${$('#hist-ate').value}T23:59:59`) : null;
  return historico.filter((dia) => {
    const d = dataDoDia(dia.date);
    if (de && d < de) return false;
    if (ate && d > ate) return false;
    return filtroMotivo === 'all' || Object.values(dia.snapshot).includes(filtroMotivo);
  });
}

const contarFoto = (foto, st) => Object.values(foto).filter((v) => v === st).length;

function renderHistorico() {
  const dias = historicoFiltrado();
  const mapa = Object.fromEntries(colaboradores.map((e) => [e.Chapa, e]));
  $('#hist-kpis').innerHTML = kpi('Dias', dias.length)
    + AUSENCIAS.map((st) => kpi(STATUS[st].plural, dias.reduce((s, d) => s + contarFoto(d.snapshot, st), 0))).join('');
  $('#hist-info').textContent = `${dias.length} de ${historico.length} registros`;
  if (!dias.length) {
    $('#hist-lista').innerHTML = '<p class="carregando">Nenhum registro encontrado para os filtros selecionados.</p>';
    return;
  }
  const peso = { presente: 0, segundo_turno: 1, ferias: 2, folga: 3, atestado: 4, falta: 5 };
  $('#hist-lista').innerHTML = dias.map((dia) => {
    const foto = dia.snapshot;
    const chapas = Object.keys(foto);
    const pct = chapas.length ? Math.round((contarFoto(foto, 'presente') / chapas.length) * 100) : 0;
    const selos = Object.keys(STATUS).map((st) => {
      const n = contarFoto(foto, st);
      return n ? `<span class="selo ${STATUS[st].selo}">${STATUS[st].rotulo} ${n}</span>` : '';
    }).join('');
    const pessoas = chapas
      .filter((c) => filtroMotivo === 'all' || foto[c] === filtroMotivo)
      .sort((a, b) => (peso[foto[a]] ?? 9) - (peso[foto[b]] ?? 9))
      .map((c) => (mapa[c] ? `<div class="pessoa-dia"><span>${esc(primeiros(mapa[c].Nome, 2))}</span>${selo(foto[c])}</div>` : ''))
      .join('');
    return `<details class="cartao dia">
      <summary><strong>${esc(dia.date)}</strong><span class="suave">${pct}% presença</span><span class="selos">${selos}</span></summary>
      <div class="pessoas-dia">${pessoas}</div>
    </details>`;
  }).join('');
}

async function limparHistorico() {
  if (!historico.length) { toast('O histórico já está vazio.'); return; }
  if (!(await confirmar(`Apagar ${historico.length} registros do histórico? Não dá para desfazer.`, 'Apagar', true))) return;
  if (!(await noServidor('expedicaoLimparHistorico'))) return;
  historico = [];
  guardarCopia();
  renderHistorico();
  toast('Histórico limpo.', 'sucesso');
}

function exportarHistorico() {
  const dias = historicoFiltrado();
  if (!dias.length) { toast('Nenhum dado para exportar.'); return; }
  const mapa = Object.fromEntries(colaboradores.map((e) => [e.Chapa, e]));
  const resumo = [['Data', 'Presentes', ...AUSENCIAS.map((s) => STATUS[s].plural), 'Total', '% Presença', 'Observação']];
  const detalhe = [['Data', 'Chapa', 'Nome', 'Função', 'Setor', 'Status']];
  const faltas = {};
  dias.forEach((dia) => {
    const foto = dia.snapshot;
    const total = Object.keys(foto).length;
    const p = contarFoto(foto, 'presente');
    resumo.push([dia.date, p, ...AUSENCIAS.map((s) => contarFoto(foto, s)), total, total ? `${Math.round((p / total) * 100)}%` : '—', dia.obs || '']);
    Object.entries(foto).forEach(([c, st]) => {
      const e = mapa[c];
      if (e) detalhe.push([dia.date, Number(c), e.Nome, funcao(e), e.Setor, STATUS[st]?.rotulo || 'Não marcado']);
      if (st === 'falta' || st === 'atestado') faltas[c] = (faltas[c] || 0) + 1;
    });
  });
  const ranking = [['Nome', 'Função', 'Setor', 'Faltas + Atestados']];
  Object.entries(faltas).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
    if (mapa[c]) ranking.push([mapa[c].Nome, funcao(mapa[c]), mapa[c].Setor, n]);
  });
  if (baixarExcel(`historico_expedicao_${hojeArquivo()}.xlsx`, [['Resumo por dia', resumo], ['Detalhe colaboradores', detalhe], ['Ranking faltas', ranking]])) {
    toast(`Excel exportado: ${dias.length} dias.`, 'sucesso');
  }
}

// ---------- Férias ----------
function renderFerias() {
  const doSetor = filtroFerias === 'all' ? colaboradores : colaboradores.filter((e) => e.Setor === filtroFerias);
  let lista = [...doSetor];
  if (filtroFeriasMes === 'prog') lista = lista.filter((e) => e.FeriasMes !== null);
  else if (filtroFeriasMes !== 'all') lista = lista.filter((e) => e.FeriasMes === filtroFeriasMes);
  lista.sort((a, b) => (nivelNum(a.NIVEL) - nivelNum(b.NIVEL)) || a.Nome.localeCompare(b.Nome));
  $('#ferias-info').textContent = `${doSetor.filter((e) => e.FeriasMes !== null).length}/${doSetor.length} programados · exibindo ${lista.length}`;
  const cabeca = `<div class="fer-linha cabeca"><div>Colaborador</div>${MESES.map((m) => `<div>${m}</div>`).join('')}</div>`;
  if (!lista.length) {
    $('#ferias-grade').innerHTML = `${cabeca}<p class="carregando">Nenhum colaborador encontrado.</p>`;
    return;
  }
  $('#ferias-grade').innerHTML = cabeca + lista.map((e) => {
    const limite = mesLimite(e.Admissao);
    const meses = MESES_NOME.map((nome, m) => {
      const prog = e.FeriasMes === m, lim = limite === m;
      return `<button class="mes ${prog ? 'prog' : ''} ${lim ? 'limite' : ''}" data-acao="feriasMes" data-chapa="${e.Chapa}" data-valor="${m}" title="${nome}${lim ? ' (mês limite)' : ''}" aria-label="${nome}${prog ? ', programado' : ''}${lim ? ', mês limite' : ''}">${prog ? 'F' : lim ? '!' : ''}</button>`;
    }).join('');
    return `<div class="fer-linha"><div class="fer-nome"><b title="${esc(e.Nome)}">${esc(primeiros(e.Nome, 2))}</b><small>${esc(funcao(e))}</small>${seloVencimento(e.Admissao)}</div>${meses}</div>`;
  }).join('');
}

function alternarFerias(chapa, mes) {
  const e = colaboradores.find((x) => x.Chapa === chapa);
  if (!e) return;
  const mesAtual = agora.getMonth();
  const eraAtual = e.FeriasMes === mesAtual;
  e.FeriasMes = e.FeriasMes === mes ? null : mes;
  if (e.FeriasMes === mesAtual) {
    if (!chamada[chapa]) marcar(chapa, 'ferias');
  } else if (eraAtual && chamada[chapa] === 'ferias') {
    marcar(chapa, null);
  }
  pendentes.ferias[chapa] = e.FeriasMes;
  agendarEnvio();
  renderFerias();
}

// ---------- Hierarquia ----------
function realce(texto, busca) {
  if (!busca) return esc(texto);
  const re = new RegExp(`(${busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return texto.split(re).map((p, i) => (i % 2 ? `<mark>${esc(p)}</mark>` : esc(p))).join('');
}

function renderHierarquia() {
  const q = $('#cfg-busca').value.toLowerCase();
  const valor = (e) => ({ NIVEL: nivelNum(e.NIVEL), funcao: funcao(e), Admissao: e.Admissao || '' }[colOrdem] ?? e[colOrdem]);
  const lista = colaboradores
    .filter((e) => e.Nome.toLowerCase().includes(q) || funcao(e).toLowerCase().includes(q) || e.Setor.toLowerCase().includes(q) || String(e.Chapa).includes(q))
    .sort((a, b) => {
      const va = valor(a), vb = valor(b);
      if (va < vb) return ordemAsc ? -1 : 1;
      if (va > vb) return ordemAsc ? 1 : -1;
      return a.Nome.localeCompare(b.Nome);
    });
  $$('#cfg-cabeca th[data-valor]').forEach((th) => {
    if (th.dataset.valor === colOrdem) th.dataset.seta = ordemAsc ? '↑' : '↓';
    else delete th.dataset.seta;
  });
  $('#cfg-corpo').innerHTML = lista.map((e) => `<tr>
    <td>${e.Chapa}</td>
    <td><b>${realce(e.Nome, q)}</b></td>
    <td>${esc(funcao(e))}</td>
    <td>${esc(e.Setor)}</td>
    <td><span class="selo">${esc(e.NIVEL || '—')}</span></td>
    <td>${e.Admissao ? dataBR(e.Admissao) : '<span class="selo alerta">Não informada</span>'}</td>
    <td>${e.FeriasMes !== null ? `<span class="selo marinho">${MESES_NOME[e.FeriasMes]}</span>` : '—'}</td>
    <td><div class="acoes">
      <button class="btn pequeno secundario" data-acao="editarColaborador" data-chapa="${e.Chapa}">Editar</button>
      <button class="btn pequeno perigo" data-acao="excluirColaborador" data-chapa="${e.Chapa}">Excluir</button>
    </div></td>
  </tr>`).join('') || '<tr><td colspan="8" class="vazio">Nenhum colaborador encontrado.</td></tr>';
}

function garantirOpcao(select, valor) {
  if (valor && ![...select.options].some((o) => o.value === valor)) select.add(new Option(valor, valor));
  select.value = valor || '';
}

function abrirColaborador(chapa) {
  editando = chapa;
  const e = chapa === null ? null : colaboradores.find((x) => x.Chapa === chapa);
  $('#form-colaborador').reset();
  $('#colab-titulo').textContent = e ? 'Editar colaborador' : 'Novo colaborador';
  $('#f-chapa').disabled = !!e;
  if (e) {
    $('#f-chapa').value = e.Chapa;
    $('#f-nome').value = e.Nome;
    $('#f-nivel').value = e.NIVEL;
    $('#f-admissao').value = e.Admissao;
    garantirOpcao($('#f-funcao'), funcao(e));
    garantirOpcao($('#f-setor'), e.Setor);
    $('#f-ferias').value = e.FeriasMes === null ? '' : e.FeriasMes;
  }
  $('#dlg-colaborador').showModal();
}

async function salvarColaborador() {
  const chapa = editando === null ? parseInt($('#f-chapa').value, 10) : editando;
  const mes = $('#f-ferias').value;
  const dados = {
    Nome: $('#f-nome').value.trim().toUpperCase(),
    'Nome Funcão': $('#f-funcao').value,
    Setor: $('#f-setor').value,
    NIVEL: $('#f-nivel').value.trim(),
    Admissao: $('#f-admissao').value,
    FeriasMes: mes === '' ? null : parseInt(mes, 10),
  };
  const novo = editando === null;
  if (novo && colaboradores.some((e) => e.Chapa === chapa)) { toast('Chapa já cadastrada.', 'erro'); return; }
  const botao = $('#form-colaborador [type=submit]');
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  const salvo = await noServidor('expedicaoSalvarColaborador', { Chapa: chapa, novo, ...dados });
  botao.disabled = false;
  botao.textContent = 'Salvar';
  if (!salvo) return;
  delete pendentes.ferias[chapa];
  if (novo) {
    colaboradores.push({ Chapa: chapa, ...dados });
    chamada[chapa] = null;
  } else {
    const i = colaboradores.findIndex((e) => e.Chapa === chapa);
    colaboradores[i] = { ...colaboradores[i], ...dados };
  }
  toast(novo ? 'Colaborador adicionado.' : 'Dados atualizados.', 'sucesso');
  $('#dlg-colaborador').close();
  guardarCopia();
  atualizarTela();
}

async function excluirColaborador(chapa) {
  const e = colaboradores.find((x) => x.Chapa === chapa);
  if (!e || !(await confirmar(`Remover ${e.Nome} (${funcao(e)})?`, 'Excluir', true))) return;
  // Some da tela na hora: o servidor leva alguns segundos para responder.
  const posicao = colaboradores.indexOf(e);
  const statusAntes = chamada[chapa];
  colaboradores = colaboradores.filter((x) => x.Chapa !== chapa);
  delete chamada[chapa];
  atualizarTela();
  toast(`Excluindo ${primeiros(e.Nome, 2)}…`);
  if (!(await noServidor('expedicaoExcluirColaborador', { chapa }))) {
    colaboradores.splice(posicao, 0, e);
    chamada[chapa] = statusAntes;
    atualizarTela();
    return;
  }
  delete pendentes.chamada[chapa];
  delete pendentes.ferias[chapa];
  guardarCopia();
  atualizarTela();
  toast('Colaborador removido.', 'sucesso');
}

// ---------- Relatório ----------
const ordemSetor = (a, b) => {
  const ia = SETORES.indexOf(a), ib = SETORES.indexOf(b);
  if (ia < 0 && ib < 0) return a.localeCompare(b);
  if (ia < 0) return 1;
  if (ib < 0) return -1;
  return ia - ib;
};
const setorDe = (e) => (e.Setor || 'SEM SETOR').toUpperCase();

function gruposRelatorio() {
  const q = $('#rel-busca').value.trim().toLowerCase();
  const grupos = {};
  colaboradores.filter((e) => (relSetor === 'all' || setorDe(e) === relSetor)
    && (!q || e.Nome.toLowerCase().includes(q) || String(e.Chapa).includes(q) || funcao(e).toLowerCase().includes(q)))
    .forEach((e) => { (grupos[setorDe(e)] ||= []).push(e); });
  return Object.keys(grupos).sort(ordemSetor).map((setor) => ({
    setor,
    pessoas: grupos[setor].sort((a, b) => (nivelRank(a.NIVEL) - nivelRank(b.NIVEL)) || a.Nome.localeCompare(b.Nome)),
  }));
}

function contagemFuncoes(pessoas) {
  const c = {};
  pessoas.forEach((e) => { const f = funcao(e) || '—'; c[f] = (c[f] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const linhaRelatorio = (e, i) => `<tr><td class="num">${i + 1}</td><td>${e.Chapa}</td><td><b>${esc(e.Nome)}</b></td><td>${esc(funcao(e) || '—')}</td><td>${esc(e.NIVEL || '—')}</td><td>${dataBR(e.Admissao)}</td></tr>`;
const CABECA_RELATORIO = '<tr><th class="num">#</th><th>Chapa</th><th>Nome</th><th>Função</th><th>Nível</th><th>Admissão</th></tr>';

function abrirRelatorio() {
  relSetor = 'all';
  $('#rel-busca').value = '';
  const setores = [...new Set(colaboradores.map(setorDe))].sort(ordemSetor);
  $('#rel-chips').innerHTML = ['all', ...setores].map((s) => `<button class="chip ${s === 'all' ? 'ativo' : ''}" data-acao="relSetor" data-valor="${esc(s)}">${s === 'all' ? 'Todos' : esc(s)}</button>`).join('');
  renderRelatorio();
  $('#dlg-relatorio').showModal();
}

function renderRelatorio() {
  const grupos = gruposRelatorio();
  const total = grupos.reduce((s, g) => s + g.pessoas.length, 0);
  $('#rel-geral').textContent = `Total geral: ${total} · ${grupos.length} setor(es)`;
  $('#rel-corpo').innerHTML = grupos.map((g) => `<div class="rel-bloco">
    <div class="rel-cabeca">
      <div class="linha"><strong>${esc(g.setor)}</strong><span class="selo marinho">Total: ${g.pessoas.length}</span></div>
      <div class="rel-funcoes">${contagemFuncoes(g.pessoas).map(([f, n]) => `<span class="selo vazio">${esc(f)} · ${n}</span>`).join('')}</div>
    </div>
    <div class="tabela-wrap"><table class="tabela"><thead>${CABECA_RELATORIO}</thead><tbody>${g.pessoas.map(linhaRelatorio).join('')}</tbody></table></div>
  </div>`).join('') || '<p class="carregando">Nenhum funcionário encontrado com os filtros atuais.</p>';
}

function imprimirRelatorio() {
  const grupos = gruposRelatorio();
  const total = grupos.reduce((s, g) => s + g.pessoas.length, 0);
  if (!total) { toast('Nenhum funcionário para imprimir.'); return; }
  const d = new Date();
  $('#print-rel').innerHTML = `<div class="pa-topo"><div><strong>Relatório de funcionários</strong><small>${d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${relSetor === 'all' ? 'Todos os setores' : esc(relSetor)}</small></div><span class="pa-total">${total}</span></div>
    <div class="pa-kpis">${grupos.map((g) => `<div class="pa-kpi"><b>${g.pessoas.length}</b><span>${esc(g.setor)}</span></div>`).join('')}</div>
    ${grupos.map((g) => `<div class="pr-bloco"><div class="pr-cabeca"><span>${esc(g.setor)}</span><span>Total: ${g.pessoas.length}</span></div>
      <table><thead>${CABECA_RELATORIO}</thead><tbody>${g.pessoas.map(linhaRelatorio).join('')}</tbody></table></div>`).join('')}
    <div class="pa-rodape"><span>Quadro da Expedição</span><span>Gerado em ${d.toLocaleString('pt-BR')}</span></div>`;
  $('#dlg-relatorio').close();
  document.body.classList.add('printing');
  setTimeout(() => window.print(), 120);
}
window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

function exportarRelatorio() {
  const grupos = gruposRelatorio();
  const total = grupos.reduce((s, g) => s + g.pessoas.length, 0);
  if (!total) { toast('Nenhum funcionário para exportar.'); return; }
  const lista = [['RELATÓRIO DE FUNCIONÁRIOS · EXPEDIÇÃO'], ['Gerado em', new Date().toLocaleString('pt-BR')], ['TOTAL GERAL', total], []];
  const resumo = [['Setor', 'Total de funcionários', '% do quadro']];
  const porFuncao = [['Setor', 'Função', 'Quantidade']];
  grupos.forEach((g) => {
    lista.push([g.setor, `TOTAL: ${g.pessoas.length}`], ['#', 'Chapa', 'Nome', 'Função', 'Nível', 'Admissão', 'Setor']);
    g.pessoas.forEach((e, i) => lista.push([i + 1, e.Chapa, e.Nome, funcao(e), e.NIVEL, dataBR(e.Admissao), g.setor]));
    lista.push([]);
    resumo.push([g.setor, g.pessoas.length, `${Math.round((g.pessoas.length / total) * 100)}%`]);
    contagemFuncoes(g.pessoas).forEach(([f, n]) => porFuncao.push([g.setor, f, n]));
  });
  resumo.push(['TOTAL GERAL', total, '100%']);
  if (baixarExcel(`relatorio_funcionarios_${hojeArquivo()}.xlsx`, [['Funcionarios por setor', lista], ['Resumo por setor', resumo], ['Setor x funcao', porFuncao]])) {
    toast(`Excel exportado: ${total} funcionários.`, 'sucesso');
  }
}

// ---------- Ações (todos os botões com data-acao) ----------
function marcarChip(el) {
  $$('.chip', el.parentElement).forEach((b) => b.classList.toggle('ativo', b === el));
}

const ACOES = {
  escolherArquivo: () => $('#arquivo').click(),
  baixarBackup,
  filtroOrg: (el) => { marcarChip(el); filtroOrg = el.dataset.valor; renderOrg(); },
  fotoOrg,
  compartilharFoto,
  baixarFoto,
  abrirRelatorio,
  relSetor: (el) => { marcarChip(el); relSetor = el.dataset.valor; renderRelatorio(); },
  imprimirRelatorio,
  exportarRelatorio,
  filtroAtt: (el) => { marcarChip(el); filtroAtt = el.dataset.valor; renderChamada(); },
  ciclo: (el) => {
    const c = Number(el.dataset.chapa);
    marcar(c, ORDEM_STATUS[(ORDEM_STATUS.indexOf(statusDe(c)) + 1) % ORDEM_STATUS.length]);
    agendarEnvio();
    renderChamada();
  },
  marcarTodos: () => marcarTodos('presente'),
  resetar: () => marcarTodos(null),
  abrirExportar,
  classificar: (el) => { marcarChip(el); classificacao[el.dataset.chapa] = el.dataset.valor; },
  confirmarExportar: () => {
    Object.entries(classificacao).forEach(([c, st]) => { marcar(c, st); });
    agendarEnvio();
    renderChamada();
    $('#dlg-exportar').close();
    gerarPNGChamada();
  },
  salvarHistorico,
  exportarHistorico,
  limparHistorico,
  periodo: (el) => {
    marcarChip(el);
    const dias = Number(el.dataset.valor);
    if (!dias) { $('#hist-de').value = ''; $('#hist-ate').value = ''; } else {
      const ini = new Date();
      ini.setDate(ini.getDate() - dias + 1);
      $('#hist-de').value = hojeISO(ini);
      $('#hist-ate').value = hojeISO();
    }
    renderHistorico();
  },
  motivo: (el) => { marcarChip(el); filtroMotivo = el.dataset.valor; renderHistorico(); },
  filtroFerias: (el) => { marcarChip(el); filtroFerias = el.dataset.valor; renderFerias(); },
  filtroFeriasMes: (el) => {
    marcarChip(el);
    const v = el.dataset.valor;
    filtroFeriasMes = v === 'all' || v === 'prog' ? v : Number(v);
    renderFerias();
  },
  feriasMes: (el) => alternarFerias(Number(el.dataset.chapa), Number(el.dataset.valor)),
  ordenar: (el) => {
    const col = el.dataset.valor;
    ordemAsc = colOrdem === col ? !ordemAsc : true;
    colOrdem = col;
    renderHierarquia();
  },
  novoColaborador: () => abrirColaborador(null),
  editarColaborador: (el) => abrirColaborador(Number(el.dataset.chapa)),
  excluirColaborador: (el) => excluirColaborador(Number(el.dataset.chapa)),
};

document.addEventListener('click', (ev) => {
  if (ev.target.matches('dialog.modal')) { ev.target.close(); return; }
  const fechar = ev.target.closest('[data-fechar]');
  if (fechar) { fechar.closest('dialog').close(); return; }
  const el = ev.target.closest('[data-acao]');
  if (el) ACOES[el.dataset.acao]?.(el);
});

$('#arquivo').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files[0];
  ev.target.value = '';
  if (!arquivo) return;
  try { await importarArquivo(arquivo); } catch (e) { toast(e.message || 'Arquivo inválido.', 'erro'); }
});
$('#form-colaborador').addEventListener('submit', (ev) => { ev.preventDefault(); salvarColaborador(); });
$('#cfg-busca').addEventListener('input', renderHierarquia);
$('#rel-busca').addEventListener('input', renderRelatorio);
['#hist-de', '#hist-ate'].forEach((id) => $(id).addEventListener('change', () => {
  $$('[data-acao="periodo"]').forEach((b) => b.classList.remove('ativo'));
  renderHistorico();
}));

// ---------- Início ----------
const TELAS = { org: renderOrg, att: renderChamada, hist: renderHistorico, ferias: renderFerias, cfg: renderHierarquia };

function atualizarTela() {
  const temDados = colaboradores.length > 0;
  $('#carregando-dados').hidden = temDados || servidorRespondeu || !$('#aviso-caixa').hidden;
  $('#sem-dados').hidden = temDados || !servidorRespondeu;
  $('#abas').hidden = !temDados;
  $('#principal').hidden = !temDados;
  if (!temDados) return;
  if (!abasProntas) {
    abasProntas = true;
    iniciarAbas($('#abas'), (id) => { abaAtual = id; TELAS[id](); });
  } else {
    TELAS[abaAtual]();
  }
}

$('#ferias-meses').innerHTML = [['all', 'Todos os meses'], ['prog', 'Programados'], ...MESES.map((m, i) => [i, m])]
  .map(([v, r]) => `<button class="chip ${v === 'all' ? 'ativo' : ''}" data-acao="filtroFeriasMes" data-valor="${v}">${r}</button>`).join('');
$('#f-ferias').innerHTML = '<option value="">Não programado</option>' + MESES_NOME.map((m, i) => `<option value="${i}">${m}</option>`).join('');

window.addEventListener('online', enviarPendentes);
document.addEventListener('visibilitychange', () => { if (document.hidden) enviarPendentes(); });

carregarCopia();
atualizarTela();
await carregarDoServidor();
atualizarTela();
