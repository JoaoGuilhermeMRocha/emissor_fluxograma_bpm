/**
 * Armazenamento no navegador (IndexedDB via Dexie) — ESPECIFICACAO §14.1.
 * Cada processo é um registro; o salvamento automático atualiza o registro.
 * O arquivo exportado continua sendo a cópia oficial (§2).
 */
import Dexie, { type EntityTable } from 'dexie';
import type { Processo } from '@mapeador/core';

export interface RegistroProcesso {
  id: string;
  processo: Processo;
  nome: string;
  atualizadoEm: string;
  /** Revisão gravada em arquivo pela última vez (para o aviso "alterado depois de exportar"). */
  revisaoExportada?: number;
  /** Arquivo associado, quando o navegador permite reescrever (Edge/Chrome). */
  arquivo?: { nome: string; handle?: FileSystemFileHandle };
}

interface Preferencia {
  chave: string;
  valor: unknown;
}

class BancoMapeador extends Dexie {
  processos!: EntityTable<RegistroProcesso, 'id'>;
  preferencias!: EntityTable<Preferencia, 'chave'>;

  constructor() {
    super('mapeador-processos');
    this.version(1).stores({
      processos: 'id, atualizadoEm, nome',
      preferencias: 'chave',
    });
  }
}

export const banco = new BancoMapeador();

export async function listarProcessos(): Promise<RegistroProcesso[]> {
  return banco.processos.orderBy('atualizadoEm').reverse().toArray();
}

export const lerRegistro = (id: string) => banco.processos.get(id);

/** Grava o processo (incrementa a revisão e a data de alteração) e devolve a versão gravada. */
export async function gravarProcesso(p: Processo, extras: Partial<Omit<RegistroProcesso, 'id' | 'processo'>> = {}): Promise<Processo> {
  const agora = new Date().toISOString();
  const gravado: Processo = { ...p, revisao: p.revisao + 1, alteradoEm: agora };
  await banco.transaction('rw', banco.processos, async () => {
    const atual = await banco.processos.get(p.id);
    await banco.processos.put({ ...atual, ...extras, id: p.id, processo: gravado, nome: gravado.nome, atualizadoEm: agora });
  });
  return gravado;
}

export async function atualizarRegistro(id: string, campos: Partial<Omit<RegistroProcesso, 'id'>>): Promise<void> {
  await banco.processos.update(id, campos);
}

export const excluirRegistro = (id: string) => banco.processos.delete(id);

export async function lerPreferencia<T>(chave: string): Promise<T | undefined> {
  return (await banco.preferencias.get(chave))?.valor as T | undefined;
}

export async function gravarPreferencia(chave: string, valor: unknown): Promise<void> {
  await banco.preferencias.put({ chave, valor });
}

/** Pede ao navegador para não apagar os dados sozinho (ESPECIFICACAO §2). */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
