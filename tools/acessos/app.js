// Acessos (só o administrador): login, senha e perfil de cada pessoa e quais
// telas do menu ela pode abrir. As pessoas vêm de Colaboradores (cadastro único).
// O servidor guarda as telas na coluna "telas" de Usuarios e confere em cada ação.
import { api, exigirLogin, mensagemErro, PERFIS } from '../../assets/js/auth.js';
import { MENU, itemLiberado } from '../../assets/js/tools.js';
import { $, $$, esc, toast } from '../../assets/js/ui.js';
import { icone } from '../../assets/js/icones.js';

const perfil = await exigirLogin(['admin']);
$('#btn-voltar').innerHTML = icone('voltar');
$('#t-usuario').textContent = `${perfil.nome} · ${PERFIS[perfil.perfil]}`;

let pessoas = [];   // Colaboradores: { chapa, nome, funcao, setor, usuario_id }
let contas = [];    // Usuarios: { id, login, nome, perfil, ativo, telas }
let editando = null; // { pessoa?, conta? }

const contaPorId = (id) => contas.find((c) => c.id === id) || null;
const GRUPOS = MENU.map((g) => ({ grupo: g.grupo, itens: g.itens.filter((i) => !i.soAdmin) })).filter((g) => g.itens.length);
const NOME_TELA = {};
MENU.forEach((g) => g.itens.forEach((i) => { NOME_TELA[i.id] = `${g.grupo} › ${i.nome}`; }));
const perfilDaFuncao = (f) => (/l[ií]der|encarregad|supervis|coordenad/i.test(f || '') ? 'lider' : 'carregador');
const kpi = (rotulo, valor) => `<div class="kpi"><div class="rotulo">${esc(rotulo)}</div><div class="valor">${esc(valor)}</div></div>`;

async function carregar() {
  try {
    ({ pessoas, contas } = await api('acessosDados', {}, { tempo: 60000 }));
  } catch (e) {
    $('#carregando').textContent = `Não foi possível carregar: ${mensagemErro(e)}`;
    return;
  }
  $('#carregando').hidden = true;
  const setores = [...new Set(pessoas.map((p) => p.setor).filter(Boolean))].sort();
  const sel = $('#f-setor');
  const atual = sel.value;
  sel.innerHTML = '<option value="all">Todos</option>' + setores.map((s) => `<option>${esc(s)}</option>`).join('');
  sel.value = setores.includes(atual) ? atual : 'all';
  render();
}

/** Uma linha por pessoa de Colaboradores e uma por conta sem colaborador. */
function linhas() {
  const ligadas = {};
  const out = pessoas.map((p) => {
    const c = p.usuario_id ? contaPorId(p.usuario_id) : null;
    if (c) ligadas[c.id] = true;
    return { chave: 'p:' + p.chapa, pessoa: p, conta: c };
  });
  contas.filter((c) => !ligadas[c.id]).forEach((c) => out.push({ chave: 'c:' + c.id, pessoa: null, conta: c }));
  return out;
}

const situacao = (l) => (!l.conta ? 'sem' : l.conta.ativo ? 'com' : 'bloq');

function resumoTelas(c) {
  if (!c) return '<span class="suave">—</span>';
  if (c.perfil === 'admin') return '<span class="selo escuro">Todas</span>';
  if (!c.telas?.length) return '<span class="selo neutro">Padrão do perfil</span>';
  const nomes = c.telas.map((t) => NOME_TELA[t]).filter(Boolean);
  return `<span class="selo">${nomes.length} tela(s)</span><br><small class="suave">${esc(nomes.map((n) => n.split(' › ')[1]).join(', '))}</small>`;
}

function render() {
  const q = $('#busca').value.trim().toLowerCase();
  const sit = $('#f-situacao').value;
  const setor = $('#f-setor').value;
  const todas = linhas();
  $('#kpis').innerHTML = kpi('Pessoas', pessoas.length)
    + kpi('Com acesso', todas.filter((l) => situacao(l) === 'com').length)
    + kpi('Telas escolhidas', contas.filter((c) => c.perfil !== 'admin' && c.telas?.length).length)
    + kpi('Bloqueadas', todas.filter((l) => situacao(l) === 'bloq').length);
  const lista = todas
    .filter((l) => sit === 'all' || situacao(l) === sit)
    .filter((l) => setor === 'all' || l.pessoa?.setor === setor)
    .filter((l) => !q || [l.pessoa?.nome, l.pessoa?.chapa, l.conta?.login, l.conta?.nome].some((v) => String(v || '').toLowerCase().includes(q)));
  $('#corpo').innerHTML = lista.map((l) => {
    const c = l.conta;
    const quem = l.pessoa
      ? `<b>${esc(l.pessoa.nome)}</b><small>${esc(l.pessoa.chapa)} · ${esc(l.pessoa.funcao || '')} · ${esc(l.pessoa.setor || '')}</small>`
      : `<b>${esc(c.nome)}</b><small>Conta sem colaborador</small>`;
    const selo = !c ? '<span class="selo neutro">Sem acesso</span>'
      : c.ativo ? '<span class="selo sucesso">Com acesso</span>' : '<span class="selo erro">Bloqueado</span>';
    return `<tr>
      <td class="pessoa">${quem}</td>
      <td>${c ? esc(c.login) : '—'}</td>
      <td>${c ? esc(PERFIS[c.perfil] || c.perfil) : '—'}</td>
      <td>${selo}</td>
      <td class="resumo-telas">${resumoTelas(c)}</td>
      <td><button class="btn pequeno secundario" data-editar="${esc(l.chave)}">${c ? 'Editar' : 'Dar acesso'}</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="vazio">Ninguém encontrado.</td></tr>';
}

// ---------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------
function desenharTelas(marcadas) {
  $('#a-telas').innerHTML = GRUPOS.map((g, gi) => `<fieldset class="telas-grupo">
      <legend>${esc(g.grupo)}</legend>
      <label class="check"><input type="checkbox" data-grupo="${gi}"> Todas deste grupo</label>
      <div class="telas-itens">${g.itens.map((i) => `<label class="check"><input type="checkbox" name="tela" value="${esc(i.id)}"
        data-g="${gi}"${marcadas.includes(i.id) ? ' checked' : ''}> ${esc(i.nome)}</label>`).join('')}</div>
    </fieldset>`).join('');
  atualizarGrupos();
}

function atualizarGrupos() {
  $$('[data-grupo]').forEach((g) => {
    const itens = $$(`input[name=tela][data-g="${g.dataset.grupo}"]`);
    const n = itens.filter((i) => i.checked).length;
    g.checked = n === itens.length;
    g.indeterminate = n > 0 && n < itens.length;
  });
}

/** Telas que o perfil dá por padrão (para começar a escolha). */
function telasDoPerfil(p) {
  return GRUPOS.flatMap((g) => g.itens.filter((i) => itemLiberado(i, { perfil: p, telas: null })).map((i) => i.id));
}

function aplicarModo() {
  const escolher = $('#a-modo-escolher').checked;
  const p = $('#a-perfil').value;
  if (!escolher) desenharTelas(telasDoPerfil(p));
  $$('#a-telas input').forEach((i) => { i.disabled = !escolher; });
}

function mostrarBloco() {
  const ligado = $('#a-ativo').checked;
  const admin = $('#a-perfil').value === 'admin';
  $('#a-bloco').hidden = !ligado;
  $('#a-login').required = ligado && !editando.conta;
  $('#a-senha').required = ligado && !editando.conta;
  $('#a-telas-admin').hidden = !admin;
  $('#a-telas-caixa').hidden = admin;
  $('#a-vinculo-caixa').hidden = !!editando.pessoa || admin;
}

function abrir(chave) {
  const l = linhas().find((x) => x.chave === chave);
  if (!l) return;
  editando = l;
  const { pessoa: p, conta: c } = l;
  $('#form-acesso').reset();
  $('#a-titulo').textContent = p ? 'Acesso de colaborador' : 'Conta sem colaborador';
  $('#a-pessoa').innerHTML = p
    ? `<b>${esc(p.nome)}</b> · chapa ${esc(p.chapa)} · ${esc(p.funcao || '')} · ${esc(p.setor || '')}`
    : `<b>${esc(c.nome)}</b> · esta conta não está ligada a ninguém de Colaboradores.`;
  $('#a-ativo').checked = c ? c.ativo : false;
  $('#a-login').value = c ? c.login : (p?.chapa || '');
  $('#a-login').readOnly = !p && !!c;
  $('#a-perfil').value = c ? c.perfil : perfilDaFuncao(p?.funcao);
  $('#a-senha-rotulo').textContent = c ? 'Nova senha (opcional)' : 'Senha *';
  $('#a-senha-ajuda').textContent = c ? 'Deixe em branco para manter a senha atual.' : 'Mínimo 6 caracteres. Informe à pessoa.';
  if (!c && p && String(p.chapa).length >= 6) $('#a-senha').value = p.chapa;
  $('#a-vinculo').innerHTML = '<option value="">Não ligar agora</option>'
    + pessoas.filter((x) => !x.usuario_id).map((x) => `<option value="${esc(x.chapa)}">${esc(x.nome)} (${esc(x.chapa)})</option>`).join('');
  const escolhidas = c?.telas?.length ? c.telas : null;
  $('#a-modo-padrao').checked = !escolhidas;
  $('#a-modo-escolher').checked = !!escolhidas;
  desenharTelas(escolhidas || telasDoPerfil($('#a-perfil').value));
  aplicarModo();
  mostrarBloco();
  $('#dlg-acesso').showModal();
}

async function salvar() {
  const { pessoa: p, conta: c } = editando;
  const ativo = $('#a-ativo').checked;
  const perfilNovo = $('#a-perfil').value;
  const escolher = $('#a-modo-escolher').checked && perfilNovo !== 'admin';
  const telas = escolher ? $$('#a-telas input[name=tela]:checked').map((i) => i.value) : null;
  if (ativo && escolher && !telas.length) { toast('Marque pelo menos uma tela ou use o padrão do perfil.', 'erro'); return; }
  if (!p && !c) return;
  const corpo = p
    ? { chapa: p.chapa, ativo, login: $('#a-login').value, senha: $('#a-senha').value, perfil: perfilNovo }
    : { usuario_id: c.id, ativo, perfil: perfilNovo, senha: $('#a-senha').value || undefined };
  if (ativo) corpo.telas = telas;
  const botao = $('#form-acesso [type=submit]');
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    await api('acessosSalvar', corpo, { tempo: 60000 });
    const ligar = !p && $('#a-vinculo').value;
    if (ligar && perfilNovo !== 'admin') await api('expedicaoVincularConta', { usuario_id: c.id, chapa: ligar });
    $('#dlg-acesso').close();
    toast('Acesso salvo.', 'sucesso');
    await carregar();
  } catch (e) {
    toast(mensagemErro(e), 'erro', 6000);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
}

// ---------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------
$('#corpo').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-editar]');
  if (b) abrir(b.dataset.editar);
});
$('#a-ativo').addEventListener('change', mostrarBloco);
$('#a-perfil').addEventListener('change', () => { mostrarBloco(); aplicarModo(); });
$$('input[name=modo]').forEach((r) => r.addEventListener('change', aplicarModo));
$('#a-telas').addEventListener('change', (ev) => {
  const g = ev.target.dataset.grupo;
  if (g !== undefined) $$(`input[name=tela][data-g="${g}"]`).forEach((i) => { i.checked = ev.target.checked; });
  atualizarGrupos();
});
$('#form-acesso').addEventListener('submit', (ev) => { ev.preventDefault(); salvar(); });
document.addEventListener('click', (ev) => {
  if (ev.target.matches('dialog.modal')) ev.target.close();
  const f = ev.target.closest('[data-fechar]');
  if (f) f.closest('dialog').close();
});
['#busca', '#f-situacao', '#f-setor'].forEach((s) => $(s).addEventListener('input', render));

carregar();
