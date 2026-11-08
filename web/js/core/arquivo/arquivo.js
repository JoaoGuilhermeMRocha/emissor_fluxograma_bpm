/** @import { Processo } from '../modelo/schema.js' */
/**
 * Arquivo do processo (`.processo`) com versão de formato e migração
 * automática (ESPECIFICACAO §4.6 e §4.7).
 */
import { ProcessoSchema } from '../modelo/schema.js';
import { slug } from '../util/texto.js';

export const FORMATO = 'mapeador-processo';
export const VERSAO_FORMATO_ATUAL = 1;
export const EXTENSAO = '.processo';

/**
 * Migrações conhecidas, em ordem. Toda mudança de formato acrescenta uma
 * entrada aqui e sobe `VERSAO_FORMATO_ATUAL`, com teste usando um arquivo
 * da versão anterior.
 * @type {readonly Migracao[]}
 */
export const MIGRACOES = [];

/**
 * @param {Processo} p
 * @param {{ geradoPor?: string; agora?: Date }} [opcoes={}]
 * @returns {string}
 */
export function serializarProcesso(p, opcoes = {}) {
  const envelope = {
    formato: FORMATO,
    versaoFormato: VERSAO_FORMATO_ATUAL,
    geradoPor: opcoes.geradoPor ?? 'Mapeador de Processos',
    exportadoEm: (opcoes.agora ?? new Date()).toISOString(),
    processo: p,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * @param {Pick<Processo, 'nome' | 'versao'>} p
 * @returns {string}
 */
export function nomeDoArquivo(p) {
  const base = [slug(p.nome) || 'processo', slug(p.versao)].filter(Boolean).join('_');
  return base + EXTENSAO;
}

/**
 * @param {string} texto
 * @param {{ migracoes?: readonly Migracao[]; versaoAtual?: number }} [opcoes={}]
 * @returns {ResultadoLeitura}
 */
export function lerProcesso(texto, opcoes = {}) {
  const migracoes = opcoes.migracoes ?? MIGRACOES;
  const versaoAtual = opcoes.versaoAtual ?? VERSAO_FORMATO_ATUAL;

  let bruto;
  try {
    bruto = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido' };
  }
  if (!bruto || typeof bruto !== 'object') return { ok: false, erro: 'Conteúdo do arquivo não reconhecido' };

  const env = bruto;
  if (env.formato !== FORMATO) {
    return { ok: false, erro: 'Este arquivo não foi gerado pelo Mapeador de Processos' };
  }
  const versao = env.versaoFormato;
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    return { ok: false, erro: 'Versão de formato ausente ou inválida' };
  }

  const avisos = [];
  let somenteLeitura = false;
  let processo = env.processo;
  if (!processo || typeof processo !== 'object')
    return { ok: false, erro: 'O arquivo não contém um processo' };

  if (versao > versaoAtual) {
    somenteLeitura = true;
    avisos.push(
      'Arquivo gerado por uma versão mais nova do sistema. Ele abre somente para leitura; atualize a página para editar.',
    );
  } else {
    for (let v = versao; v < versaoAtual; v++) {
      const m = migracoes.find((x) => x.de === v);
      if (!m) return { ok: false, erro: `Não há conversão do formato ${v} para ${v + 1}` };
      processo = m.aplicar(structuredClone(processo));
      avisos.push(`Convertido do formato ${v} para ${v + 1}: ${m.descricao}`);
    }
  }

  const r = (somenteLeitura ? ProcessoSchema.loose() : ProcessoSchema).safeParse(processo);
  if (!r.success) {
    return {
      ok: false,
      erro: 'O arquivo está incompleto ou corrompido',
      detalhes: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`),
    };
  }
  return { ok: true, processo: r.data, avisos, somenteLeitura, versaoOriginal: versao };
}
/**
 * @typedef {| { ok: true; processo: Processo; avisos: string[]; somenteLeitura: boolean; versaoOriginal: number }
 *   | { ok: false; erro: string; detalhes?: string[] }} ResultadoLeitura
 */
/**
 * Migração de `de` para `de + 1`. Recebe e devolve o objeto `processo` cru.
 * @typedef {Object} Migracao
 * @property {number} de
 * @property {string} descricao
 * @property {(processo: Record<string, unknown>) => Record<string, unknown>} aplicar
 */
/**
 * @typedef {Object} EnvelopeArquivo
 * @property {typeof FORMATO} formato
 * @property {number} versaoFormato
 * @property {string} geradoPor
 * @property {string} exportadoEm
 * @property {Processo} processo
 */
