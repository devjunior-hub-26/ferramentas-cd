# Como adicionar uma nova ferramenta ao hub

O login, as cores, o cabeçalho e o modo instalável já estão prontos. Uma ferramenta nova é só **uma pasta + um item na lista**.

## 1. Crie a pasta

Copie `tools/_modelo/` para `tools/<nome>/` (ex.: `tools/inventario/`). O `index.html` do modelo já:

- verifica o login (`exigirLogin([...perfis])`) e devolve ao hub quem não tem permissão;
- usa o CSS global (botões grandes, azul-marinho e branco);
- registra o service worker (funciona instalado no celular);
- carrega `assets/js/guarda.js`: a ferramenta abre dentro do hub, com o endereço limpo, e quem cola o endereço direto precisa fazer login.

Escreva a lógica da ferramenta no `<script type="module">` ou em um arquivo `.js` dentro da pasta.

## 2. Cadastre no hub

Abra `assets/js/tools.js` e inclua um item no grupo certo do `MENU`:

```js
{
  id: 'inventario',
  nome: 'Inventário Rotativo',
  icone: 'caixa',                    // nome de um ícone de assets/js/icones.js
  link: 'tools/inventario/',
  aba: 'contagem',                   // opcional: seção da página (data-aba)
  perfis: ['admin', 'lider', 'carregador'],
},
```

Se já existia um item "Em breve" com o mesmo `id`, basta apagar a linha `emBreve: true`. Filtros da tela vão em `<details class="filtros-fixos">`, que fica fixo no topo. Tabelas dentro de `.tabela-wrap` viram cartões sozinhas quando não cabem.

> O campo `perfis` só esconde o item do menu. A proteção de verdade é o `exigirLogin([...])` da página e, principalmente, a checagem de perfil de cada ação no servidor (`apps-script/Codigo.gs`).

## 3. Se a ferramenta guardar dados

No `apps-script/Codigo.gs`:

1. Inclua a nova aba em `TABELAS` com o nome das colunas, ex.: `Inventario: ['id', 'endereco', 'quantidade', 'usuario_id', 'contado_em']`. Rode a função `instalar` de novo para criar a aba (ela não mexe nas que já existem).
2. Escreva as funções da ferramenta usando `ler`, `inserir`, `atualizar` e `buscar`, e registre cada uma em `ACOES` com os perfis permitidos:
   ```js
   registrarContagem: { perfis: ['admin', 'lider', 'carregador'], fn: acaoRegistrarContagem },
   ```
   A função recebe `(dados, usuario)`; o `usuario` já vem conferido pelo servidor. Use `comTrava(() => ...)` ao gravar.
3. Publique uma nova versão do servidor (veja "Atualizar o servidor" no README).
4. Na página, chame com `await api('registrarContagem', { ... })`, importando `api` de `assets/js/auth.js`.

## 4. Funcionar offline (opcional)

Inclua os arquivos da nova pasta na lista `ARQUIVOS` do `sw.js` e **aumente o número em `assets/js/versao.js`** (ex.: `v1.0.0` → `v1.1.0`). Os celulares baixam a versão nova na próxima abertura com internet.

## 5. Publique

Faça o commit/envio para o GitHub. Em 1 a 2 minutos o GitHub Pages atualiza o site.
