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
// =========================================================
const OPERA = ['lider', 'carregador'];
const GESTAO = ['admin', 'lider'];
const ADMIN = ['admin'];
const QR = 'tools/carregamento/';
const PAINEL = 'tools/carregamento/painel.html';
const QUADRO = 'tools/expedicao/';
const EQUIPES = 'tools/admin/';
const CONF = 'tools/conferencia/';
const IMPORTACOES = 'tools/importacoes/';

export const MENU = [
  { grupo: 'Operação', itens: [
    { id: 'ler', nome: 'Leitura de QR', icone: 'qr', link: QR, aba: 'ler', perfis: OPERA },
    { id: 'minhas', nome: 'Leituras da equipe', icone: 'prancheta', link: QR, aba: 'minhas', perfis: OPERA },
    { id: 'corrigir', nome: 'Corrigir leituras', icone: 'ferramenta', link: QR, aba: 'equipe', perfis: ['lider'] },
  ] },
  { grupo: 'Produtividade', itens: [
    { id: 'prod', nome: 'Produtividade', icone: 'grafico', link: PAINEL, aba: 'prod', perfis: GESTAO },
    { id: 'lanc', nome: 'Lançamentos', icone: 'lista', link: PAINEL, aba: 'lanc', perfis: GESTAO },
    { id: 'carr', nome: 'Carregamentos', icone: 'caixa', link: PAINEL, aba: 'carr', perfis: GESTAO },
    { id: 'leit', nome: 'Leituras', icone: 'qr', link: PAINEL, aba: 'leit', perfis: GESTAO },
    { id: 'div', nome: 'Divergências', icone: 'alerta', link: PAINEL, aba: 'div', perfis: ADMIN },
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
  { grupo: 'Conferência', itens: [
    { id: 'cf-painel', nome: 'Painel de pontuação', icone: 'grafico', link: CONF, aba: 'painel', perfis: ADMIN },
    { id: 'cf-conferentes', nome: 'Conferentes', icone: 'usuarios', link: CONF, aba: 'conferentes', perfis: ADMIN },
    { id: 'cf-metas', nome: 'Metas', icone: 'alvo', link: CONF, aba: 'metas', perfis: ADMIN },
    { id: 'cf-acomp', nome: 'Acompanhamento', icone: 'tendencia', link: CONF, aba: 'acomp', perfis: ADMIN },
    { id: 'cf-qualidade', nome: 'Qualidade', icone: 'escudo', link: CONF, aba: 'qualidade', perfis: ADMIN },
    { id: 'cf-lanc', nome: 'Erros e transportadora', icone: 'alerta', link: CONF, aba: 'lanc', perfis: ADMIN },
    { id: 'cf-tempos', nome: 'Tempos', icone: 'relogio', link: CONF, aba: 'tempos', perfis: ADMIN },
    { id: 'cf-historico', nome: 'Histórico de pontuação', icone: 'calendario', link: CONF, aba: 'historico', perfis: ADMIN },
    { id: 'cf-feedback', nome: 'Feedback', icone: 'mensagem', link: CONF, aba: 'feedback', perfis: ADMIN },
    { id: 'cf-config', nome: 'Configuração da conferência', icone: 'engrenagem', link: CONF, aba: 'config', perfis: ADMIN },
  ] },
  { grupo: 'Dados', itens: [
    { id: 'importacoes', nome: 'Importações', icone: 'upload', link: IMPORTACOES, aba: 'importar', perfis: ADMIN },
  ] },
];

/** Grupos do menu só com os itens que o perfil pode usar. */
export function menuDoPerfil(perfil) {
  return MENU.map((g) => ({ grupo: g.grupo, itens: g.itens.filter((i) => i.perfis.includes(perfil)) }))
    .filter((g) => g.itens.length);
}
