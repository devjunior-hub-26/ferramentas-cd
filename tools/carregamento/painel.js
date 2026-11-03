// Painel de produtividade: cruzamento leituras × 967, divergências e Excel.
// Admin vê tudo; Líder vê só a(s) própria(s) equipe(s) — garantido pelo servidor.
import { api, exigirLogin, mensagemErro, PERFIS } from '../../assets/js/auth.js';
import { $, $$, esc, toast, iniciarAbas, dataHora, numero, duracao, hojeISO, inicioDoDia, inicioDoDiaSeguinte } from '../../assets/js/ui.js';
import { icone } from '../../assets/js/icones.js';
import { iniciarImportacao } from './importar967.js';

const perfil = await exigirLogin(['admin', 'lider']);
const ehAdmin = perfil.perfil === 'admin';

$('#btn-voltar').innerHTML = icone('voltar');
$('#btn-leitura').innerHTML = icone('qr');
$('#btn-exportar').innerHTML = `${icone('download')} Exportar Excel`;
$('#t-usuario').textContent = `${perfil.nome} · ${PERFIS[perfil.perfil]}`;
$$('[data-admin]').forEach((el) => (el.hidden = !ehAdmin));

let abaAtual = 'prod';
let resultado = null; // dados calculados do último filtro

// ---------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------
$('#f-ini').value = hojeISO();
$('#f-fim').value = hojeISO();

async function carregarOpcoesFiltro() {
  const { equipes, usuarios } = await api('painelOpcoes');
  $('#f-equipe').innerHTML = '<option value="">Todas</option>' + equipes
    .map((e) => `<option value="${e.id}">${esc(e.nome)}${e.ativa ? '' : ' (inativa)'}</option>`).join('');
  $('#f-usuario').innerHTML = '<option value="">Todos</option>' + usuarios
    .map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
}

function setStatus(texto) {
  const el = $('#status');
  el.textContent = texto || '';
  el.hidden = !texto || ['importar', 'config'].includes(abaAtual);
}

$('#filtros').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = {
    ini: $('#f-ini').value,
    fim: $('#f-fim').value,
    equipe: $('#f-equipe').value,
    usuario: $('#f-usuario').value,
    carregamento: $('#f-carregamento').value.trim(),
  };
  if (!f.ini || !f.fim || f.fim < f.ini) return toast('Período inválido.', 'erro');

  $('#btn-aplicar').disabled = true;
  $('#btn-exportar').disabled = true;
  setStatus('Carregando dados...');
  try {
    resultado = await calcular(f);
    renderizar();
    setStatus(resultado.leituras.length ? '' : 'Nenhuma leitura encontrada para esses filtros.');
    $('#btn-exportar').disabled = false;
  } catch (e) {
    setStatus('Erro ao carregar: ' + mensagemErro(e));
  } finally {
    $('#btn-aplicar').disabled = false;
  }
});

// ---------------------------------------------------------------
// Busca e cálculo
// ---------------------------------------------------------------
async function calcular(f) {
  // Leituras não canceladas do período, os dados da 967 desses carregamentos e,
  // para o Admin sem filtro de equipe/usuário, os carregamentos da 967 que ninguém lançou.
  const dados = await api('painelDados', {
    ini: inicioDoDia(f.ini), fim: inicioDoDiaSeguinte(f.fim), dataIni: f.ini, dataFim: f.fim,
    equipe: f.equipe, usuario: f.usuario, carregamento: f.carregamento,
  }, { tempo: 60000 });
  const leituras = dados.leituras;
  const c967 = new Map(dados.c967.map((c) => [c.numero, c]));
  const naoLancados = dados.naoLancados;

  // Lançamento = carregamento × equipe
  const mapaLanc = new Map();
  for (const l of leituras) {
    const k = `${l.carregamento}|${l.equipe_id}`;
    let x = mapaLanc.get(k);
    if (!x) {
      const c = c967.get(l.carregamento);
      x = {
        carregamento: l.carregamento, equipe_id: l.equipe_id, equipe: l.equipe_nome || '',
        destino: c?.destino || '', rota: c?.rota || '', peso: c?.peso != null ? Number(c.peso) : null, na967: !!c,
        boxes: new Set(), usuarios: new Set(), qtd: 0, inicio: l.lido_em, ultima: l.lido_em,
      };
      mapaLanc.set(k, x);
    }
    x.boxes.add(l.box);
    x.usuarios.add(l.usuario_nome || '?');
    x.qtd++;
    if (l.lido_em < x.inicio) x.inicio = l.lido_em;
    if (l.lido_em > x.ultima) x.ultima = l.lido_em;
  }
  const lancamentos = [...mapaLanc.values()]
    .map((x) => ({ ...x, duracao: new Date(x.ultima) - new Date(x.inicio) }))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));

  // Produtividade por equipe
  const mapaEq = new Map();
  for (const x of lancamentos) {
    const e = mapaEq.get(x.equipe_id) || { equipe: x.equipe, carregamentos: 0, peso: 0, leituras: 0, tempo: 0, sem967: 0 };
    e.carregamentos++;
    e.peso += x.peso || 0;
    e.leituras += x.qtd;
    e.tempo += x.duracao;
    if (!x.na967) e.sem967++;
    mapaEq.set(x.equipe_id, e);
  }
  const porEquipe = [...mapaEq.values()].sort((a, b) => b.carregamentos - a.carregamentos || b.peso - a.peso);

  // Produtividade por usuário
  const mapaUs = new Map();
  for (const l of leituras) {
    const u = mapaUs.get(l.usuario_id) || { usuario: l.usuario_nome || '?', login: l.usuario_login || '', equipes: new Set(), leituras: 0, carregs: new Map() };
    u.equipes.add(l.equipe_nome || '');
    u.leituras++;
    const c = u.carregs.get(l.carregamento) || { inicio: l.lido_em, ultima: l.lido_em };
    if (l.lido_em < c.inicio) c.inicio = l.lido_em;
    if (l.lido_em > c.ultima) c.ultima = l.lido_em;
    u.carregs.set(l.carregamento, c);
    mapaUs.set(l.usuario_id, u);
  }
  const porUsuario = [...mapaUs.values()].map((u) => {
    let peso = 0, tempo = 0;
    for (const [num, c] of u.carregs) {
      peso += Number(c967.get(num)?.peso || 0);
      tempo += new Date(c.ultima) - new Date(c.inicio);
    }
    return { usuario: u.usuario, login: u.login, equipes: [...u.equipes].join(', '), carregamentos: u.carregs.size, peso, leituras: u.leituras, tempo };
  }).sort((a, b) => b.carregamentos - a.carregamentos || b.leituras - a.leituras);

  return { filtros: f, leituras, c967, lancamentos, porEquipe, porUsuario, naoLancados, foraDa967: lancamentos.filter((x) => !x.na967) };
}

// ---------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------
const vazio = (cols, txt = 'Sem dados.') => `<tr><td colspan="${cols}" class="vazio">${txt}</td></tr>`;
const LIMITE_TELA = 1000;

function renderizar() {
  const r = resultado;
  const carregDistintos = new Set(r.lancamentos.map((x) => x.carregamento));
  const pesoTotal = [...carregDistintos].reduce((s, n) => s + Number(r.c967.get(n)?.peso || 0), 0);
  const tempoTotal = r.lancamentos.reduce((s, x) => s + x.duracao, 0);

  $('#kpis').innerHTML = [
    ['Leituras', numero(r.leituras.length)],
    ['Carregamentos', numero(carregDistintos.size)],
    ['Peso total (kg)', numero(pesoTotal)],
    ['Equipes', numero(r.porEquipe.length)],
    ['Tempo médio / carreg.', r.lancamentos.length ? duracao(tempoTotal / r.lancamentos.length) : '—'],
  ].map(([k, v]) => `<div class="kpi"><div class="rotulo">${k}</div><div class="valor">${v}</div></div>`).join('');

  $('#tb-equipes').innerHTML = r.porEquipe.length ? r.porEquipe.map((e) => `<tr>
    <td><b>${esc(e.equipe)}</b></td><td class="num">${e.carregamentos}</td><td class="num">${numero(e.peso)}</td>
    <td class="num">${e.leituras}</td><td class="num">${duracao(e.tempo)}</td><td class="num">${duracao(e.tempo / e.carregamentos)}</td>
    <td class="num">${e.sem967 ? `<span class="selo alerta">${e.sem967}</span>` : '0'}</td></tr>`).join('') : vazio(7);

  $('#tb-usuarios').innerHTML = r.porUsuario.length ? r.porUsuario.map((u) => `<tr>
    <td><b>${esc(u.usuario)}</b></td><td>${esc(u.equipes)}</td><td class="num">${u.carregamentos}</td><td class="num">${numero(u.peso)}</td>
    <td class="num">${u.leituras}</td><td class="num">${duracao(u.tempo)}</td><td class="num">${duracao(u.tempo / u.carregamentos)}</td></tr>`).join('') : vazio(7);

  $('#tb-lanc').innerHTML = r.lancamentos.length ? r.lancamentos.slice(0, LIMITE_TELA).map((x) => `<tr>
    <td><b>${esc(x.carregamento)}</b></td><td>${esc(x.destino)}</td><td>${esc(x.rota)}</td><td class="num">${numero(x.peso)}</td>
    <td>${esc([...x.boxes].join(', '))}</td><td>${esc(x.equipe)}</td><td>${esc([...x.usuarios].join(', '))}</td>
    <td class="num">${x.qtd}</td><td>${dataHora(x.inicio)}</td><td>${dataHora(x.ultima)}</td><td class="num">${duracao(x.duracao)}</td>
    <td>${x.na967 ? '<span class="selo sucesso">OK</span>' : '<span class="selo erro">Não consta</span>'}</td></tr>`).join('') : vazio(12);

  $('#leit-info').textContent = r.leituras.length > LIMITE_TELA
    ? `Mostrando as ${LIMITE_TELA} mais recentes de ${numero(r.leituras.length)}. O Excel traz todas.` : '';
  $('#tb-leit').innerHTML = r.leituras.length ? [...r.leituras].reverse().slice(0, LIMITE_TELA).map((l) => `<tr>
    <td>${dataHora(l.lido_em)}</td><td><b>${esc(l.carregamento)}</b></td><td>${esc(l.box)}</td><td>${esc(l.transacao)}</td>
    <td>${esc(l.usuario_nome)}</td><td>${esc(l.equipe_nome)}</td>
    <td>${l.primeira_do_carregamento ? '<span class="selo">Início</span>' : ''}</td></tr>`).join('') : vazio(7);

  $('#tb-div-fora').innerHTML = r.foraDa967.length ? r.foraDa967.map((x) => `<tr>
    <td><b>${esc(x.carregamento)}</b></td><td>${esc(x.equipe)}</td><td>${esc([...x.usuarios].join(', '))}</td>
    <td class="num">${x.qtd}</td><td>${dataHora(x.inicio)}</td></tr>`).join('') : vazio(5, 'Nenhuma divergência.');

  if (r.naoLancados) {
    $('#div-nao-info').textContent = 'Considera a data do carregamento na 967 dentro do período filtrado.';
    $('#tb-div-nao').innerHTML = r.naoLancados.length ? r.naoLancados.map((c) => `<tr>
      <td><b>${esc(c.numero)}</b></td><td>${esc(c.destino)}</td><td>${esc(c.rota)}</td><td class="num">${numero(c.peso)}</td>
      <td>${c.data_ref ? c.data_ref.split('-').reverse().join('/') : ''}</td></tr>`).join('') : vazio(5, 'Todos os carregamentos da 967 no período foram lançados.');
  } else {
    $('#div-nao-info').textContent = 'Remova os filtros de equipe e usuário para ver esta lista.';
    $('#tb-div-nao').innerHTML = vazio(5, '—');
  }
}

// ---------------------------------------------------------------
// Exportar Excel
// ---------------------------------------------------------------
$('#btn-exportar').addEventListener('click', () => {
  if (!resultado) return;
  const r = resultado;
  const dt = (v) => (v ? new Date(v) : null);
  const min = (ms) => Math.round(ms / 60000);
  const wb = XLSX.utils.book_new();
  const aba = (nome, linhas) => {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ '(sem dados)': '' }], { dateNF: 'dd/mm/yyyy hh:mm:ss' });
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };

  aba('Lançamentos', r.lancamentos.map((x) => ({
    'Carregamento': x.carregamento, 'Destino': x.destino, 'Rota': x.rota, 'Peso (kg)': x.peso,
    'Box': [...x.boxes].join(', '), 'Equipe': x.equipe, 'Usuários': [...x.usuarios].join(', '), 'Leituras': x.qtd,
    'Início': dt(x.inicio), 'Última leitura': dt(x.ultima), 'Duração (min)': min(x.duracao), 'Consta na 967': x.na967 ? 'Sim' : 'Não',
  })));
  aba('Prod. Equipes', r.porEquipe.map((e) => ({
    'Equipe': e.equipe, 'Carregamentos': e.carregamentos, 'Peso total (kg)': e.peso, 'Leituras': e.leituras,
    'Tempo total (min)': min(e.tempo), 'Tempo médio por carregamento (min)': min(e.tempo / e.carregamentos), 'Sem 967': e.sem967,
  })));
  aba('Prod. Usuários', r.porUsuario.map((u) => ({
    'Usuário': u.usuario, 'Login': u.login, 'Equipe(s)': u.equipes, 'Carregamentos': u.carregamentos, 'Peso (kg)': u.peso,
    'Leituras': u.leituras, 'Tempo total (min)': min(u.tempo), 'Tempo médio por carregamento (min)': min(u.tempo / u.carregamentos),
  })));
  aba('Leituras', r.leituras.map((l) => ({
    'Data/hora': dt(l.lido_em), 'Carregamento': l.carregamento, 'Box': l.box, 'Transação': l.transacao,
    'Usuário': l.usuario_nome, 'Login': l.usuario_login, 'Equipe': l.equipe_nome, 'Início do carregamento': l.primeira_do_carregamento ? 'Sim' : '',
  })));
  if (ehAdmin) {
    aba('Divergências', [
      ...r.foraDa967.map((x) => ({ 'Tipo': 'Lido e não consta na 967', 'Carregamento': x.carregamento, 'Equipe': x.equipe, 'Destino': '', 'Rota': '', 'Peso (kg)': null, 'Data': dt(x.inicio) })),
      ...(r.naoLancados || []).map((c) => ({ 'Tipo': 'Na 967 e não lançado', 'Carregamento': c.numero, 'Equipe': '', 'Destino': c.destino, 'Rota': c.rota, 'Peso (kg)': c.peso != null ? Number(c.peso) : null, 'Data': c.data_ref ? new Date(`${c.data_ref}T00:00:00`) : null })),
    ]);
  }
  XLSX.writeFile(wb, `produtividade_carregamento_${r.filtros.ini}_a_${r.filtros.fim}.xlsx`, { cellDates: true });
});

// ---------------------------------------------------------------
// Configurações (Admin)
// ---------------------------------------------------------------
async function carregarConfig() {
  const cfg = await api('lerConfig');
  $('#cfg-multiplas').checked = cfg.permitir_multiplas_equipes === true;
}
$('#cfg-salvar').addEventListener('click', async () => {
  try {
    await api('salvarConfig', { permitir_multiplas_equipes: $('#cfg-multiplas').checked });
    toast('Configuração salva.', 'sucesso');
  } catch (e) { toast(mensagemErro(e), 'erro'); }
});

// ---------------------------------------------------------------
// Início
// ---------------------------------------------------------------
iniciarAbas($('#abas'), (id) => {
  abaAtual = id;
  setStatus(resultado || ['importar', 'config'].includes(id) ? '' : 'Escolha o período e toque em "Aplicar filtros".');
  if (resultado && !resultado.leituras.length) setStatus('Nenhuma leitura encontrada para esses filtros.');
});
await carregarOpcoesFiltro().catch((e) => toast(mensagemErro(e), 'erro'));
if (ehAdmin) {
  iniciarImportacao(perfil);
  carregarConfig().catch((e) => toast(mensagemErro(e), 'erro'));
}
$('#filtros').requestSubmit();
