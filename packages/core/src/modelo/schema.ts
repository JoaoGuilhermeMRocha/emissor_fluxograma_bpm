import { z } from 'zod';
import { RESULTADOS_FIM, STATUS_PARECER, TIPOS_ETAPA } from './tipos';

/** Ids de etapa legíveis: E01, E02 … E100. */
export const ID_ETAPA = /^E\d{2,}$/;

export const SaidaSchema = z.object({
  destino: z.string(),
  rotulo: z.string().optional(),
});

export const EtapaSchema = z.object({
  id: z.string().regex(ID_ETAPA, 'Id de etapa deve seguir o padrão E01'),
  tipo: z.enum(TIPOS_ETAPA),
  descricao: z.string(),
  ator: z.string().optional(),
  apoio: z.string().optional(),
  saidas: z.array(SaidaSchema),
  resultado: z.enum(RESULTADOS_FIM).optional(),
  regra: z.string().optional(),
  evento: z.enum(['captura', 'disparo']).optional(),
  anotaEtapa: z.string().optional(),
  origem: z.object({ formato: z.string(), idOriginal: z.string() }).optional(),
});

export const RaciEtapaSchema = z.object({
  /** `undefined` = automático (o ator da raia). Lista vazia = sem responsável. */
  responsaveis: z.array(z.string()).optional(),
  aprovadores: z.array(z.string()).default([]),
  consultados: z.array(z.string()).default([]),
  informados: z.array(z.string()).default([]),
  condicional: z.string().optional(),
});

export const RaciSchema = z.object({
  atoresExtras: z.array(z.string()).default([]),
  porEtapa: z.record(z.string(), RaciEtapaSchema).default({}),
  revisada: z.boolean().default(false),
});

export const ParecerSchema = z.object({
  analista: z.string().default(''),
  data: z.string().default(''),
  status: z.enum(STATUS_PARECER).default('Em análise'),
  texto: z.string().default(''),
  recomendacoes: z.string().default(''),
  ressalvas: z.string().default(''),
});

export const LayoutSchema = z.object({
  /** `null` = ordem automática (primeira aparição). */
  ordemRaias: z.array(z.string()).nullable().default(null),
  /**
   * Posições manuais do centro de cada etapa: `x` absoluto e `y` relativo ao
   * topo da raia (assim a etapa continua na sua raia se outras crescerem).
   */
  posicoes: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  estiloSeta: z.enum(['ortogonal', 'curvo']).default('ortogonal'),
});

export const ProcessoSchema = z.object({
  id: z.string().min(1),
  linhagem: z.string().min(1),
  nome: z.string(),
  versao: z.string().regex(/^v\d+\.\d+$/, 'Versão deve seguir o padrão v1.0'),
  data: z.string(),
  metadados: z.record(z.string(), z.string()).default({}),
  etapas: z.array(EtapaSchema),
  raci: RaciSchema.default({ atoresExtras: [], porEtapa: {}, revisada: false }),
  parecer: ParecerSchema.default({
    analista: '', data: '', status: 'Em análise', texto: '', recomendacoes: '', ressalvas: '',
  }),
  layout: LayoutSchema.default({ ordemRaias: null, posicoes: {}, estiloSeta: 'ortogonal' }),
  revisao: z.number().int().nonnegative(),
  criadoEm: z.string(),
  alteradoEm: z.string(),
});

export type Saida = z.infer<typeof SaidaSchema>;
export type Etapa = z.infer<typeof EtapaSchema>;
export type RaciEtapa = z.infer<typeof RaciEtapaSchema>;
export type Raci = z.infer<typeof RaciSchema>;
export type Parecer = z.infer<typeof ParecerSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type Processo = z.infer<typeof ProcessoSchema>;
