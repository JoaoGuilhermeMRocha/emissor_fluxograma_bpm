/**
 * Grafo Intermediário (ESPECIFICACAO §11.2): o que todo importador produz.
 * Cada importador só conhece o formato de origem e este contrato; quem
 * transforma o grafo em processo é a normalização, comum a todos.
 */

export type FormaImportada =
  | 'inicio'
  | 'fim'
  | 'tarefa'
  | 'sistema'
  | 'subprocesso'
  | 'decisao'
  | 'paralelo'
  | 'inclusivo'
  | 'complexo'
  | 'evento_gw'
  | 'intermediario'
  | 'anotacao'
  | 'desconhecido';

export interface CaixaImportada {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NoImportado {
  /** Id no arquivo de origem. */
  id: string;
  rotulo: string;
  forma: FormaImportada;
  raiaId?: string;
  caixa?: CaixaImportada;
  /** Informações extras da origem (documentação, tipo original…). */
  extras?: Record<string, string>;
}

export interface ArestaImportada {
  id: string;
  origem: string;
  destino: string;
  rotulo?: string;
}

export interface GrafoImportado {
  titulo?: string;
  raias: { id: string; nome: string; ordem: number; caixa?: CaixaImportada }[];
  nos: NoImportado[];
  arestas: ArestaImportada[];
  associacoes: { anotacao: string; alvo: string }[];
  /** Problemas que o próprio importador detectou. */
  avisos: string[];
  /** Informação da origem que não tem lugar no modelo (ex.: fluxos de mensagem). */
  perdas: string[];
  /** Rótulos vêm em HTML (draw.io, Visio): a normalização remove tags e decodifica entidades. */
  rotulosHtml?: boolean;
}

/** Contrato de um importador de formato. */
export interface Importador {
  /** Identificador curto: 'bpmn', 'planilha', 'drawio'… */
  formato: string;
  nome: string;
  extensoes: string[];
  /** Confiança de 0 a 1 de que o conteúdo é deste formato. */
  detectar(nomeArquivo: string, conteudo: Uint8Array | string): number;
  importar(conteudo: Uint8Array | string): Promise<GrafoImportado[]> | GrafoImportado[];
}

export const grafoVazio = (): GrafoImportado => ({
  raias: [],
  nos: [],
  arestas: [],
  associacoes: [],
  avisos: [],
  perdas: [],
});
