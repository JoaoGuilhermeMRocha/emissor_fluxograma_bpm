/**
 * Prepara a pasta web/vendor: empacota cada dependência do navegador num
 * módulo ES pronto para o `importmap` do index.html e copia os CSS do
 * bpmn-js. Rode depois de atualizar dependências: `pnpm vendor`.
 *
 * O resultado vai para o Git, assim quem só quer usar o sistema roda
 * `uv run python server.py` sem precisar de Node.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'web', 'vendor');
const require = createRequire(join(raiz, 'package.json'));
const pastaDoPacote = (nome) => dirname(require.resolve(`${nome}/package.json`));

/** Nome no importmap → módulo de entrada. */
const ENTRADAS = {
  'bpmn-modeler': 'export { default } from "bpmn-js/lib/Modeler";',
  'bpmn-viewer': 'export { default } from "bpmn-js/lib/Viewer";',
  'bpmn-moddle': 'export * from "bpmn-moddle";',
  zod: 'export * from "zod";',
  fflate: 'export * from "fflate";',
  dexie: 'export { default } from "dexie"; export * from "dexie";',
  'browser-fs-access': 'export * from "browser-fs-access";',
  morphdom: 'export { default } from "morphdom";',
};

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });

const tmp = join(raiz, 'node_modules', '.vendor-entradas');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const entryPoints = Object.entries(ENTRADAS).map(([nome, codigo]) => {
  const arquivo = join(tmp, `${nome}.js`);
  writeFileSync(arquivo, codigo);
  return { in: arquivo, out: nome };
});

// `splitting`: o que o bpmn-js e o bpmn-moddle compartilham vai para um pedaço comum, sem duplicar
await build({
  entryPoints,
  outdir: destino,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'linked',
  chunkNames: 'comum/[name]-[hash]',
  logLevel: 'warning',
  absWorkingDir: raiz,
});
rmSync(tmp, { recursive: true, force: true });

// CSS e fonte do bpmn-js
const assets = join(pastaDoPacote('bpmn-js'), 'dist', 'assets');
cpSync(join(assets, 'diagram-js.css'), join(destino, 'bpmn-js', 'diagram-js.css'));
cpSync(join(assets, 'bpmn-js.css'), join(destino, 'bpmn-js', 'bpmn-js.css'));
cpSync(join(assets, 'bpmn-font', 'css', 'bpmn-embedded.css'), join(destino, 'bpmn-js', 'bpmn-embedded.css'));

// Versões empacotadas, para saber o que está na pasta
const versoes = Object.fromEntries(
  ['bpmn-js', 'bpmn-moddle', 'zod', 'fflate', 'dexie', 'browser-fs-access', 'morphdom'].map((p) => [
    p,
    JSON.parse(readFileSync(join(pastaDoPacote(p), 'package.json'), 'utf8')).version,
  ]),
);
writeFileSync(join(destino, 'versoes.json'), JSON.stringify(versoes, null, 2) + '\n');
console.log('web/vendor pronto:', versoes);
