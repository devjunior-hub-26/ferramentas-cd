// Administração: criação de equipes e histórico de composição (somente Admin).
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
  renderEquipes();
  renderHistorico();
}

// ---------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------
// Aqui só se criam as equipes. As pessoas são ligadas em Colaboradores e Acessos.
function renderEquipes() {
  const mostrarInativas = $('#mostrar-inativas').checked;

  $('#lista-equipes').innerHTML = db.equipes.filter((e) => e.ativa || mostrarInativas).map((e) => {
    const membros = db.membros.filter((m) => m.equipe_id === e.id && !m.fim)
      .map((m) => usuarioPorId(m.usuario_id)).filter((u) => u && u.perfil !== 'admin')
      .sort((a, b) => a.nome.localeCompare(b.nome));
    const lider = usuarioPorId(e.lider_id);
    return `<div class="cartao equipe-cartao ${e.ativa ? '' : 'inativa'}">
      <div class="linha entre">
        <h3 style="margin:0">${esc(e.nome)} ${e.ativa ? '' : '<span class="selo neutro">Inativa</span>'}</h3>
        <span class="selo">${membros.length} pessoa(s)</span>
      </div>
      <p class="suave" style="margin:6px 0 10px">Líder: <b>${lider ? esc(lider.nome) : '—'}</b></p>
      <p class="suave" style="margin:0"><small>${membros.map((u) => esc(u.nome)).join(', ') || 'Nenhum membro.'}</small></p>
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
    ${semEquipe.map((u) => esc(u.nome)).join(', ')}<br><small>Essas pessoas não conseguem lançar leituras. Escolha a equipe delas em Colaboradores e Acessos.</small></p>`;
}

$('#mostrar-inativas').addEventListener('change', renderEquipes);

async function mover(usuarioId, equipeId) {
  await api('moverUsuario', { usuario_id: usuarioId, equipe_id: equipeId });
}

$('#lista-equipes').addEventListener('click', async (ev) => {
  const alvo = ev.target.closest('button');
  if (!alvo) return;
  const d = alvo.dataset;
  try {
    if (d.desativar) {
      const e = equipePorId(d.desativar);
      if (!confirm(`Desativar a ${e.nome}? Todos os membros ficarão sem equipe.`)) return;
      await api('desativarEquipe', { equipe_id: e.id });
      toast('Equipe desativada.', 'sucesso');
    } else if (d.reativar) {
      await api('reativarEquipe', { equipe_id: d.reativar });
      toast('Equipe reativada. Escolha as pessoas em Colaboradores e Acessos.', 'sucesso');
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
