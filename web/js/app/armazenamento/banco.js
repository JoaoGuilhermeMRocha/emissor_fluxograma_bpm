/**
 * Armazenamento no navegador (IndexedDB via Dexie) — ESPECIFICACAO §14.1.
 * Cada processo é um registro; o salvamento automático atualiza o registro.
 * O arquivo exportado continua sendo a cópia oficial (§2).
 */
/** @import { Processo } from '../../core/index.js' */
import Dexie from 'dexie';

/**
 * @typedef {Object} ArquivoAssociado
 * @property {string} nome
 * @property {FileSystemFileHandle} [handle] Só no Edge/Chrome: permite regravar no mesmo arquivo.
 */

/**
 * @typedef {Object} RegistroProcesso
 * @property {string} id
 * @property {Processo} processo
 * @property {string} nome
 * @property {string} atualizadoEm
 * @property {number} [revisaoExportada] Revisão gravada em arquivo pela última vez (para o aviso "alterado depois de exportar").
 * @property {ArquivoAssociado} [arquivo] Arquivo associado, quando o navegador permite reescrever (Edge/Chrome).
 */

/** @typedef {Pick<RegistroProcesso, 'revisaoExportada' | 'arquivo'>} DadosRegistro */

/**
 * @typedef {Dexie & {
 *   processos: import('dexie').EntityTable<RegistroProcesso, 'id'>,
 *   preferencias: import('dexie').EntityTable<{ chave: string, valor: unknown }, 'chave'>,
 * }} BancoMapeador
 */

export const banco = /** @type {BancoMapeador} */ (new Dexie('mapeador-processos'));
banco.version(1).stores({
  processos: 'id, atualizadoEm, nome',
  preferencias: 'chave',
});

/** @returns {Promise<RegistroProcesso[]>} */
export async function listarProcessos() {
  return banco.processos.orderBy('atualizadoEm').reverse().toArray();
}

/** @param {string} id */
export const lerRegistro = (id) => banco.processos.get(id);

/**
 * Grava o processo (incrementa a revisão e a data de alteração) e devolve a versão gravada.
 * @param {Processo} p
 * @param {Partial<Omit<RegistroProcesso, 'id' | 'processo'>>} [extras]
 * @returns {Promise<Processo>}
 */
export async function gravarProcesso(p, extras = {}) {
  const agora = new Date().toISOString();
  /** @type {Processo} */
  const gravado = { ...p, revisao: p.revisao + 1, alteradoEm: agora };
  await banco.transaction('rw', banco.processos, async () => {
    const atual = await banco.processos.get(p.id);
    await banco.processos.put({
      ...atual,
      ...extras,
      id: p.id,
      processo: gravado,
      nome: gravado.nome,
      atualizadoEm: agora,
    });
  });
  return gravado;
}

/**
 * @param {string} id
 * @param {Partial<Omit<RegistroProcesso, 'id'>>} campos
 */
export async function atualizarRegistro(id, campos) {
  await banco.processos.update(id, campos);
}

/** @param {string} id */
export const excluirRegistro = (id) => banco.processos.delete(id);

/**
 * @param {string} chave
 * @returns {Promise<unknown>}
 */
export async function lerPreferencia(chave) {
  return (await banco.preferencias.get(chave))?.valor;
}

/**
 * @param {string} chave
 * @param {unknown} valor
 */
export async function gravarPreferencia(chave, valor) {
  await banco.preferencias.put({ chave, valor });
}

/**
 * Pede ao navegador para não apagar os dados sozinho (ESPECIFICACAO §2).
 * @returns {Promise<boolean>}
 */
export async function pedirPersistencia() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
