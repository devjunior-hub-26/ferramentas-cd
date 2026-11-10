# Plataforma corporativa unificada

## Intenção
Transformar as ferramentas separadas em um único sistema corporativo, fácil de navegar em computador e celular. Aprovado pelo gestor em 10/11/2026.

## Objetivos
- Menu lateral retrátil em azul-marinho: recolhe para ícones no computador e abre por cima da tela no celular. Cada perfil vê só o que pode usar.
- As abas das ferramentas viram itens do menu.
- Filtros fixos no topo de cada tela. No celular, recolhidos em uma linha que expande ao tocar.
- Nenhuma rolagem lateral, nem no computador.
- "Colaboradores e Acessos" une Usuários e Hierarquia: cada pessoa aparece uma vez, com a opção "Tem acesso à plataforma?". Marcada, define usuário, senha e perfil. Desmarcada, bloqueia o acesso e preserva o histórico.
- Equipes usam as mesmas pessoas.

## Fora do escopo
- Regras de leitura, cálculo de produtividade e exportações.

## Dados
- `ExpColaboradores` ganha `usuario_id`. Na primeira leitura, usuários são ligados pelo login igual à chapa.
- Contas sem colaborador aparecem em lista própria para revisar e vincular. Ninguém é apagado. O administrador segue como conta à parte.
- Excluir um colaborador com acesso também bloqueia a conta dele.

## Abordagens
1. **Casca única com as ferramentas dentro (escolhida):** o menu fica na tela principal e cada ferramenta continua isolada no quadro, sem reescrever leitura de QR e painel.
2. **Fundir tudo em uma única página (descartada):** arriscaria o modo offline e o leitor de QR.

## Decisões do construtor
- Abas continuam no código, escondidas, e são acionadas pelo endereço interno do quadro.
- Tabela que não couber na largura vira cartões automaticamente, medindo a largura real.
- Organograma em lista por níveis em todas as telas; a foto segue em árvore.
