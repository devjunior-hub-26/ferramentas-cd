// =========================================================
//  LISTA DE FERRAMENTAS DO HUB
//  Para adicionar uma ferramenta: inclua um item aqui e crie a pasta
//  /tools/<id>/ com um index.html (veja docs/NOVA-FERRAMENTA.md).
//
//  id         identificador único (sem espaço)
//  nome       título do card
//  descricao  frase curta mostrada no card
//  icone      nome de um ícone de assets/js/icones.js
//  link       caminho a partir da raiz do site
//  perfis     perfis que veem o card: 'admin', 'lider', 'carregador'
//  cor        cor do ícone na tela inicial, em degradê: ['#clara', '#escura']
//  emBreve    true = card aparece desabilitado com o selo "Em breve"
// =========================================================
export const FERRAMENTAS = [
  {
    id: 'carregamento',
    nome: 'Produtividade de Carregamento',
    descricao: 'Leia o QR Code das cargas e registre o carregamento da sua equipe.',
    icone: 'caminhao',
    cor: ['#FF9A3D', '#F0620F'],
    link: 'tools/carregamento/',
    perfis: ['lider', 'carregador'],
  },
  {
    id: 'carregamento-painel',
    nome: 'Painel de Produtividade',
    descricao: 'Lançamentos, cruzamento com a 967, divergências e relatório em Excel.',
    icone: 'grafico',
    cor: ['#3D67C4', '#102A63'],
    link: 'tools/carregamento/painel.html',
    perfis: ['admin', 'lider'],
  },
  {
    id: 'expedicao',
    nome: 'Quadro da Expedição',
    descricao: 'Organograma, chamada, histórico, férias e hierarquia.',
    icone: 'organograma',
    cor: ['#34C77B', '#128A52'],
    link: 'tools/expedicao/',
    perfis: ['admin'],
  },
  {
    id: 'admin',
    nome: 'Usuários e Equipes',
    descricao: 'Cadastre usuários, monte as equipes e veja o histórico.',
    icone: 'usuarios',
    cor: ['#A06BFF', '#6A3DE8'],
    link: 'tools/admin/',
    perfis: ['admin'],
  },
  {
    id: 'inventario',
    nome: 'Inventário Rotativo',
    descricao: 'Contagem de endereços por leitura de etiqueta.',
    icone: 'caixa',
    link: '#',
    perfis: ['admin', 'lider', 'carregador'],
    emBreve: true,
  },
  {
    id: 'checklist',
    nome: 'Checklist de Equipamentos',
    descricao: 'Inspeção diária de empilhadeiras e paleteiras.',
    icone: 'prancheta',
    link: '#',
    perfis: ['admin', 'lider', 'carregador'],
    emBreve: true,
  },
  {
    id: 'avarias',
    nome: 'Registro de Avarias',
    descricao: 'Fotos e registro de produtos avariados no carregamento.',
    icone: 'alerta',
    link: '#',
    perfis: ['admin', 'lider'],
    emBreve: true,
  },
];

export function ferramentasDoPerfil(perfil) {
  return FERRAMENTAS.filter((f) => f.perfis.includes(perfil));
}
