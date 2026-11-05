/**
 * Estado da aplicação: processo aberto, desfazer/refazer, seleção, avisos
 * e salvamento automático no IndexedDB (ESPECIFICACAO §14.1).
 */
import { create } from 'zustand';
import { criarProcesso, processoExemplo, type Processo } from '@mapeador/core';
import {
  atualizarRegistro,
  gravarPreferencia,
  gravarProcesso,
  lerPreferencia,
  lerRegistro,
  listarProcessos,
  pedirPersistencia,
  type RegistroProcesso,
} from '../armazenamento/banco';
import { aplicarTema, temaSalvo, type Tema } from '../tema';

export type EstadoSalvamento =
  | { estado: 'pronto' }
  | { estado: 'pendente' }
  | { estado: 'salvando' }
  | { estado: 'salvo'; em: string }
  | { estado: 'erro'; erro: string };

export interface Aviso {
  id: number;
  tipo: 'ok' | 'erro' | 'info';
  texto: string;
}

interface Loja {
  processo: Processo | null;
  passado: Processo[];
  futuro: Processo[];
  selecionada: string | null;
  salvamento: EstadoSalvamento;
  /** Metadados do registro aberto (arquivo associado, revisão exportada). */
  registro: Pick<RegistroProcesso, 'revisaoExportada' | 'arquivo'>;
  avisos: Aviso[];
  tema: Tema;

  alternarTema(): void;
  carregar(p: Processo, registro?: Pick<RegistroProcesso, 'revisaoExportada' | 'arquivo'>): void;
  aplicar(op: (p: Processo) => Processo): boolean;
  desfazer(): void;
  refazer(): void;
  selecionar(id: string | null): void;
  avisar(tipo: Aviso['tipo'], texto: string): void;
  dispensarAviso(id: number): void;
  marcarExportado(arquivo?: RegistroProcesso['arquivo']): Promise<void>;
  salvarAgora(): Promise<void>;
}

const LIMITE_HISTORICO = 100;
const ATRASO_SALVAMENTO = 800;
let temporizador: ReturnType<typeof setTimeout> | undefined;
let proximoAviso = 1;
let pediuPersistencia = false;

export const useLoja = create<Loja>((set, get) => {
  const agendarSalvamento = () => {
    clearTimeout(temporizador);
    set({ salvamento: { estado: 'pendente' } });
    temporizador = setTimeout(() => void get().salvarAgora(), ATRASO_SALVAMENTO);
  };

  return {
    processo: null,
    passado: [],
    futuro: [],
    selecionada: null,
    salvamento: { estado: 'pronto' },
    registro: {},
    avisos: [],
    tema: temaSalvo(),

    alternarTema() {
      const tema = get().tema === 'escuro' ? 'claro' : 'escuro';
      aplicarTema(tema);
      set({ tema });
    },

    carregar(p, registro = {}) {
      clearTimeout(temporizador);
      set({ processo: p, passado: [], futuro: [], selecionada: null, registro, salvamento: { estado: 'pronto' } });
      void gravarPreferencia('ultimoAberto', p.id);
    },

    aplicar(op) {
      const atual = get().processo;
      if (!atual) return false;
      let novo: Processo;
      try {
        novo = op(atual);
      } catch (e) {
        get().avisar('erro', e instanceof Error ? e.message : String(e));
        return false;
      }
      if (novo === atual || JSON.stringify(novo) === JSON.stringify(atual)) return false;
      set((s) => ({ processo: novo, passado: [...s.passado.slice(-LIMITE_HISTORICO + 1), atual], futuro: [] }));
      agendarSalvamento();
      return true;
    },

    desfazer() {
      const { passado, processo, futuro } = get();
      if (!passado.length || !processo) return;
      set({ processo: passado.at(-1)!, passado: passado.slice(0, -1), futuro: [processo, ...futuro] });
      agendarSalvamento();
    },

    refazer() {
      const { passado, processo, futuro } = get();
      if (!futuro.length || !processo) return;
      set({ processo: futuro[0]!, passado: [...passado, processo], futuro: futuro.slice(1) });
      agendarSalvamento();
    },

    selecionar(id) {
      if (get().selecionada !== id) set({ selecionada: id });
    },

    avisar(tipo, texto) {
      const id = proximoAviso++;
      set((s) => ({ avisos: [...s.avisos.slice(-3), { id, tipo, texto }] }));
      setTimeout(() => get().dispensarAviso(id), tipo === 'erro' ? 8000 : 4500);
    },

    dispensarAviso(id) {
      set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
    },

    async salvarAgora() {
      clearTimeout(temporizador);
      const p = get().processo;
      if (!p) return;
      set({ salvamento: { estado: 'salvando' } });
      try {
        const gravado = await gravarProcesso(p);
        // Só a revisão e a data voltam para o estado: edições feitas durante a gravação não se perdem
        set((s) =>
          s.processo?.id === gravado.id
            ? { processo: { ...s.processo, revisao: gravado.revisao, alteradoEm: gravado.alteradoEm }, salvamento: { estado: 'salvo', em: gravado.alteradoEm } }
            : {},
        );
        if (!pediuPersistencia) {
          pediuPersistencia = true;
          void pedirPersistencia();
        }
      } catch (e) {
        set({ salvamento: { estado: 'erro', erro: e instanceof Error ? e.message : String(e) } });
      }
    },

    async marcarExportado(arquivo) {
      const p = get().processo;
      if (!p) return;
      await get().salvarAgora();
      const revisao = get().processo!.revisao;
      const registro = { ...get().registro, revisaoExportada: revisao, ...(arquivo ? { arquivo } : {}) };
      set({ registro });
      await atualizarRegistro(p.id, registro);
    },
  };
});

let inicializacao: Promise<'continuou' | 'exemplo'> | null = null;

/** Abre o último processo usado; sem nenhum, cria o exemplo (bom para a demonstração). Roda uma vez só. */
export function inicializar(): Promise<'continuou' | 'exemplo'> {
  inicializacao ??= inicializarDeFato().finally(() => {
    inicializacao = null;
  });
  return inicializacao;
}

async function inicializarDeFato(): Promise<'continuou' | 'exemplo'> {
  const loja = useLoja.getState();
  const ultimo = await lerPreferencia<string>('ultimoAberto');
  const reg = (ultimo && (await lerRegistro(ultimo))) || (await listarProcessos())[0];
  if (reg) {
    loja.carregar(reg.processo, { revisaoExportada: reg.revisaoExportada, arquivo: reg.arquivo });
    return 'continuou';
  }
  const exemplo = processoExemplo();
  const gravado = await gravarProcesso(exemplo);
  loja.carregar(gravado);
  return 'exemplo';
}

/** Começa um processo vazio, já gravado na biblioteca. */
export async function novoProcesso(nome = 'Novo processo'): Promise<void> {
  const loja = useLoja.getState();
  await loja.salvarAgora();
  const p = criarProcesso({ nome });
  loja.carregar(await gravarProcesso(p));
}

/** Abre um processo da biblioteca. */
export async function abrirDaBiblioteca(id: string): Promise<void> {
  const loja = useLoja.getState();
  await loja.salvarAgora();
  const reg = await lerRegistro(id);
  if (!reg) {
    loja.avisar('erro', 'Processo não encontrado na biblioteca');
    return;
  }
  loja.carregar(reg.processo, { revisaoExportada: reg.revisaoExportada, arquivo: reg.arquivo });
}

/** Grava um processo novo (importado ou de arquivo) e abre. */
export async function abrirNovoNaBiblioteca(p: Processo, registro: Pick<RegistroProcesso, 'revisaoExportada' | 'arquivo'> = {}): Promise<void> {
  const loja = useLoja.getState();
  await loja.salvarAgora();
  const gravado = await gravarProcesso({ ...p, revisao: Math.max(0, p.revisao - 1) }, registro);
  loja.carregar(gravado, registro);
}
