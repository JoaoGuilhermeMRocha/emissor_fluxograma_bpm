# Mapeador de Processos

Descreva um processo como uma lista de etapas e o sistema desenha o fluxograma BPMN 2.0, monta a matriz RACI, analisa o fluxo e aponta problemas. O diagrama também é editável, e o que você muda nele volta para a lista.

Roda inteiro no navegador, em HTML, CSS e JavaScript puros. Os dados ficam no próprio navegador (IndexedDB), e os processos podem ser salvos em arquivo `.processo` e exportados para BPMN, Excel, CSV e SVG.

## Rodar

Precisa só do [uv](https://docs.astral.sh/uv/):

```sh
uv run python server.py          # http://localhost:5174
uv run python server.py --abrir  # e já abre o navegador
```

O `server.py` só entrega os arquivos da pasta `web/`. Qualquer outro servidor de arquivos estáticos também serve.

## Desenvolver

Precisa de Node e pnpm:

```sh
pnpm install
pnpm typecheck   # checagem de tipos pelos comentários JSDoc
pnpm vendor      # depois de atualizar dependências: regera web/vendor
```

Não há etapa de build: o navegador carrega os módulos de `web/js` direto, e o `importmap` do `web/index.html` aponta as bibliotecas para `web/vendor`.

## Organização

- `web/js/core`: o núcleo, sem tela. Modelo do processo, regras de edição e de raias, validação, análises, RACI, layout com raias, BPMN 2.0 de ida e volta, planilha (CSV/Excel) e importadores.
- `web/js/app`: a interface. Loja de estado própria, telas redesenhadas com morphdom, editor de diagrama com bpmn-js, armazenamento no IndexedDB e importação de vários arquivos ou de uma pasta.
- `web/vendor`: as bibliotecas do navegador já empacotadas, para rodar sem Node.
