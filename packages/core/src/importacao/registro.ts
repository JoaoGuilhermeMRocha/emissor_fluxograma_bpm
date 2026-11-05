/**
 * Ponto de entrada único para abrir arquivos: detecta o formato pelo nome
 * e pelo conteúdo e escolhe entre o arquivo do sistema (.processo) e os
 * importadores de outros formatos (ESPECIFICACAO §11.1).
 */
import { FORMATO, lerProcesso, type ResultadoLeitura } from '../arquivo/arquivo';
import { importadorBpmn } from './bpmn';
import type { GrafoImportado, Importador } from './grafo-importado';
import { importadorPlanilha } from './planilha';

export const IMPORTADORES: readonly Importador[] = [importadorBpmn, importadorPlanilha];

export const LIMITE_ARQUIVO = 20 * 1024 * 1024;

/** Extensões aceitas no seletor de arquivos. */
export const EXTENSOES_ACEITAS = ['.processo', ...new Set(IMPORTADORES.flatMap((i) => i.extensoes))];

export type ResultadoAbertura =
  | { tipo: 'processo'; leitura: ResultadoLeitura }
  | { tipo: 'importacao'; importador: Importador; grafos: GrafoImportado[] }
  | { tipo: 'erro'; erro: string };

function pareceProcesso(nome: string, bytes: Uint8Array): boolean {
  if (nome.toLowerCase().endsWith('.processo')) return true;
  const inicio = new TextDecoder('utf-8').decode(bytes.subarray(0, 300));
  return inicio.trimStart().startsWith('{') && inicio.includes(`"${FORMATO}"`);
}

/** Importadores que reconhecem o arquivo, do mais provável ao menos provável. */
export function candidatos(nome: string, bytes: Uint8Array): { importador: Importador; confianca: number }[] {
  return IMPORTADORES.map((importador) => ({ importador, confianca: importador.detectar(nome, bytes) }))
    .filter((c) => c.confianca > 0)
    .sort((a, b) => b.confianca - a.confianca);
}

export async function abrirArquivo(nome: string, bytes: Uint8Array, formatoForcado?: string): Promise<ResultadoAbertura> {
  if (bytes.length > LIMITE_ARQUIVO) return { tipo: 'erro', erro: 'Arquivo maior que 20 MB' };
  if (!formatoForcado && pareceProcesso(nome, bytes)) {
    return { tipo: 'processo', leitura: lerProcesso(new TextDecoder('utf-8').decode(bytes)) };
  }
  const importador = formatoForcado ? IMPORTADORES.find((i) => i.formato === formatoForcado) : candidatos(nome, bytes)[0]?.importador;
  if (!importador) {
    return { tipo: 'erro', erro: `Formato não reconhecido. Aceitos: ${EXTENSOES_ACEITAS.join(', ')}` };
  }
  try {
    return { tipo: 'importacao', importador, grafos: await importador.importar(bytes) };
  } catch (e) {
    return { tipo: 'erro', erro: e instanceof Error ? e.message : String(e) };
  }
}
