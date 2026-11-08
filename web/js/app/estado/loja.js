/**
 * Estado da aplicação: processo aberto, desfazer/refazer, seleção, avisos
 * e salvamento automático no IndexedDB (ESPECIFICACAO §14.1). Também guarda
 * o estado da interface (aba, gaveta, menus e janelas abertas).
 *
 * Um único objeto de estado, trocado inteiro a cada mudança (nunca alterado
 * no lugar). Quem desenha a tela assina com `assinar()` e é avisado depois
 * de cada `definir()`.
 */
/** @import { GrafoImportado, Processo } from '../../core/index.js' */
/** @import { DadosRegistro, RegistroProcesso } from '../armazenamento/banco.js' */
/** @import { Tema } from '../tema.js' */
import { criarProcesso, processoExemplo } from '../../core/index.js';
import {
  atualizarRegistro,
  gravarPreferencia,
  gravarProcesso,
  lerPreferencia,
  lerRegistro,
  listarProcessos,
  pedirPersistencia,
} from '../armazenamento/banco.js';
import { aplicarTema, temaSalvo } from '../tema.js';
import { mensagem } from '../dom.js';

/**
 * @typedef {{ estado: 'pronto' }
 *   | { estado: 'pendente' }
 *   | { estado: 'salvando' }
 *   | { estado: 'salvo', em: string }
 *   | { estado: 'erro', erro: string }} EstadoSalvamento
 */

/**
 * @typedef {Object} Aviso
 * @property {number} id
 * @property {'ok' | 'erro' | 'info'} tipo
 * @property {string} texto
 */

/** @typedef {'etapa' | 'problemas' | 'analises' | 'raci' | 'processo'} AbaLateral */

/**
 * @typedef {Object} ImportacaoPendente
 * @property {string} nomeArquivo
 * @property {string} formato
 * @property {string} nomeFormato
 * @property {GrafoImportado[]} grafos
 */

/**
 * @typedef {Object} ConflitoPendente
 * @property {Processo} arquivo
 * @property {RegistroProcesso} navegador
 * @property {string} nomeArquivo
 * @property {FileSystemFileHandle} [handle]
 */

/**
 * Janela aberta (no máximo uma).
 * @typedef {null
 *   | { tipo: 'biblioteca', registros: RegistroProcesso[] | null, busca: string, confirmarExclusao: string | null }
 *   | { tipo: 'importacao', dados: ImportacaoPendente, indice: number, manterLayout: boolean }
 *   | { tipo: 'conflito', dados: ConflitoPendente }
 *   | { tipo: 'lote', itens: import('../importacao-lote.js').ItemLote[], total: number, feitos: number }} Modal
 */

/**
 * @typedef {Object} EstadoUi
 * @property {AbaLateral} aba
 * @property {boolean} gavetaAberta
 * @property {boolean} menuExportar
 * @property {Modal} modal
 * @property {import('../../core/index.js').TipoEtapa} tipoNovo Tipo escolhido em "Inserir depois".
 */

/**
 * @typedef {Object} Estado
 * @property {Processo | null} processo
 * @property {Processo[]} passado
 * @property {Processo[]} futuro
 * @property {string | null} selecionada
 * @property {EstadoSalvamento} salvamento
 * @property {DadosRegistro} registro Metadados do registro aberto (arquivo associado, revisão exportada).
 * @property {Aviso[]} avisos
 * @property {Tema} tema
 * @property {EstadoUi} ui
 */

/** @typedef {(atual: Estado, anterior: Estado) => void} Ouvinte */

const LIMITE_HISTORICO = 100;
const ATRASO_SALVAMENTO = 800;

/** @returns {Estado} */
export const estadoInicial = () => ({
  processo: null,
  passado: [],
  futuro: [],
  selecionada: null,
  salvamento: { estado: 'pronto' },
  registro: {},
  avisos: [],
  tema: temaSalvo(),
  ui: { aba: 'etapa', gavetaAberta: true, menuExportar: false, modal: null, tipoNovo: 'tarefa' },
});

let atual = estadoInicial();
/** @type {Set<Ouvinte>} */
const ouvintes = new Set();
/** @type {ReturnType<typeof setTimeout> | undefined} */
let temporizador;
let proximoAviso = 1;
let pediuPersistencia = false;

/** Estado atual (não altere: use as ações). */
export const estado = () => atual;

/**
 * Avisa `fn` a cada mudança. Devolve a função que cancela a assinatura.
 * @param {Ouvinte} fn
 */
export function assinar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/**
 * Troca parte do estado e avisa os ouvintes.
 * @param {Partial<Estado> | ((s: Estado) => Partial<Estado>)} mudanca
 */
export function definir(mudanca) {
  const anterior = atual;
  const parcial = typeof mudanca === 'function' ? mudanca(anterior) : mudanca;
  atual = { ...anterior, ...parcial };
  for (const fn of ouvintes) fn(atual, anterior);
}

/**
 * Troca parte do estado da interface.
 * @param {Partial<EstadoUi>} mudanca
 */
export function definirUi(mudanca) {
  definir((s) => ({ ui: { ...s.ui, ...mudanca } }));
}

/* ---------- Ações ---------- */

function agendarSalvamento() {
  clearTimeout(temporizador);
  definir({ salvamento: { estado: 'pendente' } });
  temporizador = setTimeout(() => void salvarAgora(), ATRASO_SALVAMENTO);
}

export function alternarTema() {
  /** @type {Tema} */
  const tema = atual.tema === 'escuro' ? 'claro' : 'escuro';
  aplicarTema(tema);
  definir({ tema });
}

/**
 * @param {Processo} p
 * @param {DadosRegistro} [registro]
 */
export function carregar(p, registro = {}) {
  clearTimeout(temporizador);
  definir({ processo: p, passado: [], futuro: [], selecionada: null, registro, salvamento: { estado: 'pronto' } });
  void gravarPreferencia('ultimoAberto', p.id);
}

/**
 * Aplica uma operação de edição ao processo aberto. Erros viram aviso.
 * Devolve `false` quando nada mudou (e aí nada entra no histórico).
 * @param {(p: Processo) => Processo} op
 * @returns {boolean}
 */
export function aplicar(op) {
  const antes = atual.processo;
  if (!antes) return false;
  let novo;
  try {
    novo = op(antes);
  } catch (e) {
    avisar('erro', mensagem(e));
    return false;
  }
  if (novo === antes || JSON.stringify(novo) === JSON.stringify(antes)) return false;
  definir((s) => ({ processo: novo, passado: [...s.passado.slice(-LIMITE_HISTORICO + 1), antes], futuro: [] }));
  agendarSalvamento();
  return true;
}

export function desfazer() {
  const { passado, processo, futuro } = atual;
  const anterior = passado.at(-1);
  if (!anterior || !processo) return;
  definir({ processo: anterior, passado: passado.slice(0, -1), futuro: [processo, ...futuro] });
  agendarSalvamento();
}

export function refazer() {
  const { passado, processo, futuro } = atual;
  const proximo = futuro[0];
  if (!proximo || !processo) return;
  definir({ processo: proximo, passado: [...passado, processo], futuro: futuro.slice(1) });
  agendarSalvamento();
}

/**
 * Seleciona uma etapa. O painel lateral passa a mostrar os detalhes dela
 * (menos quando se está na RACI).
 * @param {string | null} id
 */
export function selecionar(id) {
  if (atual.selecionada === id) return;
  definir((s) => ({
    selecionada: id,
    ui: id && s.ui.aba !== 'raci' ? { ...s.ui, aba: 'etapa' } : s.ui,
  }));
}

/**
 * @param {Aviso['tipo']} tipo
 * @param {string} texto
 */
export function avisar(tipo, texto) {
  const id = proximoAviso++;
  definir((s) => ({ avisos: [...s.avisos.slice(-3), { id, tipo, texto }] }));
  setTimeout(() => dispensarAviso(id), tipo === 'erro' ? 8000 : 4500);
}

/** @param {number} id */
export function dispensarAviso(id) {
  if (!atual.avisos.some((a) => a.id === id)) return;
  definir((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
}

export async function salvarAgora() {
  clearTimeout(temporizador);
  const p = atual.processo;
  if (!p) return;
  definir({ salvamento: { estado: 'salvando' } });
  try {
    const gravado = await gravarProcesso(p);
    // Só a revisão e a data voltam para o estado: edições feitas durante a gravação não se perdem
    definir((s) =>
      s.processo?.id === gravado.id
        ? {
            processo: { ...s.processo, revisao: gravado.revisao, alteradoEm: gravado.alteradoEm },
            salvamento: { estado: 'salvo', em: gravado.alteradoEm },
          }
        : {},
    );
    if (!pediuPersistencia) {
      pediuPersistencia = true;
      void pedirPersistencia();
    }
  } catch (e) {
    definir({ salvamento: { estado: 'erro', erro: mensagem(e) } });
  }
}

/**
 * Registra que o processo foi gravado em arquivo (revisão e arquivo associado).
 * @param {RegistroProcesso['arquivo']} [arquivo]
 */
export async function marcarExportado(arquivo) {
  const p = atual.processo;
  if (!p) return;
  await salvarAgora();
  const revisao = atual.processo?.revisao;
  /** @type {DadosRegistro} */
  const registro = { ...atual.registro, revisaoExportada: revisao, ...(arquivo ? { arquivo } : {}) };
  definir({ registro });
  await atualizarRegistro(p.id, registro);
}

/* ---------- Biblioteca ---------- */

/** @type {Promise<'continuou' | 'exemplo'> | null} */
let inicializacao = null;

/**
 * Abre o último processo usado; sem nenhum, cria o exemplo (bom para a demonstração). Roda uma vez só.
 * @returns {Promise<'continuou' | 'exemplo'>}
 */
export function inicializar() {
  inicializacao ??= inicializarDeFato().finally(() => {
    inicializacao = null;
  });
  return inicializacao;
}

/** @returns {Promise<'continuou' | 'exemplo'>} */
async function inicializarDeFato() {
  const ultimo = await lerPreferencia('ultimoAberto');
  const reg = (typeof ultimo === 'string' && (await lerRegistro(ultimo))) || (await listarProcessos())[0];
  if (reg) {
    carregar(reg.processo, { revisaoExportada: reg.revisaoExportada, arquivo: reg.arquivo });
    return 'continuou';
  }
  const gravado = await gravarProcesso(processoExemplo());
  carregar(gravado);
  return 'exemplo';
}

/** Começa um processo vazio, já gravado na biblioteca. */
export async function novoProcesso(nome = 'Novo processo') {
  await salvarAgora();
  carregar(await gravarProcesso(criarProcesso({ nome })));
}

/**
 * Abre um processo da biblioteca.
 * @param {string} id
 */
export async function abrirDaBiblioteca(id) {
  await salvarAgora();
  const reg = await lerRegistro(id);
  if (!reg) {
    avisar('erro', 'Processo não encontrado na biblioteca');
    return;
  }
  carregar(reg.processo, { revisaoExportada: reg.revisaoExportada, arquivo: reg.arquivo });
}

/**
 * Grava um processo novo (importado ou de arquivo) e abre.
 * @param {Processo} p
 * @param {DadosRegistro} [registro]
 */
export async function abrirNovoNaBiblioteca(p, registro = {}) {
  await salvarAgora();
  const gravado = await gravarProcesso({ ...p, revisao: Math.max(0, p.revisao - 1) }, registro);
  carregar(gravado, registro);
}

/**
 * Grava um processo (importado ou de arquivo) na biblioteca sem abrir, mantendo a revisão
 * que ele já tem. Usado na importação em lote.
 * @param {Processo} p
 * @param {DadosRegistro} [registro]
 * @returns {Promise<Processo>}
 */
export async function guardarNaBiblioteca(p, registro = {}) {
  // gravarProcesso soma 1; desconta antes para a revisão ficar igual à do arquivo
  return gravarProcesso({ ...p, revisao: p.revisao - 1 }, registro);
}

/** Só para testes: volta ao estado inicial, sem ouvintes. */
export function reiniciarParaTeste() {
  clearTimeout(temporizador);
  atual = estadoInicial();
  ouvintes.clear();
}
