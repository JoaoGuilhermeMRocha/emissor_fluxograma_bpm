/** @import { ResultadoLeitura } from '../arquivo/arquivo.js' */
/** @import { GrafoImportado, Importador } from './grafo-importado.js' */
/**
 * Ponto de entrada único para abrir arquivos: detecta o formato pelo nome
 * e pelo conteúdo e escolhe entre o arquivo do sistema (.processo) e os
 * importadores de outros formatos (ESPECIFICACAO §11.1).
 */
import { FORMATO, lerProcesso } from '../arquivo/arquivo.js';
import { importadorBpmn } from './bpmn.js';
import { importadorFluidSvg } from './fluid-svg.js';
import { importadorPlanilha } from './planilha.js';

export const IMPORTADORES = [importadorBpmn, importadorPlanilha, importadorFluidSvg];

export const LIMITE_ARQUIVO = 40 * 1024 * 1024; // SVG do Fluid pode passar de 20 MB

/**
 * Extensões aceitas no seletor de arquivos.
 * @type {string[]}
 */
export const EXTENSOES_ACEITAS = ['.processo', ...new Set(IMPORTADORES.flatMap((i) => i.extensoes))];

/**
 * @param {string} nome
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function pareceProcesso(nome, bytes) {
  if (nome.toLowerCase().endsWith('.processo')) return true;
  const inicio = new TextDecoder('utf-8').decode(bytes.subarray(0, 300));
  return inicio.trimStart().startsWith('{') && inicio.includes(`"${FORMATO}"`);
}

/**
 * Importadores que reconhecem o arquivo, do mais provável ao menos provável.
 * @param {string} nome
 * @param {Uint8Array} bytes
 * @returns {{ importador: Importador; confianca: number }[]}
 */
export function candidatos(nome, bytes) {
  return IMPORTADORES.map((importador) => ({ importador, confianca: importador.detectar(nome, bytes) }))
    .filter((c) => c.confianca > 0)
    .sort((a, b) => b.confianca - a.confianca);
}

/**
 * @param {string} nome
 * @param {Uint8Array} bytes
 * @param {string} [formatoForcado]
 * @returns {Promise<ResultadoAbertura>}
 */
export async function abrirArquivo(nome, bytes, formatoForcado) {
  if (bytes.length > LIMITE_ARQUIVO) return { tipo: 'erro', erro: 'Arquivo maior que 40 MB' };
  if (!formatoForcado && pareceProcesso(nome, bytes)) {
    return { tipo: 'processo', leitura: lerProcesso(new TextDecoder('utf-8').decode(bytes)) };
  }
  const importador = formatoForcado
    ? IMPORTADORES.find((i) => i.formato === formatoForcado)
    : candidatos(nome, bytes)[0]?.importador;
  if (!importador) {
    return { tipo: 'erro', erro: `Formato não reconhecido. Aceitos: ${EXTENSOES_ACEITAS.join(', ')}` };
  }
  try {
    return { tipo: 'importacao', importador, grafos: await importador.importar(bytes) };
  } catch (e) {
    return { tipo: 'erro', erro: e instanceof Error ? e.message : String(e) };
  }
}
/**
 * @typedef {| { tipo: 'processo'; leitura: ResultadoLeitura }
 *   | { tipo: 'importacao'; importador: Importador; grafos: GrafoImportado[] }
 *   | { tipo: 'erro'; erro: string }} ResultadoAbertura
 */
