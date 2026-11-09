# Ferramentas do CD

Hub de ferramentas (PWA, mobile-first) hospedado no GitHub Pages, com uma **planilha do Google** como banco de dados e um **Google Apps Script** como servidor (login, permissões e regras).
Primeira ferramenta: **Produtividade de Carregamento**, com leitura de QR Code das cargas pela câmera do celular.

```
/index.html                     → login + hub
/INICIAR-TESTE.bat              → abre o site no computador para teste (dois cliques)
/manifest.json, /sw.js          → app instalável e funcionando com sinal fraco
/assets/css/global.css          → cores (variáveis no :root) e componentes
/assets/js/config.js            → endereço do servidor  ← EDITAR
/assets/js/api.js               → comunicação com o servidor
/assets/js/auth.js              → login único, proteção das páginas
/assets/js/simulador.js         → modo de teste (servidor rodando no navegador)
/assets/js/tools.js             → lista de ferramentas do hub
/assets/js/ui.js, icones.js     → funções de tela e ícones
/assets/icons/                  → ícones do app
/tools/carregamento/            → leitura de QR (index.html) e painel (painel.html)
/tools/admin/                   → usuários, equipes e histórico
/tools/_modelo/                 → modelo para criar ferramentas novas
/apps-script/Codigo.gs          → o servidor: colar no Apps Script da planilha
/docs/NOVA-FERRAMENTA.md        → como adicionar uma ferramenta
```

---

## Experimentar agora (modo de teste)

Sem configurar nada: dê dois cliques em **`INICIAR-TESTE.bat`**. O navegador abre em `http://localhost:8080`. Entre com o login e a senha de administrador do modo de teste (passados à parte; não ficam escritos no código).

No modo de teste o servidor roda dentro do próprio navegador e os dados ficam só naquele computador. Uma faixa amarela no rodapé lembra disso e tem o botão **Apagar dados de teste**. É assim enquanto `assets/js/config.js` tiver `API_URL = 'TESTE'`.

> Deixe a janela preta do `.bat` aberta enquanto testa. Abrir o `index.html` direto pelo Windows Explorer não funciona.

---

## Passo a passo de instalação (para valer)

### 1. Criar a planilha

1. Entre em <https://sheets.google.com> com a conta Google da empresa (ou a sua) e crie uma **planilha em branco**.
2. Dê um nome, ex.: `Ferramentas do CD - Dados`.

> Essa planilha é o banco de dados. **Não compartilhe com os carregadores**: quem pode editar a planilha pode alterar os dados direto. O app não precisa de compartilhamento nenhum.

### 2. Colar o servidor

1. Na planilha, menu **Extensões → Apps Script**. Abre um editor numa nova aba.
2. Apague o código que aparece (`function myFunction...`).
3. Abra o arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs) com o Bloco de Notas, copie tudo e cole no editor.
4. No topo do código, preencha `LOGIN_INICIAL_ADMIN` e `SENHA_INICIAL_ADMIN` com o login e a senha do primeiro administrador. Faça isso **só no editor do Apps Script**, nunca no arquivo que vai para o GitHub.
5. Clique no ícone de **disquete** (Salvar).

### 3. Preparar a planilha

1. No topo do editor, ao lado de **Depurar**, escolha a função **`instalar`** e clique em **Executar**.
2. Na primeira vez o Google pede autorização:
   **Revisar permissões** → escolha sua conta → aparece "O Google não verificou este app" → **Avançado** → **Acessar Ferramentas do CD (não seguro)** → **Permitir**.
   O aviso aparece porque o script é seu e não passou por revisão do Google. Ele só acessa esta planilha.
3. No rodapé deve aparecer "Execução concluída". Na planilha surgem as abas `Usuarios`, `Equipes`, `Membros`, `Leituras`, `Carregamentos967`, `Config` e `Sessoes`.
4. Volte `LOGIN_INICIAL_ADMIN` e `SENHA_INICIAL_ADMIN` para `'TROQUE-ESTE-LOGIN'` e `'TROQUE-ESTA-SENHA'` e salve. O administrador já foi criado; a senha não precisa ficar escrita em lugar nenhum.

### 4. Publicar o servidor

1. No editor, clique em **Implantar → Nova implantação**.
2. Na engrenagem ao lado de "Selecione o tipo", escolha **App da Web**.
3. Preencha:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar** e copie a **URL do app da Web** (começa com `https://script.google.com/macros/s/` e termina em `/exec`).

> "Qualquer pessoa" significa que o celular consegue chamar o servidor sem login do Google. Toda ação, menos a de entrar, exige o login do app, e o servidor confere o perfil e a equipe antes de ler ou gravar.

### 5. Ligar o site ao servidor

Edite [`assets/js/config.js`](assets/js/config.js) e troque `'TESTE'` pela URL copiada:

```js
export const API_URL = 'https://script.google.com/macros/s/AKfy.../exec';
```

Teste no computador com o `INICIAR-TESTE.bat`: entre com o login e a senha do passo 2.

### 6. Subir no GitHub e ativar o GitHub Pages

1. Crie uma conta em <https://github.com> e clique em **New repository**.
   - Nome: ex. `ferramentas-cd`
   - Visibilidade: **Public** (o GitHub Pages gratuito exige repositório público; o código não tem senhas nem dados).
2. Envie os arquivos. Pelo navegador: **Add file → Upload files**, arraste **todo o conteúdo** desta pasta (incluindo o arquivo `.nojekyll`) e clique em **Commit changes**.
3. No repositório: **Settings → Pages** → em **Source** escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** → **Save**.
4. Em 1 a 2 minutos o site fica no ar em `https://SEU_USUARIO.github.io/ferramentas-cd/`.

> O arquivo `.nojekyll` é obrigatório: sem ele o GitHub Pages ignora pastas que começam com `_` (como `tools/_modelo`).

### 7. Primeiro uso

1. Abra o site no computador e entre com o login de administrador.
2. **Usuários e Equipes → Usuários → Importar colaboradores**: cole do Excel as colunas Matrícula, Nome e Função. O login de cada pessoa é a matrícula e, com a opção **Senha inicial igual à matrícula** (já vem marcada), a senha também. Sem a opção, a senha é gerada na hora e aparece uma única vez: use **Baixar lista**. Líderes que não estiverem na lista podem ser criados em **+ Novo usuário**.
3. **Equipes**: crie as equipes, escolha o líder e adicione as pessoas.
4. **Painel de Produtividade → Importar 967**: importe a planilha do Winthor.
5. No celular de um carregador: abra o endereço no Chrome (Android) ou Safari (iPhone), entre e use **Adicionar à tela inicial** para instalar.

### Atualizar o servidor (quando o `Codigo.gs` mudar)

Cole o código novo no editor, salve e vá em **Implantar → Gerenciar implantações → lápis (Editar) → Versão: Nova versão → Implantar**. Assim a URL continua a mesma. Se criar uma **nova implantação** em vez disso, a URL muda e é preciso trocar no `config.js`.

### Publicar uma nova versão do site

Altere os arquivos, envie ao GitHub e **aumente `VERSAO` no `sw.js`** (ex.: `v2.0.0` → `v2.0.1`). Sem isso, os celulares continuam usando os arquivos guardados.

---

## Como funciona

### Perfis

| Perfil | O que faz |
|---|---|
| **Administrador** | Cria/edita/desativa usuários, monta equipes, importa a 967, vê todos os lançamentos, divergências, configurações e exporta Excel. |
| **Líder** | Lê QR Codes como um carregador e, na aba **Minha equipe**, acompanha as leituras da própria equipe, **corrige** carregamento/box e **cancela** leituras erradas (com motivo; nada é apagado). Vê o painel de produtividade só da própria equipe. |
| **Carregador** | Entra, lê QR Codes e vê a confirmação e o histórico das próprias leituras do dia. |

### Segurança

- A planilha fica privada na sua conta Google. O site só conversa com o Apps Script, e ele confere o login, o perfil e a equipe **em toda ação**. Alterar o código do site no navegador não dá acesso a nada a mais.
- As senhas são guardadas embaralhadas (hash com sal), nunca em texto. Nem o administrador consegue ver a senha de alguém, só trocar.
- Depois de 5 senhas erradas seguidas, o login daquele usuário fica bloqueado por 5 minutos.
- Trocar a senha ou desativar um usuário desconecta os celulares dele.
- Cada celular fica logado por até 60 dias (`DIAS_SESSAO` no `Codigo.gs`).

### Leitura do QR Code e lançamentos

Um **lançamento** é um caminhão. Como um caminhão leva vários carregamentos (de várias cidades), o carregador lê as etiquetas de todos eles e, no fim, toca em **Salvar lançamento**.

- Formato: `carregamento|box|transação` (ex.: `3354419|3|2734182`), os três numéricos.
- Leitura inválida → aviso vermelho, som de erro e nada entra no lançamento.
- Leitura válida → vibração, bipe e a leitura entra no **lançamento atual**, que mostra cada carregamento com a cidade (da 967).
- Com sinal, o servidor confere cada leitura na hora (carregamento repetido, carregamento de outra equipe). Uma leitura recusada fica vermelha e precisa ser tirada (botão **Tirar**) antes de salvar.
- **Salvar lançamento** grava tudo de uma vez. Se alguma leitura for recusada nesse momento, nada é gravado e ela fica marcada para tirar.
- O lançamento aberto fica guardado no celular: fechar o app ou ficar sem bateria não perde as leituras.
- O mesmo número de carregamento não pode ser lançado duas vezes (verificado no celular e no servidor). Box e transação podem se repetir.
- Se a etiqueta estiver danificada, o botão **Digitar** permite informar os números à mão.
- A equipe **não é escolhida pelo carregador**: o servidor grava a equipe em que ele estava no momento da leitura (pelo histórico de composição). Sem equipe, a leitura é bloqueada com "Você não está em nenhuma equipe. Procure o administrador."

### Duas equipes no mesmo carregamento

Fica a critério do Admin, em **Painel → Configurações**:

- **Desligado (padrão):** a segunda equipe é **bloqueada** com "Carregamento já iniciado pela Equipe X".
- **Ligado:** a leitura é aceita e a equipe recebe o **aviso** em amarelo.

### Sem sinal (offline)

- O app abre mesmo sem internet (arquivos guardados pelo service worker).
- Lançamentos salvos sem sinal ficam no celular (IndexedDB) como **pendentes**. O número aparece no topo da tela.
- Quando a conexão volta, eles são enviados sozinhos (a cada 20 s, ao voltar o sinal e ao abrir o app), com a hora real das leituras e do salvamento. Se uma resposta se perder no caminho, o reenvio não duplica nada.
- Se o servidor recusar alguma leitura (ex.: carregamento de outra equipe), o lançamento aparece em **Lançamentos não aceitos pelo servidor**, com as leituras recusadas e as opções **Tirar recusadas e reenviar** ou **Descartar**.
- O primeiro login em cada celular precisa de internet.

### Importação da 967

A tela já está ajustada para a 967 usada no CD (34 colunas, cabeçalho na linha 1). Dela são usadas **Carregamento**, **Destino**, **Rota principal**, **Peso total** e **Saída** (data do carregamento); as outras colunas são ignoradas.

- **Não importar estes destinos:** por padrão, `VENDA BALCAO` fica de fora, porque não passa pelas equipes e encheria a lista de divergências. Dá para incluir outros, separados por vírgula; a escolha fica guardada no computador.
- A última linha da 967 (totais) é ignorada sozinha.
- Peso negativo (erro de cadastro) é importado sem peso.

Outras exportações também funcionam: a tela reconhece nomes comuns (ex.: `NUMCAR`, `Rota`, `TOTPESO`, `Dt. Faturamento`) e encontra a linha do cabeçalho mesmo com linhas de título antes. Se a sua exportação usar outros nomes, escolha as colunas na tela. Para que sejam reconhecidos sozinhos, inclua os nomes em `APELIDOS` no arquivo [`tools/carregamento/importar967.js`](tools/carregamento/importar967.js).

- Prévia antes de confirmar (novos × atualizados, peso total, linhas ignoradas).
- Reimportar **atualiza** pelo número do carregamento, sem duplicar.
- Se o mesmo carregamento aparecer em várias linhas (um por pedido, por exemplo), o peso é somado (opção na tela).
- A **data do carregamento** serve para a divergência "na 967 e nenhuma equipe lançou". Sem coluna de data, é usada a data escolhida na tela.

### Painel de produtividade

Filtros por período, equipe, usuário e carregamento. Abas:

- **Produtividade:** por equipe e por usuário (lançamentos, carregamentos, peso total, leituras, tempo total e **tempo médio por lançamento**).
- **Lançamentos:** cada caminhão, com os carregamentos, as cidades, o peso, as leituras e o tempo.
- **Carregamentos:** cada carregamento × equipe com destino, rota, peso, box, usuários, primeira e última leitura.

**Tempo de um lançamento** = de quando o lançamento anterior da equipe foi salvo até quando este foi salvo, no mesmo dia. O primeiro lançamento do dia conta da primeira leitura até salvar. Por usuário, a conta usa só os lançamentos da própria pessoa.
- **Leituras:** todas as leituras individuais.
- **Divergências** (Admin): lidos que não constam na 967 e carregamentos da 967 que ninguém lançou.
- **Exportar Excel:** gera um .xlsx com uma aba para cada visão.

### A planilha

Cada aba é uma tabela. As datas ficam no formato `2026-11-02T13:45:00.000Z` (horário UTC, 3 horas à frente de Brasília); o app e o Excel exportado mostram no horário local. Evite editar a planilha à mão. Se precisar, nunca apague ou reordene colunas, e não altere a aba `Sessoes`.

---

## Observações

- **Velocidade:** cada leitura costuma levar de 1 a 3 segundos para ser confirmada pelo Google, e a tela espera essa resposta antes de aceitar a próxima etiqueta. A primeira chamada depois de um tempo parado pode demorar mais. Se passar de 8 segundos, a leitura vai para a fila do celular e é enviada sozinha logo depois.
- **Tamanho:** uma planilha do Google aceita até 10 milhões de células, o que dá cerca de 600 mil leituras. Perto disso, faça uma cópia da planilha como arquivo do ano e limpe a aba `Leituras` (mantenha a linha do cabeçalho).
- **Volume:** o Apps Script atende bem algumas dezenas de pessoas lendo ao mesmo tempo. Para centenas de leituras por minuto, um banco de dados de verdade aguenta melhor.
- **Câmera:** só funciona em HTTPS (o GitHub Pages já usa) ou em `localhost`.
- **Testar no computador:** dois cliques em `INICIAR-TESTE.bat` (usa o `servidor-teste.ps1`) e acesse `http://localhost:8080`.
