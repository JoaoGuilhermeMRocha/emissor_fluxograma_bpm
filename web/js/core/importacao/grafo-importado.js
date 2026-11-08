/**
 * @returns {GrafoImportado}
 */
export const grafoVazio = () => ({
  raias: [],
  nos: [],
  arestas: [],
  associacoes: [],
  avisos: [],
  perdas: [],
});
/**
 * Grafo Intermediário (ESPECIFICACAO §11.2): o que todo importador produz.
 * Cada importador só conhece o formato de origem e este contrato; quem
 * transforma o grafo em processo é a normalização, comum a todos.
 * @typedef {| 'inicio'
 *   | 'fim'
 *   | 'tarefa'
 *   | 'sistema'
 *   | 'subprocesso'
 *   | 'decisao'
 *   | 'paralelo'
 *   | 'inclusivo'
 *   | 'complexo'
 *   | 'evento_gw'
 *   | 'intermediario'
 *   | 'anotacao'
 *   | 'desconhecido'} FormaImportada
 */
/**
 * @typedef {Object} CaixaImportada
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */
/**
 * @typedef {Object} NoImportado
 * @property {string} id Id no arquivo de origem.
 * @property {string} rotulo
 * @property {FormaImportada} forma
 * @property {string} [raiaId]
 * @property {CaixaImportada} [caixa]
 * @property {Record<string, string>} [extras] Informações extras da origem (documentação, tipo original…).
 */
/**
 * @typedef {Object} ArestaImportada
 * @property {string} id
 * @property {string} origem
 * @property {string} destino
 * @property {string} [rotulo]
 * @property {{ x: number, y: number }[]} [pontos] Trajeto desenhado na origem (quando o formato tem).
 */
/**
 * @typedef {Object} GrafoImportado
 * @property {string} [titulo]
 * @property {{ id: string; nome: string; ordem: number; caixa?: CaixaImportada }[]} raias
 * @property {NoImportado[]} nos
 * @property {ArestaImportada[]} arestas
 * @property {{ anotacao: string; alvo: string }[]} associacoes
 * @property {string[]} avisos Problemas que o próprio importador detectou.
 * @property {string[]} perdas Informação da origem que não tem lugar no modelo (ex.: fluxos de mensagem).
 * @property {boolean} [rotulosHtml] Rótulos vêm em HTML (draw.io, Visio): a normalização remove tags e decodifica entidades.
 */
/**
 * Contrato de um importador de formato.
 * @typedef {Object} Importador
 * @property {string} formato Identificador curto: 'bpmn', 'planilha', 'drawio'…
 * @property {string} nome
 * @property {string[]} extensoes
 * @property {(nomeArquivo: string, conteudo: Uint8Array | string) => number} detectar Confiança de 0 a 1 de que o conteúdo é deste formato.
 * @property {(conteudo: Uint8Array | string) => Promise<GrafoImportado[]> | GrafoImportado[]} importar
 */
