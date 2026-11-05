/**
 * Catálogo dos tipos de etapa: rótulo, regras de ator e de saídas e o
 * elemento BPMN 2.0 correspondente (ESPECIFICACAO §4.3).
 */

export const TIPOS_ETAPA = [
  'inicio',
  'tarefa',
  'sistema',
  'subprocesso',
  'gw_exclusivo',
  'gw_paralelo',
  'gw_inclusivo',
  'gw_complexo',
  'gw_evento',
  'intermediario',
  'link',
  'fim',
  'anotacao',
] as const;

export type TipoEtapa = (typeof TIPOS_ETAPA)[number];

/** Agrupa tipos que podem ser trocados entre si sem perder o sentido das saídas. */
export type FamiliaEtapa = 'evento_inicio' | 'atividade' | 'gateway' | 'evento_meio' | 'evento_fim' | 'anotacao';

export interface DefinicaoTipo {
  rotulo: string;
  familia: FamiliaEtapa;
  ator: 'obrigatorio' | 'opcional' | 'nenhum';
  saidasMin: number;
  /** `Infinity` = sem limite. */
  saidasMax: number;
  /** Saídas precisam de rótulo (ex.: SIM/NÃO). */
  saidasRotuladas: boolean;
  bpmn: string;
}

export const DEFINICOES: Record<TipoEtapa, DefinicaoTipo> = {
  inicio: { rotulo: 'Início', familia: 'evento_inicio', ator: 'nenhum', saidasMin: 1, saidasMax: 1, saidasRotuladas: false, bpmn: 'startEvent' },
  tarefa: { rotulo: 'Tarefa', familia: 'atividade', ator: 'obrigatorio', saidasMin: 1, saidasMax: 1, saidasRotuladas: false, bpmn: 'userTask' },
  sistema: { rotulo: 'Tarefa de sistema', familia: 'atividade', ator: 'obrigatorio', saidasMin: 1, saidasMax: 1, saidasRotuladas: false, bpmn: 'serviceTask' },
  subprocesso: { rotulo: 'Subprocesso', familia: 'atividade', ator: 'obrigatorio', saidasMin: 1, saidasMax: 1, saidasRotuladas: false, bpmn: 'subProcess' },
  gw_exclusivo: { rotulo: 'Decisão (XOR)', familia: 'gateway', ator: 'obrigatorio', saidasMin: 2, saidasMax: Infinity, saidasRotuladas: true, bpmn: 'exclusiveGateway' },
  gw_paralelo: { rotulo: 'Paralelo (AND)', familia: 'gateway', ator: 'obrigatorio', saidasMin: 2, saidasMax: Infinity, saidasRotuladas: false, bpmn: 'parallelGateway' },
  gw_inclusivo: { rotulo: 'Inclusivo (OR)', familia: 'gateway', ator: 'obrigatorio', saidasMin: 2, saidasMax: Infinity, saidasRotuladas: true, bpmn: 'inclusiveGateway' },
  gw_complexo: { rotulo: 'Complexo', familia: 'gateway', ator: 'obrigatorio', saidasMin: 1, saidasMax: Infinity, saidasRotuladas: false, bpmn: 'complexGateway' },
  gw_evento: { rotulo: 'Baseado em eventos', familia: 'gateway', ator: 'obrigatorio', saidasMin: 2, saidasMax: Infinity, saidasRotuladas: false, bpmn: 'eventBasedGateway' },
  intermediario: { rotulo: 'Evento intermediário', familia: 'evento_meio', ator: 'nenhum', saidasMin: 1, saidasMax: 1, saidasRotuladas: false, bpmn: 'intermediateCatchEvent' },
  link: { rotulo: 'Evento de link', familia: 'evento_meio', ator: 'nenhum', saidasMin: 1, saidasMax: 1, saidasRotuladas: false, bpmn: 'intermediateCatchEvent' },
  fim: { rotulo: 'Fim', familia: 'evento_fim', ator: 'opcional', saidasMin: 0, saidasMax: 0, saidasRotuladas: false, bpmn: 'endEvent' },
  anotacao: { rotulo: 'Anotação', familia: 'anotacao', ator: 'nenhum', saidasMin: 0, saidasMax: 0, saidasRotuladas: false, bpmn: 'textAnnotation' },
};

export const ehGateway = (t: TipoEtapa): boolean => DEFINICOES[t].familia === 'gateway';
export const ehAtividade = (t: TipoEtapa): boolean => DEFINICOES[t].familia === 'atividade';
export const ehEvento = (t: TipoEtapa): boolean =>
  ['evento_inicio', 'evento_meio', 'evento_fim'].includes(DEFINICOES[t].familia);

export const RESULTADOS_FIM = ['Finalizado', 'Aprovado', 'Encerrado', 'Cancelado', 'Reprovado'] as const;
export type ResultadoFim = (typeof RESULTADOS_FIM)[number];

export const STATUS_PARECER = ['Em análise', 'Validado', 'Validado com ressalvas', 'Requer ajustes'] as const;
export type StatusParecer = (typeof STATUS_PARECER)[number];

/** Nome da raia usada quando nenhuma regra consegue descobrir o responsável. */
export const RAIA_PADRAO = 'Processo';
