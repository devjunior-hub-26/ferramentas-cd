# Painel de conferência no hub (v3.2.0)

## O que muda
- Novo grupo **Conferência** no menu, só para administrador, com as 10 telas do painel:
  Painel de pontuação, Conferentes, Metas, Acompanhamento, Qualidade, Erros e transportadora,
  Tempos, Histórico de pontuação, Feedback e Configuração da conferência.
- A ferramenta fica em `tools/conferencia/`: `painel.js` (cálculos e telas do painel original),
  `app.js` (login e gravação na planilha), `conferencia.css` (visual do sistema).
- Faixa de vidro fixa no topo de cada tela com o período em apuração; em Tempos traz os filtros
  de data, ordem e equipe; em Feedback, a escolha do colaborador.
- Tabelas viram cartões no celular (sem rolagem lateral), como no resto do sistema.
- Grupo "Em breve" removido do menu.
- Menu lateral azul-marinho sólido; só o marcador da página atual é de vidro.
- Vidro da barra e dos filtros levemente azulado, com borda brilhante e um brilho suave no fundo
  das telas, para o efeito ficar visível sobre o fundo claro.

## Dados
- Ficam na planilha, aba `ConfDados` (parte, ordem, json, alterado_em, alterado_por).
  Cada parte do painel (conferentes, config, qualidade, historico, tempos) é gravada como JSON,
  dividida em pedaços de 40 mil caracteres.
- Ações do servidor (só admin): `conferenciaDados` e `conferenciaSalvar` (grava só as partes enviadas).
- O site envia só as partes que mudaram, juntando alterações próximas (0,9 s), e tenta de novo
  se cair a conexão.
- Nomes e matrículas dos conferentes **não** ficam no código: a lista inicial é cadastrada direto
  na planilha.
- "Recomeçar" agora volta só a configuração para o padrão (a lista original não existe mais no código).
