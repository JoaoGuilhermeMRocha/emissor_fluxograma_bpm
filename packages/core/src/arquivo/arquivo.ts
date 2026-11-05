/**
 * Arquivo do processo (`.processo`) com versão de formato e migração
 * automática (ESPECIFICACAO §4.6 e §4.7).
 */
import { ProcessoSchema, type Processo } from '../modelo/schema';
import { slug } from '../util/texto';

export const FORMATO = 'mapeador-processo';
export const VERSAO_FORMATO_ATUAL = 1;
export const EXTENSAO = '.processo';

/** Migração de `de` para `de + 1`. Recebe e devolve o objeto `processo` cru. */
export interface Migracao {
  de: number;
  descricao: string;
  aplicar: (processo: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Migrações conhecidas, em ordem. Toda mudança de formato acrescenta uma
 * entrada aqui e sobe `VERSAO_FORMATO_ATUAL`, com teste usando um arquivo
 * da versão anterior.
 */
export const MIGRACOES: readonly Migracao[] = [];

export interface EnvelopeArquivo {
  formato: typeof FORMATO;
  versaoFormato: number;
  geradoPor: string;
  exportadoEm: string;
  processo: Processo;
}

export function serializarProcesso(
  p: Processo,
  opcoes: { geradoPor?: string; agora?: Date } = {},
): string {
  const envelope: EnvelopeArquivo = {
    formato: FORMATO,
    versaoFormato: VERSAO_FORMATO_ATUAL,
    geradoPor: opcoes.geradoPor ?? 'Mapeador de Processos',
    exportadoEm: (opcoes.agora ?? new Date()).toISOString(),
    processo: p,
  };
  return JSON.stringify(envelope, null, 2);
}

export function nomeDoArquivo(p: Pick<Processo, 'nome' | 'versao'>): string {
  const base = [slug(p.nome) || 'processo', slug(p.versao)].filter(Boolean).join('_');
  return base + EXTENSAO;
}

export type ResultadoLeitura =
  | { ok: true; processo: Processo; avisos: string[]; somenteLeitura: boolean; versaoOriginal: number }
  | { ok: false; erro: string; detalhes?: string[] };

export function lerProcesso(
  texto: string,
  opcoes: { migracoes?: readonly Migracao[]; versaoAtual?: number } = {},
): ResultadoLeitura {
  const migracoes = opcoes.migracoes ?? MIGRACOES;
  const versaoAtual = opcoes.versaoAtual ?? VERSAO_FORMATO_ATUAL;

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido' };
  }
  if (!bruto || typeof bruto !== 'object') return { ok: false, erro: 'Conteúdo do arquivo não reconhecido' };

  const env = bruto as Record<string, unknown>;
  if (env.formato !== FORMATO) {
    return { ok: false, erro: 'Este arquivo não foi gerado pelo Mapeador de Processos' };
  }
  const versao = env.versaoFormato;
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    return { ok: false, erro: 'Versão de formato ausente ou inválida' };
  }

  const avisos: string[] = [];
  let somenteLeitura = false;
  let processo = env.processo as Record<string, unknown>;
  if (!processo || typeof processo !== 'object') return { ok: false, erro: 'O arquivo não contém um processo' };

  if (versao > versaoAtual) {
    somenteLeitura = true;
    avisos.push('Arquivo gerado por uma versão mais nova do sistema. Ele abre somente para leitura; atualize a página para editar.');
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
  return { ok: true, processo: r.data as Processo, avisos, somenteLeitura, versaoOriginal: versao };
}
