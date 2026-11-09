// MODO DE TESTE: roda o próprio servidor (apps-script/Codigo.gs) dentro do
// navegador, imitando as planilhas do Google com o localStorage. Serve para
// experimentar o app sem configurar nada. Não use em produção.
const CHAVE = 'cd-simulador';

// Administrador do modo de teste. O código guarda só o resumo (hash) do login e
// da senha, que não pode ser revertido; o administrador é criado no primeiro
// login que bater com eles. Para trocar, gere novos valores com hashSenha().
const ADMIN_TESTE = {
  login: 'eA6WUYqqVaTsbTGbqGee1m1vZ_zGaaJSmWaW77E_np8=',
  sal: '3b5f81ff-3ff3-4e98-969f-053820163ae1',
  senha: 'F0YuKdzQDoi2MJ0nixghW72sYxcQjVo71fAS0VYlvtk=',
};

let servidor = null;
let dados = null; // { abas: { Nome: [[...linha1], [...linha2]] } }

function carregar() {
  try { dados = JSON.parse(localStorage.getItem(CHAVE)) || { abas: {} }; } catch { dados = { abas: {} }; }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { console.warn('Simulador: armazenamento cheio'); }
}
export function zerar() {
  localStorage.removeItem(CHAVE);
  dados = null;
}

// ---------- Imitação do SpreadsheetApp ----------
class Faixa {
  constructor(linhas, r, c, nr, nc) { Object.assign(this, { linhas, r, c, nr, nc }); }
  getRow() { return this.r; }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const lin = this.linhas[this.r - 1 + i] || [];
      out.push(Array.from({ length: this.nc }, (_, j) => lin[this.c - 1 + j] ?? ''));
    }
    return out;
  }
  setValues(v) {
    v.forEach((lin, i) => {
      const k = this.r - 1 + i;
      while (this.linhas.length <= k) this.linhas.push([]);
      lin.forEach((x, j) => { this.linhas[k][this.c - 1 + j] = String(x ?? ''); });
    });
    return this;
  }
  clearContent() {
    this.linhas.splice(this.r - 1, this.nr);
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  createTextFinder(t) {
    const faixa = this;
    return {
      matchEntireCell() { return this; },
      findAll() {
        const achados = [];
        faixa.getValues().forEach((lin, i) => lin.forEach((x, j) => {
          if (x === String(t)) achados.push(new Faixa(faixa.linhas, faixa.r + i, faixa.c + j, 1, 1));
        }));
        return achados;
      },
    };
  }
}

class Aba {
  constructor(nome) { this.nome = nome; this.linhas = dados.abas[nome]; }
  getLastRow() { return this.linhas.length; }
  getMaxRows() { return Math.max(1000, this.linhas.length); }
  insertRowsAfter() {}
  setFrozenRows() {}
  getRange(r, c, nr = 1, nc = 1) { return new Faixa(this.linhas, r, c, nr, nc); }
}

const planilha = {
  getSheetByName: (n) => (dados.abas[n] ? new Aba(n) : null),
  insertSheet: (n) => { dados.abas[n] = []; return new Aba(n); },
  getSheets: () => Object.keys(dados.abas).map((n) => new Aba(n)),
  deleteSheet() {},
};

// ---------- Imitação dos outros serviços do Apps Script ----------
const memoria = new Map();
const CacheService = {
  getScriptCache: () => ({
    get: (k) => { const x = memoria.get(k); return x && x.ate > Date.now() ? x.v : null; },
    put: (k, v, seg = 600) => memoria.set(k, { v: String(v), ate: Date.now() + seg * 1000 }),
    remove: (k) => memoria.delete(k),
  }),
};
const LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) };
const ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
};
const Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  getUuid: () => crypto.randomUUID(),
  computeDigest: (_alg, s) => sha256(new TextEncoder().encode(s)),
  base64EncodeWebSafe: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_'),
};

// SHA-256 síncrono (o Apps Script é síncrono; crypto.subtle não é)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256(msg) {
  const l = msg.length;
  const nb = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(nb);
  m.set(msg);
  m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(nb - 8, Math.floor((l * 8) / 2 ** 32));
  dv.setUint32(nb - 4, (l * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const dvo = new DataView(out.buffer);
  H.forEach((x, i) => dvo.setUint32(i * 4, x));
  return out;
}

// ---------- Carrega o Codigo.gs e responde às chamadas ----------
async function iniciar() {
  if (servidor && dados) return;
  if (!dados) carregar();
  if (!servidor) {
    const codigo = await (await fetch(new URL('../../apps-script/Codigo.gs', import.meta.url), { cache: 'no-cache' })).text();
    const SpreadsheetApp = { getActive: () => planilha, getActiveSpreadsheet: () => planilha };
    servidor = new Function('SpreadsheetApp', 'LockService', 'CacheService', 'Utilities', 'ContentService',
      `${codigo}\n;return { doPost, prepararPlanilha, criarAdminInicial, sha256, hashSenha };`)(SpreadsheetApp, LockService, CacheService, Utilities, ContentService);
  }
  // Dados novos ou de uma versão anterior: cria as abas que faltam
  servidor.prepararPlanilha();
  salvar();
}

/** Cria o administrador de teste se o login digitado for o dele. */
function semearAdmin(d) {
  const login = String(d.login || '').trim().toLowerCase();
  if (servidor.sha256(login) !== ADMIN_TESTE.login) return;
  if (servidor.hashSenha(String(d.senha || ''), ADMIN_TESTE.sal) !== ADMIN_TESTE.senha) return;
  servidor.criarAdminInicial(login, String(d.senha));
}

export async function chamar(corpo) {
  await new Promise((r) => setTimeout(r, 120)); // imita o tempo de resposta
  if (!navigator.onLine) throw new TypeError('Failed to fetch'); // permite testar o modo offline
  await iniciar();
  if (corpo.acao === 'login') semearAdmin(corpo.dados || {});
  const resp = servidor.doPost({ postData: { contents: JSON.stringify(corpo) } });
  salvar();
  return JSON.parse(resp.getContent());
}
