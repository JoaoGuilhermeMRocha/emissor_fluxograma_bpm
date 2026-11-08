/** @import { Etapa, Processo } from './schema.js' */

/**
 * @returns {string}
 */
const uuid = () => globalThis.crypto.randomUUID();

/**
 * @param {Date} d
 * @returns {string}
 */
const dataISO = (d) => d.toISOString().slice(0, 10);

/**
 * @param {OpcoesCriacao} [opcoes={}]
 * @returns {Processo}
 */
export function criarProcesso(opcoes = {}) {
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

/**
 * Número de um id de etapa (`E07` → 7). Ids fora do padrão valem 0.
 * @param {string} id
 * @returns {number}
 */
export function numeroDoId(id) {
  const m = /^E(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/**
 * @param {number} n
 * @returns {string}
 */
export function formatarIdEtapa(n) {
  return `E${String(n).padStart(2, '0')}`;
}

/**
 * Próximo id livre: maior número existente + 1.
 * @param {readonly Pick<Etapa, 'id'>[]} etapas
 * @returns {string}
 */
export function proximoIdEtapa(etapas) {
  const maior = etapas.reduce((max, e) => Math.max(max, numeroDoId(e.id)), 0);
  return formatarIdEtapa(maior + 1);
}
/**
 * @typedef {Object} OpcoesCriacao
 * @property {string} [nome]
 * @property {Date} [agora] Injetável para testes.
 * @property {() => string} [gerarId] Injetável para testes.
 */
