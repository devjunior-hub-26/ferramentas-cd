// Administração: usuários, equipes e histórico de composição (somente Admin).
import { api, exigirLogin, mensagemErro, PERFIS } from '../../assets/js/auth.js';
import { $, esc, toast, iniciarAbas, abrirModal, dataHora } from '../../assets/js/ui.js';
import { icone } from '../../assets/js/icones.js';

const perfil = await exigirLogin(['admin']);

$('#btn-voltar').innerHTML = icone('voltar');
$('#t-usuario').textContent = `${perfil.nome} · ${PERFIS[perfil.perfil]}`;

const db = { usuarios: [], equipes: [], membros: [] }; // membros = histórico completo
const usuarioPorId = (id) => db.usuarios.find((u) => u.id === id);
const equipePorId = (id) => db.equipes.find((e) => e.id === id);
const vinculoAtivo = (usuarioId) => db.membros.find((m) => m.usuario_id === usuarioId && !m.fim);

async function carregarTudo() {
  try {
    Object.assign(db, await api('adminListar'));
  } catch (e) {
    return toast(mensagemErro(e), 'erro', 6000);
  }
  renderUsuarios();
  renderEquipes();
  renderHistorico();
}

// ---------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------
function renderUsuarios() {
  const termo = $('#busca-usuario').value.trim().toLowerCase();
  const lista = db.usuarios.filter((u) => !termo || u.nome.toLowerCase().includes(termo) || u.login.includes(termo));
  $('#tb-usuarios').innerHTML = lista.length ? lista.map((u) => {
    const v = vinculoAtivo(u.id);
    return `<tr>
      <td><b>${esc(u.nome)}</b></td><td>${esc(u.login)}</td><td>${PERFIS[u.perfil]}</td>
      <td>${v ? esc(equipePorId(v.equipe_id)?.nome) : u.perfil === 'admin' ? '—' : '<span class="selo alerta">Sem equipe</span>'}</td>
      <td>${u.ativo ? '<span class="selo sucesso">Ativo</span>' : '<span class="selo neutro">Desativado</span>'}</td>
      <td><button class="btn pequeno secundario" data-editar="${u.id}">Editar</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum usuário encontrado.</td></tr>';
}

$('#busca-usuario').addEventListener('input', renderUsuarios);

$('#btn-novo-usuario').addEventListener('click', async () => {
  const dados = await abrirModal($('#modal-usuario'), (form) => {
    $('#mu-titulo').textContent = 'Novo usuário';
    form.login.readOnly = false;
    form.senha.required = true;
    $('#mu-senha-rotulo').textContent = 'Senha';
    $('#mu-senha-ajuda').textContent = 'Mínimo 6 caracteres. Informe ao usuário.';
    $('#mu-ativo-box').hidden = true;
  });
  if (!dados) return;
  try {
    const login = dados.login.trim().toLowerCase();
    await api('criarUsuario', { nome: dados.nome.trim(), login, senha: dados.senha, perfil: dados.perfil });
    toast(`Usuário ${login} criado. Agora coloque-o em uma equipe.`, 'sucesso', 5000);
    await carregarTudo();
  } catch (e) { toast(e.message, 'erro', 6000); }
});

// ---------------------------------------------------------------
// Importar colaboradores (colado do Excel: Matrícula, Nome, Função)
// ---------------------------------------------------------------
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const nomeProprio = (s) => s.toLowerCase().split(/\s+/).filter(Boolean)
  .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p[0].toUpperCase() + p.slice(1))).join(' ');
const perfilDaFuncao = (f) => (/l[ií]der|encarregad|supervis|coordenad/i.test(f || '') ? 'lider' : 'carregador');

function senhaInicial() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1000000).padStart(6, '0');
}

/** Linhas "matrícula<TAB>nome<TAB>função" → colaboradores. Ignora o cabeçalho. */
function lerColaboradores(texto, senhaMatricula) {
  const lista = [];
  const erros = [];
  texto.split(/\r?\n/).forEach((linha, i) => {
    if (!linha.trim()) return;
    const [mat = '', nome = '', funcao = ''] = linha.split(/\t|;/).map((c) => c.trim());
    if (!/^\d+$/.test(mat)) {
      if (i > 0 || !/matr/i.test(mat)) erros.push(`Linha ${i + 1}: matrícula "${mat}" inválida.`);
      return;
    }
    if (!nome) { erros.push(`Linha ${i + 1}: falta o nome.`); return; }
    // A senha precisa de 6 caracteres: matrícula curta ganha senha gerada
    const senha = senhaMatricula && mat.length >= 6 ? mat : senhaInicial();
    lista.push({ login: mat, nome: nomeProprio(nome), perfil: perfilDaFuncao(funcao), funcao, senha });
  });
  return { lista, erros };
}

let ultimasSenhas = [];

$('#btn-importar-colab').addEventListener('click', async () => {
  const dados = await abrirModal($('#modal-colab'));
  if (!dados) return;
  const { lista, erros } = lerColaboradores(dados.lista, dados.senha_matricula === '1');
  if (erros.length) return toast(erros.slice(0, 3).join(' '), 'erro', 8000);
  if (!lista.length) return toast('Nenhum colaborador encontrado no texto colado.', 'alerta');
  try {
    const r = await api('criarUsuariosEmLote', { usuarios: lista.map(({ funcao, ...u }) => u) }, { tempo: 120000 });
    const criados = new Set(r.criados);
    ultimasSenhas = lista.filter((u) => criados.has(u.login));
    await carregarTudo();
    $('#tb-senhas').innerHTML = ultimasSenhas.map((u) => `<tr><td>${esc(u.login)}</td>
      <td><b style="font-family:monospace;font-size:1.05rem">${esc(u.senha)}</b></td><td>${esc(u.nome)}</td><td>${PERFIS[u.perfil]}</td></tr>`).join('')
      || '<tr><td colspan="4" class="vazio">Ninguém novo para cadastrar.</td></tr>';
    $('#senhas-resumo').textContent = `${r.criados.length} cadastrado(s).`
      + (r.jaExistiam.length ? ` Já existiam e foram pulados: ${r.jaExistiam.join(', ')}.` : '')
      + ' Próximo passo: monte as equipes na aba Equipes.';
    $('#btn-baixar-senhas').hidden = ultimasSenhas.length === 0;
    abrirModal($('#modal-senhas'));
  } catch (e) { toast(mensagemErro(e), 'erro', 8000); }
});

// CSV com ";" e BOM: abre direto no Excel em português
$('#btn-baixar-senhas').addEventListener('click', () => {
  const linhas = [['Matrícula (login)', 'Senha inicial', 'Nome', 'Perfil'],
    ...ultimasSenhas.map((u) => [u.login, u.senha, u.nome, PERFIS[u.perfil]])];
  const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'senhas-iniciais-colaboradores.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#tb-usuarios').addEventListener('click', async (ev) => {
  const id = ev.target.closest('[data-editar]')?.dataset.editar;
  const u = id && usuarioPorId(id);
  if (!u) return;
  const dados = await abrirModal($('#modal-usuario'), (form) => {
    $('#mu-titulo').textContent = 'Editar usuário';
    form.nome.value = u.nome;
    form.login.value = u.login;
    form.login.readOnly = true;
    form.senha.required = false;
    $('#mu-senha-rotulo').textContent = 'Nova senha (opcional)';
    $('#mu-senha-ajuda').textContent = 'Deixe em branco para manter a senha atual.';
    form.perfil.value = u.perfil;
    form.ativo.checked = u.ativo;
    $('#mu-ativo-box').hidden = false;
  });
  if (!dados) return;
  try {
    const corpo = { id: u.id, nome: dados.nome.trim(), perfil: dados.perfil, ativo: dados.ativo === '1' };
    if (dados.senha) corpo.senha = dados.senha;
    await api('atualizarUsuario', corpo);
    toast('Usuário atualizado.', 'sucesso');
    await carregarTudo();
  } catch (e) { toast(e.message, 'erro', 6000); }
});

// ---------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------
function opcoesUsuarios(selecionado = '') {
  return db.usuarios.filter((u) => u.ativo).map((u) => {
    const v = vinculoAtivo(u.id);
    const atual = v ? ` — ${equipePorId(v.equipe_id)?.nome}` : ' — sem equipe';
    return `<option value="${u.id}" ${u.id === selecionado ? 'selected' : ''}>${esc(u.nome)}${esc(atual)}</option>`;
  }).join('');
}

function renderEquipes() {
  const mostrarInativas = $('#mostrar-inativas').checked;
  const ativas = db.equipes.filter((e) => e.ativa);
  const opcoesMover = (atual) => '<option value="">Mover para...</option>' + ativas
    .filter((e) => e.id !== atual).map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');

  $('#lista-equipes').innerHTML = db.equipes.filter((e) => e.ativa || mostrarInativas).map((e) => {
    const membros = db.membros.filter((m) => m.equipe_id === e.id && !m.fim)
      .map((m) => usuarioPorId(m.usuario_id)).filter(Boolean)
      .sort((a, b) => a.nome.localeCompare(b.nome));
    const lider = usuarioPorId(e.lider_id);
    return `<div class="cartao equipe-cartao ${e.ativa ? '' : 'inativa'}">
      <div class="linha entre">
        <h3 style="margin:0">${esc(e.nome)} ${e.ativa ? '' : '<span class="selo neutro">Inativa</span>'}</h3>
        <span class="selo">${membros.length} pessoa(s)</span>
      </div>
      <p class="suave" style="margin:6px 0 10px">Líder: <b>${lider ? esc(lider.nome) : '—'}</b></p>
      ${membros.map((u) => `<div class="membro">
          <span>${esc(u.nome)} ${u.id === e.lider_id ? '<span class="selo">Líder</span>' : ''}</span>
          <span class="linha">
            <select data-mover="${u.id}" aria-label="Mover ${esc(u.nome)}">${opcoesMover(e.id)}</select>
            <button class="btn pequeno secundario" data-remover="${u.id}" title="Tirar da equipe">Tirar</button>
          </span>
        </div>`).join('') || '<p class="suave">Nenhum membro.</p>'}
      ${e.ativa ? `<div class="add-membro">
          <select class="entrada" data-add-select="${e.id}"><option value="">Adicionar pessoa...</option>${opcoesUsuarios()}</select>
          <button class="btn pequeno" data-add="${e.id}">Adicionar</button>
        </div>` : ''}
      <div class="btns mt">
        <button class="btn pequeno secundario" data-editar-equipe="${e.id}">Editar</button>
        ${e.ativa
          ? `<button class="btn pequeno perigo" data-desativar="${e.id}">Desativar</button>`
          : `<button class="btn pequeno sucesso" data-reativar="${e.id}">Reativar</button>`}
      </div>
    </div>`;
  }).join('') || '<p class="suave">Nenhuma equipe cadastrada. Toque em "+ Nova equipe".</p>';

  const semEquipe = db.usuarios.filter((u) => u.ativo && u.perfil !== 'admin' && !vinculoAtivo(u.id));
  $('#sem-equipe').hidden = semEquipe.length === 0;
  $('#sem-equipe').innerHTML = `<h3>Sem equipe (${semEquipe.length})</h3><p class="suave" style="margin:0">
    ${semEquipe.map((u) => esc(u.nome)).join(', ')}<br><small>Essas pessoas não conseguem lançar leituras.</small></p>`;
}

$('#mostrar-inativas').addEventListener('change', renderEquipes);

async function mover(usuarioId, equipeId) {
  await api('moverUsuario', { usuario_id: usuarioId, equipe_id: equipeId });
}

$('#lista-equipes').addEventListener('change', async (ev) => {
  const sel = ev.target.closest('[data-mover]');
  if (!sel || !sel.value) return;
  const u = usuarioPorId(sel.dataset.mover);
  const destino = equipePorId(sel.value);
  if (!confirm(`Mover ${u.nome} para ${destino.nome}?`)) { sel.value = ''; return; }
  try {
    await mover(u.id, destino.id);
    toast(`${u.nome} agora está na ${destino.nome}.`, 'sucesso');
    await carregarTudo();
  } catch (e) { toast(mensagemErro(e), 'erro'); }
});

$('#lista-equipes').addEventListener('click', async (ev) => {
  const alvo = ev.target.closest('button');
  if (!alvo) return;
  const d = alvo.dataset;
  try {
    if (d.add) {
      const usuarioId = $(`[data-add-select="${d.add}"]`).value;
      if (!usuarioId) return toast('Escolha a pessoa.', 'alerta');
      const v = vinculoAtivo(usuarioId);
      if (v?.equipe_id === d.add) return toast('Essa pessoa já está nesta equipe.', 'alerta');
      if (v && !confirm(`${usuarioPorId(usuarioId).nome} está na ${equipePorId(v.equipe_id)?.nome}. Mover para ${equipePorId(d.add).nome}?`)) return;
      await mover(usuarioId, d.add);
      toast('Pessoa adicionada à equipe.', 'sucesso');
    } else if (d.remover) {
      const u = usuarioPorId(d.remover);
      if (!confirm(`Tirar ${u.nome} da equipe? Ela ficará sem equipe e não conseguirá lançar leituras.`)) return;
      await api('removerUsuario', { usuario_id: u.id });
      toast(`${u.nome} saiu da equipe.`, 'sucesso');
    } else if (d.desativar) {
      const e = equipePorId(d.desativar);
      if (!confirm(`Desativar a ${e.nome}? Todos os membros ficarão sem equipe.`)) return;
      await api('desativarEquipe', { equipe_id: e.id });
      toast('Equipe desativada.', 'sucesso');
    } else if (d.reativar) {
      await api('reativarEquipe', { equipe_id: d.reativar });
      toast('Equipe reativada. Adicione os membros.', 'sucesso');
    } else if (d.editarEquipe) {
      return editarEquipe(equipePorId(d.editarEquipe));
    } else return;
    await carregarTudo();
  } catch (e) { toast(mensagemErro(e), 'erro', 5000); }
});

$('#btn-nova-equipe').addEventListener('click', () => editarEquipe(null));

async function editarEquipe(equipe) {
  const dados = await abrirModal($('#modal-equipe'), (form) => {
    $('#me-titulo').textContent = equipe ? 'Editar equipe' : 'Nova equipe';
    form.nome.value = equipe?.nome || '';
    form.lider_id.innerHTML = '<option value="">— sem líder —</option>' + db.usuarios
      .filter((u) => u.ativo && u.perfil === 'lider')
      .map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
    form.lider_id.value = equipe?.lider_id || '';
  });
  if (!dados) return;
  const registro = { nome: dados.nome.trim(), lider_id: dados.lider_id || null };
  try {
    const { id } = await api('salvarEquipe', { id: equipe?.id, ...registro });
    // O líder também faz parte da equipe
    if (registro.lider_id && (equipe?.ativa ?? true)) {
      const v = vinculoAtivo(registro.lider_id);
      if (v?.equipe_id !== id) {
        if (!v || confirm(`${usuarioPorId(registro.lider_id).nome} está na ${equipePorId(v.equipe_id)?.nome}. Mover para ${registro.nome}?`)) {
          await mover(registro.lider_id, id);
        }
      }
    }
    toast('Equipe salva.', 'sucesso');
    await carregarTudo();
  } catch (e) {
    toast(mensagemErro(e), 'erro', 5000);
  }
}

// ---------------------------------------------------------------
// Histórico de composição
// ---------------------------------------------------------------
function renderHistorico() {
  const selU = $('#hist-usuario');
  const selE = $('#hist-equipe');
  const [vu, ve] = [selU.value, selE.value];
  selU.innerHTML = '<option value="">Todos</option>' + db.usuarios.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  selE.innerHTML = '<option value="">Todas</option>' + db.equipes.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
  selU.value = vu;
  selE.value = ve;
  const lista = db.membros.filter((m) => (!vu || m.usuario_id === vu) && (!ve || m.equipe_id === ve));
  $('#tb-historico').innerHTML = lista.length ? lista.map((m) => `<tr>
    <td>${esc(usuarioPorId(m.usuario_id)?.nome || '?')}</td><td>${esc(equipePorId(m.equipe_id)?.nome || '?')}</td>
    <td>${dataHora(m.inicio)}</td><td>${m.fim ? dataHora(m.fim) : '<span class="selo sucesso">Atual</span>'}</td>
    <td>${esc(usuarioPorId(m.alterado_por)?.nome || '')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Sem registros.</td></tr>';
}
$('#hist-usuario').addEventListener('change', renderHistorico);
$('#hist-equipe').addEventListener('change', renderHistorico);

iniciarAbas($('#abas'));
carregarTudo();
