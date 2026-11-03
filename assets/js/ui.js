// Funções de interface reutilizadas por todas as ferramentas.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Escapa texto para colocar com segurança dentro de innerHTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, tipo = 'info', ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** Abas simples: botões com data-aba="id" mostram a seção #aba-id. */
export function iniciarAbas(container, aoTrocar) {
  const botoes = $$('button[data-aba]', container);
  const ativar = (id) => {
    botoes.forEach((b) => {
      const sel = b.dataset.aba === id;
      b.setAttribute('aria-selected', sel);
      const sec = document.getElementById('aba-' + b.dataset.aba);
      if (sec) sec.hidden = !sel;
    });
    aoTrocar?.(id);
  };
  botoes.forEach((b) => b.addEventListener('click', () => ativar(b.dataset.aba)));
  const inicial = botoes.find((b) => !b.hidden);
  if (inicial) ativar(inicial.dataset.aba);
  return ativar;
}

/** Abre um <dialog> e resolve com os dados do form (ou null se cancelar). */
export function abrirModal(dialog, aoPreparar) {
  return new Promise((resolve) => {
    const form = $('form', dialog);
    form.reset();
    aoPreparar?.(form);
    const fechar = (valor) => { dialog.close(); form.onsubmit = null; resolve(valor); };
    form.onsubmit = (ev) => { ev.preventDefault(); fechar(Object.fromEntries(new FormData(form))); };
    $$('[data-cancelar]', dialog).forEach((b) => (b.onclick = () => fechar(null)));
    dialog.oncancel = () => resolve(null);
    dialog.showModal();
  });
}

// ---------- Datas e números (pt-BR) ----------
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const dataHora = (v) => (v ? fmtDataHora.format(new Date(v)) : '');
export const hora = (v) => (v ? fmtHora.format(new Date(v)) : '');
export const numero = (v) => (v == null || v === '' ? '' : fmtNum.format(v));

/** 'AAAA-MM-DD' do dia local. */
export function hojeISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Início do dia local (AAAA-MM-DD) → ISO em UTC, para filtrar no banco. */
export function inicioDoDia(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toISOString();
}
export function inicioDoDiaSeguinte(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d + 1).toISOString();
}

/** Milissegundos → "1h 05min" */
export function duracao(ms) {
  if (ms == null || isNaN(ms)) return '';
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h}h ${String(min % 60).padStart(2, '0')}min` : `${min}min`;
}
