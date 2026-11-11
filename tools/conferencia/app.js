// Painel de conferência: liga o painel (painel.js) à planilha.
//
// IMPORTANTE: nomes e matrículas dos conferentes NÃO podem ficar neste código,
// porque o repositório é público. Eles ficam na planilha (aba ConfDados).
import { exigirLogin, mensagemErro } from '../../assets/js/auth.js';
import { api } from '../../assets/js/api.js';

await exigirLogin(['admin']);

const PARTES = ['conferentes', 'config', 'qualidade', 'historico', 'tempos'];
const status = document.getElementById('sync-status');
const pend = document.getElementById('sync-pend');
const aviso = document.getElementById('aviso');

let gravado = {};      // texto de cada parte como está na planilha
let fila = null;       // último estado ainda não enviado
let timer = null;
let enviando = false;

function mostrarStatus(texto, off = false) {
  status.textContent = texto;
  status.classList.toggle('off', off);
}

// O painel chama a cada alteração; junta alterações próximas em um envio só
window.salvarPainel = (estado) => {
  fila = estado;
  pend.hidden = false;
  pend.textContent = '1';
  mostrarStatus('Salvando…');
  clearTimeout(timer);
  timer = setTimeout(enviar, 900);
};

async function enviar() {
  if (enviando || !fila) return;
  const estado = fila;
  fila = null;
  const partes = {};
  PARTES.forEach((p) => {
    const t = JSON.stringify(estado[p] ?? null);
    if (t !== gravado[p]) partes[p] = t;
  });
  if (!Object.keys(partes).length) { terminou(); return; }
  enviando = true;
  let espera = 900;
  try {
    await api('conferenciaSalvar', { partes }, { tempo: 60000 });
    Object.assign(gravado, partes);
    aviso.hidden = true;
  } catch (e) {
    // Guarda de novo para tentar outra vez
    if (!fila) fila = estado;
    espera = 8000;
    mostrarStatus(e.codigo === 'REDE' ? 'Sem conexão · tentando de novo' : 'Erro ao salvar', true);
    aviso.textContent = `Não foi possível salvar: ${mensagemErro(e)} As alterações continuam nesta tela e serão enviadas de novo.`;
    aviso.hidden = false;
  } finally {
    enviando = false;
  }
  if (fila) { clearTimeout(timer); timer = setTimeout(enviar, espera); } else terminou();
}

function terminou() {
  if (fila) return;
  pend.hidden = true;
  mostrarStatus('Salvo');
}

// Não deixa sair com alteração ainda não enviada
window.addEventListener('beforeunload', (ev) => {
  if (fila || enviando) { ev.preventDefault(); ev.returnValue = ''; }
});

try {
  const r = await api('conferenciaDados', {}, { tempo: 60000 });
  const dados = {};
  PARTES.forEach((p) => {
    const t = r.partes?.[p];
    if (t === undefined) return;
    gravado[p] = t;
    try { dados[p] = JSON.parse(t); } catch { /* parte corrompida: começa vazia */ }
  });
  window.iniciarPainel(dados);
  mostrarStatus('Salvo');
} catch (e) {
  mostrarStatus('Sem conexão', true);
  document.getElementById('app').innerHTML = '';
  aviso.textContent = `Não foi possível abrir o painel: ${mensagemErro(e)}`;
  aviso.hidden = false;
}
