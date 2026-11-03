// Fila offline no IndexedDB: leituras feitas sem sinal ficam aqui com
// status 'pendente' até serem enviadas ao servidor (ou 'erro' se o servidor recusar).
const BANCO = 'carregamento-fila';
const TABELA = 'leituras';
let conexao = null;

function abrir() {
  if (conexao) return Promise.resolve(conexao);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      const st = req.result.createObjectStore(TABELA, { keyPath: 'client_id' });
      st.createIndex('usuario_id', 'usuario_id');
    };
    req.onsuccess = () => { conexao = req.result; resolve(conexao); };
    req.onerror = () => reject(req.error);
  });
}

async function operar(modo, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TABELA, modo);
    const req = fn(tx.objectStore(TABELA));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const adicionar = (item) => operar('readwrite', (st) => st.put(item));
export const atualizar = (item) => operar('readwrite', (st) => st.put(item));
export const remover = (clientId) => operar('readwrite', (st) => st.delete(clientId));

/** Itens do usuário (cada usuário só envia as próprias leituras). */
export async function listar(usuarioId) {
  const itens = await operar('readonly', (st) => st.index('usuario_id').getAll(usuarioId));
  return (itens || []).sort((a, b) => a.lido_em.localeCompare(b.lido_em));
}
