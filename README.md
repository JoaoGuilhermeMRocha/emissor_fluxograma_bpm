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
pnpm test        # testes do núcleo e da loja (Vitest)
pnpm typecheck   # checagem de tipos pelos comentários JSDoc
pnpm vendor      # depois de atualizar dependências: regera web/vendor
```

Não há etapa de build: o navegador carrega os módulos de `web/js` direto, e o `importmap` do `web/index.html` aponta as bibliotecas para `web/vendor`.

Detalhes em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md) e [`docs/CONTEXTO_PROJETO.md`](docs/CONTEXTO_PROJETO.md).
