# Identidade visual "Cobalto"

## Intenção
Deixar o hub e as ferramentas bem mais bonitos, com cor nova. O gestor deu liberdade total de design e aprovou esta proposta.

## Objetivos
- Fundo cinza-claro, cartões brancos sem borda e sombra suave.
- Azul-cobalto vivo só em ações. Verde, amarelo e vermelho ficam para status.
- Tela inicial com ícones coloridos por ferramenta e login com fundo em degradê.
- Cabeçalho translúcido, abas em controle segmentado, janelas que sobem do rodapé no celular.
- Tabelas mais leves e indicadores com números grandes.
- Botões reagem no instante do toque. Animações suaves, respeitando "reduzir movimento" e "reduzir transparência".

## Fora do escopo
- Tema escuro.
- Mudanças na lógica, nos dados ou no Apps Script.

## O que não pode piorar
- Alvos de toque grandes para uso com luva e contraste alto para o galpão.
- Funcionamento offline, sem fontes ou bibliotecas novas.
- Exportações em PNG, Excel e impressão.

## Abordagens
1. **Refazer só o visual (escolhida):** o estilo está concentrado em poucos arquivos, então a troca não encosta na lógica.
2. **Reescrever com um framework (descartada):** arriscaria o modo offline e o leitor de QR sem deixar o resultado mais bonito.

## Decisões do construtor
- Cobalto `#2F49E8`, com tokens semânticos no `:root` de `assets/css/global.css`.
- Fonte do próprio sistema, com espaçamento entre letras ajustado por tamanho.
- Movimento só com CSS, curva sem overshoot, usando `@starting-style` nas janelas.
