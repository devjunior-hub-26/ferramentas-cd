// =========================================================
//  MENU LATERAL DO SISTEMA
//  Para adicionar uma tela: inclua um item no grupo certo e crie a pasta
//  /tools/<id>/ com um index.html (veja docs/NOVA-FERRAMENTA.md).
//
//  id       identificador único (sem espaço)
//  nome     texto no menu e no título da tela
//  icone    nome de um ícone de assets/js/icones.js
//  link     caminho da página a partir da raiz do site
//  aba      seção da página que o item abre (data-aba)
//  perfis   perfis que veem o item: 'admin', 'lider', 'carregador'
//  emBreve  true = item aparece desabilitado
// =========================================================
const OPERA = ['lider', 'carregador'];
const GESTAO = ['admin', 'lider'];
const ADMIN = ['admin'];
const TODOS = ['admin', 'lider', 'carregador'];
const QR = 'tools/carregamento/';
const PAINEL = 'tools/carregamento/painel.html';
const QUADRO = 'tools/expedicao/';
const EQUIPES = 'tools/admin/';

export const MENU = [
  { grupo: 'Operação', itens: [
    { id: 'ler', nome: 'Leitura de QR', icone: 'qr', link: QR, aba: 'ler', perfis: OPERA },
    { id: 'minhas', nome: 'Leituras da equipe', icone: 'prancheta', link: QR, aba: 'minhas', perfis: OPERA },
    { id: 'corrigir', nome: 'Corrigir leituras', icone: 'ferramenta', link: QR, aba: 'equipe', perfis: ['lider'] },
  ] },
  { grupo: 'Produtividade', itens: [
    { id: 'prod', nome: 'Produtividade', icone: 'grafico', link: PAINEL, aba: 'prod', perfis: GESTAO },
    { id: 'lanc', nome: 'Lançamentos', icone: 'caminhao', link: PAINEL, aba: 'lanc', perfis: GESTAO },
    { id: 'carr', nome: 'Carregamentos', icone: 'caixa', link: PAINEL, aba: 'carr', perfis: GESTAO },
    { id: 'leit', nome: 'Leituras', icone: 'qr', link: PAINEL, aba: 'leit', perfis: GESTAO },
    { id: 'div', nome: 'Divergências', icone: 'alerta', link: PAINEL, aba: 'div', perfis: ADMIN },
    { id: 'importar', nome: 'Importar 967', icone: 'upload', link: PAINEL, aba: 'importar', perfis: ADMIN },
    { id: 'config', nome: 'Configurações', icone: 'engrenagem', link: PAINEL, aba: 'config', perfis: ADMIN },
  ] },
  { grupo: 'Pessoas', itens: [
    { id: 'org', nome: 'Organograma', icone: 'organograma', link: QUADRO, aba: 'org', perfis: ADMIN },
    { id: 'att', nome: 'Chamada', icone: 'prancheta', link: QUADRO, aba: 'att', perfis: ADMIN },
    { id: 'hist', nome: 'Histórico de chamadas', icone: 'relogio', link: QUADRO, aba: 'hist', perfis: ADMIN },
    { id: 'ferias', nome: 'Férias', icone: 'calendario', link: QUADRO, aba: 'ferias', perfis: ADMIN },
    { id: 'cfg', nome: 'Colaboradores e Acessos', icone: 'usuarios', link: QUADRO, aba: 'cfg', perfis: ADMIN },
    { id: 'equipes', nome: 'Equipes', icone: 'equipe', link: EQUIPES, aba: 'equipes', perfis: ADMIN },
    { id: 'eq-hist', nome: 'Histórico de equipes', icone: 'relogio', link: EQUIPES, aba: 'historico', perfis: ADMIN },
  ] },
  { grupo: 'Em breve', itens: [
    { id: 'inventario', nome: 'Inventário Rotativo', icone: 'caixa', perfis: TODOS, emBreve: true },
    { id: 'checklist', nome: 'Checklist de Equipamentos', icone: 'prancheta', perfis: TODOS, emBreve: true },
    { id: 'avarias', nome: 'Registro de Avarias', icone: 'alerta', perfis: GESTAO, emBreve: true },
  ] },
];

/** Grupos do menu só com os itens que o perfil pode usar. */
export function menuDoPerfil(perfil) {
  return MENU.map((g) => ({ grupo: g.grupo, itens: g.itens.filter((i) => i.perfis.includes(perfil)) }))
    .filter((g) => g.itens.length);
}
