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
$('#btn-leitura').hidden = ehAdmin; // o administrador só acompanha, não lança
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
  const pesoDe = (num) => Number(c967.get(num)?.peso || 0);
  const pesoTotal = (nums) => [...nums].reduce((s, n) => s + pesoDe(n), 0);

  // Carregamento × equipe (cruzamento com a 967)
  const mapaCarr = new Map();
  for (const l of leituras) {
    const k = `${l.carregamento}|${l.equipe_id}`;
    let x = mapaCarr.get(k);
    if (!x) {
      const c = c967.get(l.carregamento);
      x = {
        carregamento: l.carregamento, equipe_id: l.equipe_id, equipe: l.equipe_nome || '',
        destino: c?.destino || '', rota: c?.rota || '', peso: c?.peso != null ? Number(c.peso) : null, na967: !!c,
        boxes: new Set(), usuarios: new Set(), qtd: 0, inicio: l.lido_em, ultima: l.lido_em,
      };
      mapaCarr.set(k, x);
    }
    x.boxes.add(l.box);
    x.usuarios.add(l.usuario_nome || '?');
    x.qtd++;
    if (l.lido_em < x.inicio) x.inicio = l.lido_em;
    if (l.lido_em > x.ultima) x.ultima = l.lido_em;
  }
  const carregamentos = [...mapaCarr.values()].sort((a, b) => b.inicio.localeCompare(a.inicio));

  // Tempo de cada lançamento: do lançamento anterior (mesmo dia) até este;
  // o primeiro do dia conta da primeira leitura até salvar.
  const tempos = (lista, chave) => {
    const grupos = new Map();
    for (const l of lista) {
      const k = `${l[chave]}|${hojeISO(new Date(l.salvo_em))}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(l);
    }
    const t = new Map();
    for (const g of grupos.values()) {
      g.sort((a, b) => a.salvo_em.localeCompare(b.salvo_em));
      g.forEach((l, i) => t.set(l.id, new Date(l.salvo_em) - new Date(i ? g[i - 1].salvo_em : l.iniciado_em)));
    }
    return t;
  };
  const tempoEquipe = tempos(dados.lancamentos, 'equipe_id');

  // Lançamentos (um por caminhão), montados a partir das leituras que passaram nos filtros
  const leiturasDoLanc = new Map();
  for (const l of leituras) {
    if (!l.lancamento_id) continue;
    if (!leiturasDoLanc.has(l.lancamento_id)) leiturasDoLanc.set(l.lancamento_id, []);
    leiturasDoLanc.get(l.lancamento_id).push(l);
  }
  const lancamentos = dados.lancamentos.filter((x) => leiturasDoLanc.has(x.id)).map((x) => {
    const ls = leiturasDoLanc.get(x.id);
    const nums = [...new Set(ls.map((l) => l.carregamento))];
    const destinos = [...new Set(nums.map((n) => c967.get(n)?.destino).filter(Boolean))];
    return {
      ...x, carregamentos: nums, destinos, peso: pesoTotal(nums), qtd: ls.length,
      tempo: tempoEquipe.get(x.id),
    };
  }).sort((a, b) => b.salvo_em.localeCompare(a.salvo_em));

  // Produtividade por equipe
  const mapaEq = new Map();
  const equipe = (id, nome) => {
    if (!mapaEq.has(id)) mapaEq.set(id, { equipe: nome, lancamentos: 0, tempo: 0, carregs: new Set(), leituras: 0, sem967: 0 });
    return mapaEq.get(id);
  };
  for (const x of lancamentos) { const e = equipe(x.equipe_id, x.equipe_nome); e.lancamentos++; e.tempo += x.tempo; }
  for (const x of carregamentos) { const e = equipe(x.equipe_id, x.equipe); e.carregs.add(x.carregamento); e.leituras += x.qtd; if (!x.na967) e.sem967++; }
  const porEquipe = [...mapaEq.values()].map((e) => ({ ...e, carregamentos: e.carregs.size, peso: pesoTotal(e.carregs) }))
    .sort((a, b) => b.lancamentos - a.lancamentos || b.carregamentos - a.carregamentos);

  // Produtividade por usuário: o que a equipe lançou conta para quem estava nela
  const membros = dados.membros || [];
  const admins = new Set(dados.admins || []);
  const pessoasNaHora = (item, quando) => {
    const p = new Map();
    for (const m of membros) {
      if (m.equipe_id === item.equipe_id && m.inicio <= quando && (!m.fim || m.fim > quando)) p.set(m.usuario_id, m);
    }
    if (!admins.has(item.usuario_id) && !p.has(item.usuario_id)) p.set(item.usuario_id, item);
    return [...p.entries()];
  };
  const mapaUs = new Map();
  const usuario = (id, p) => {
    if (!mapaUs.has(id)) mapaUs.set(id, { id, usuario: p.usuario_nome || '?', login: p.usuario_login || '', equipes: new Set(), lancamentos: 0, tempo: 0, carregs: new Set(), leituras: 0 });
    return mapaUs.get(id);
  };
  for (const l of leituras) {
    for (const [id, p] of pessoasNaHora(l, l.lido_em)) { const u = usuario(id, p); u.equipes.add(l.equipe_nome || ''); u.carregs.add(l.carregamento); u.leituras++; }
  }
  for (const x of lancamentos) {
    for (const [id, p] of pessoasNaHora(x, x.salvo_em)) { const u = usuario(id, p); u.lancamentos++; u.tempo += x.tempo; }
  }
  const porUsuario = [...mapaUs.values()].filter((u) => !f.usuario || u.id === f.usuario).map((u) => ({
    ...u, equipes: [...u.equipes].join(', '), carregamentos: u.carregs.size, peso: pesoTotal(u.carregs),
  })).sort((a, b) => b.lancamentos - a.lancamentos || b.leituras - a.leituras);

  return {
    filtros: f, leituras, c967, lancamentos, carregamentos, porEquipe, porUsuario, naoLancados,
    foraDa967: carregamentos.filter((x) => !x.na967), pesoTotal: pesoTotal(new Set(leituras.map((l) => l.carregamento))),
  };
}

const medio = (tempo, qtd) => (qtd ? duracao(tempo / qtd) : '—');

// ---------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------
const vazio = (cols, txt = 'Sem dados.') => `<tr><td colspan="${cols}" class="vazio">${txt}</td></tr>`;
const LIMITE_TELA = 1000;

function renderizar() {
  const r = resultado;
  const tempoTotal = r.lancamentos.reduce((s, x) => s + x.tempo, 0);

  $('#kpis').innerHTML = [
    ['Lançamentos', numero(r.lancamentos.length)],
    ['Carregamentos', numero(new Set(r.leituras.map((l) => l.carregamento)).size)],
    ['Leituras', numero(r.leituras.length)],
    ['Peso total (kg)', numero(r.pesoTotal)],
    ['Equipes', numero(r.porEquipe.length)],
    ['Tempo médio / lançamento', medio(tempoTotal, r.lancamentos.length)],
  ].map(([k, v]) => `<div class="kpi"><div class="rotulo">${k}</div><div class="valor">${v}</div></div>`).join('');

  $('#tb-equipes').innerHTML = r.porEquipe.length ? r.porEquipe.map((e) => `<tr>
    <td><b>${esc(e.equipe)}</b></td><td class="num">${e.lancamentos}</td><td class="num">${e.carregamentos}</td><td class="num">${numero(e.peso)}</td>
    <td class="num">${e.leituras}</td><td class="num">${duracao(e.tempo)}</td><td class="num">${medio(e.tempo, e.lancamentos)}</td>
    <td class="num">${e.sem967 ? `<span class="selo alerta">${e.sem967}</span>` : '0'}</td></tr>`).join('') : vazio(8);

  $('#tb-usuarios').innerHTML = r.porUsuario.length ? r.porUsuario.map((u) => `<tr>
    <td><b>${esc(u.usuario)}</b></td><td>${esc(u.equipes)}</td><td class="num">${u.lancamentos}</td><td class="num">${u.carregamentos}</td>
    <td class="num">${numero(u.peso)}</td><td class="num">${u.leituras}</td><td class="num">${duracao(u.tempo)}</td>
    <td class="num">${medio(u.tempo, u.lancamentos)}</td></tr>`).join('') : vazio(8);

  $('#tb-lancamentos').innerHTML = r.lancamentos.length ? r.lancamentos.slice(0, LIMITE_TELA).map((x) => `<tr>
    <td>${dataHora(x.salvo_em)}</td><td>${esc(x.equipe_nome)}</td><td>${esc(x.usuario_nome)}</td>
    <td class="num">${x.carregamentos.length}</td><td>${esc(x.carregamentos.join(', '))}</td><td>${esc(x.destinos.join(' · '))}</td>
    <td class="num">${numero(x.peso)}</td><td class="num">${x.qtd}</td><td class="num">${duracao(x.tempo)}</td></tr>`).join('') : vazio(9);

  $('#tb-lanc').innerHTML = r.carregamentos.length ? r.carregamentos.slice(0, LIMITE_TELA).map((x) => `<tr>
    <td><b>${esc(x.carregamento)}</b></td><td>${esc(x.destino)}</td><td>${esc(x.rota)}</td><td class="num">${numero(x.peso)}</td>
    <td>${esc([...x.boxes].join(', '))}</td><td>${esc(x.equipe)}</td><td>${esc([...x.usuarios].join(', '))}</td>
    <td class="num">${x.qtd}</td><td>${dataHora(x.inicio)}</td><td>${dataHora(x.ultima)}</td>
    <td>${x.na967 ? '<span class="selo sucesso">OK</span>' : '<span class="selo erro">Não consta</span>'}</td></tr>`).join('') : vazio(11);

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

  const minMedio = (tempo, qtd) => (qtd ? min(tempo / qtd) : null);

  aba('Lançamentos', r.lancamentos.map((x) => ({
    'Salvo em': dt(x.salvo_em), 'Primeira leitura': dt(x.iniciado_em), 'Equipe': x.equipe_nome, 'Usuário': x.usuario_nome,
    'Qtd. carregamentos': x.carregamentos.length, 'Carregamentos': x.carregamentos.join(', '), 'Destinos': x.destinos.join(' · '),
    'Peso (kg)': x.peso, 'Leituras': x.qtd, 'Tempo desde o lançamento anterior (min)': min(x.tempo),
  })));
  aba('Carregamentos', r.carregamentos.map((x) => ({
    'Carregamento': x.carregamento, 'Destino': x.destino, 'Rota': x.rota, 'Peso (kg)': x.peso,
    'Box': [...x.boxes].join(', '), 'Equipe': x.equipe, 'Usuários': [...x.usuarios].join(', '), 'Leituras': x.qtd,
    'Primeira leitura': dt(x.inicio), 'Última leitura': dt(x.ultima), 'Consta na 967': x.na967 ? 'Sim' : 'Não',
  })));
  aba('Prod. Equipes', r.porEquipe.map((e) => ({
    'Equipe': e.equipe, 'Lançamentos': e.lancamentos, 'Carregamentos': e.carregamentos, 'Peso total (kg)': e.peso, 'Leituras': e.leituras,
    'Tempo total (min)': min(e.tempo), 'Tempo médio por lançamento (min)': minMedio(e.tempo, e.lancamentos), 'Sem 967': e.sem967,
  })));
  aba('Prod. Usuários', r.porUsuario.map((u) => ({
    'Usuário': u.usuario, 'Login': u.login, 'Equipe(s)': u.equipes, 'Lançamentos': u.lancamentos, 'Carregamentos': u.carregamentos,
    'Peso (kg)': u.peso, 'Leituras': u.leituras, 'Tempo total (min)': min(u.tempo), 'Tempo médio por lançamento (min)': minMedio(u.tempo, u.lancamentos),
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
  $('#filtros-caixa').hidden = ['importar', 'config'].includes(id);
  setStatus(resultado ||['importar', 'config'].includes(id) ? '' : 'Escolha o período e toque em "Aplicar filtros".');
  if (resultado && !resultado.leituras.length) setStatus('Nenhuma leitura encontrada para esses filtros.');
});
await carregarOpcoesFiltro().catch((e) => toast(mensagemErro(e), 'erro'));
if (ehAdmin) {
  iniciarImportacao(perfil);
  carregarConfig().catch((e) => toast(mensagemErro(e), 'erro'));
}
$('#filtros').requestSubmit();
