import type { Etapa, Processo } from './schema';

export interface OpcoesCriacao {
  nome?: string;
  /** Injetável para testes. */
  agora?: Date;
  /** Injetável para testes. */
  gerarId?: () => string;
}

const uuid = (): string => globalThis.crypto.randomUUID();

const dataISO = (d: Date): string => d.toISOString().slice(0, 10);

export function criarProcesso(opcoes: OpcoesCriacao = {}): Processo {
  const agora = opcoes.agora ?? new Date();
  const id = (opcoes.gerarId ?? uuid)();
  return {
    id,
    linhagem: id,
    nome: opcoes.nome ?? '',
    versao: 'v1.0',
    data: dataISO(agora),
    metadados: {},
    etapas: [],
    raci: { atoresExtras: [], porEtapa: {}, revisada: false },
    parecer: { analista: '', data: '', status: 'Em análise', texto: '', recomendacoes: '', ressalvas: '' },
    layout: { ordemRaias: null, posicoes: {}, estiloSeta: 'ortogonal' },
    revisao: 0,
    criadoEm: agora.toISOString(),
    alteradoEm: agora.toISOString(),
  };
}

/** Número de um id de etapa (`E07` → 7). Ids fora do padrão valem 0. */
export function numeroDoId(id: string): number {
  const m = /^E(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

export function formatarIdEtapa(n: number): string {
  return `E${String(n).padStart(2, '0')}`;
}

/** Próximo id livre: maior número existente + 1. */
export function proximoIdEtapa(etapas: readonly Pick<Etapa, 'id'>[]): string {
  const maior = etapas.reduce((max, e) => Math.max(max, numeroDoId(e.id)), 0);
  return formatarIdEtapa(maior + 1);
}
