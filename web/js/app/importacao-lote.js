/**
 * Importação em lote: vários arquivos (ou uma pasta) de uma vez para a biblioteca,
 * sem trocar o processo aberto. Cada arquivo vira um item do relatório.
 *
 * - `.processo` novo: guardado como está.
 * - `.processo` que já está no navegador: mesma revisão → "já estava"; revisão diferente →
 *   conflito, nada é sobrescrito (abrir sozinho para escolher qual fica).
 * - Outros formatos (BPMN, planilha, SVG do Fluid): cada pool vira um processo, com o
 *   layout refeito; os problemas de validação ficam contados no relatório. O mesmo
 *   conteúdo importado de novo (mesmo com outro nome) vira "já estava", mesmo que o
 *   processo tenha sido editado depois; conteúdo diferente entra como processo novo.
 */
/** @import { ArquivoLido } from './armazenamento/arquivos.js' */
import { abrirArquivo, normalizarGrafo, validar } from '../core/index.js';
import { lerRegistro, listarProcessos } from './armazenamento/banco.js';
import { guardarNaBiblioteca } from './estado/loja.js';
import { mensagem } from './dom.js';

/**
 * @typedef {Object} ItemLote
 * @property {string} arquivo
 * @property {'importado' | 'igual' | 'conflito' | 'erro'} status
 * @property {string} detalhe
 * @property {string} [id] processo na biblioteca (para abrir)
 * @property {string} [nome]
 */

/** @param {string} arquivo */
export const nomeSemExtensao = (arquivo) => arquivo.replace(/\.[^.]+$/, '');

/**
 * @param {import('../core/index.js').Processo} p
 */
const resumoValidacao = (p) => {
  const erros = validar(p).filter((x) => x.severidade === 'erro').length;
  return `${p.etapas.length} etapas${erros ? ` · ${erros} erro(s) de validação` : ''}`;
};

/** @param {Uint8Array} bytes */
async function impressao(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {Uint8Array<ArrayBuffer>} */ (bytes)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Importa um arquivo.
 * @param {ArquivoLido} a
 * @returns {Promise<ItemLote[]>}
 */
export async function importarArquivo(a) {
  try {
    const r = await abrirArquivo(a.nome, a.bytes);
    if (r.tipo === 'erro') return [{ arquivo: a.nome, status: 'erro', detalhe: r.erro }];
    if (r.tipo === 'importacao') {
      const itens = [];
      const hash = await impressao(a.bytes);
      const jaTrazidos = new Map((await listarProcessos()).filter((x) => x.origem).map((x) => [x.origem, x]));
      for (const [i, g] of r.grafos.entries()) {
        const origem = `${hash}:${i}`;
        const anterior = jaTrazidos.get(origem);
        if (anterior) {
          itens.push({ arquivo: a.nome, status: /** @type {const} */ ('igual'), detalhe: 'Já importado antes', id: anterior.id, nome: anterior.nome });
          continue;
        }
        const nome = g.titulo?.trim() ? undefined : nomeSemExtensao(a.nome);
        const { processo } = normalizarGrafo(g, { formato: r.importador.formato, ...(nome ? { nome } : {}) });
        const gravado = await guardarNaBiblioteca(processo, { origem });
        itens.push({
          arquivo: a.nome,
          status: /** @type {const} */ ('importado'),
          detalhe: `${r.importador.nome}: ${resumoValidacao(gravado)}`,
          id: gravado.id,
          nome: gravado.nome,
        });
      }
      return itens;
    }
    const leitura = r.leitura;
    if ('erro' in leitura) return [{ arquivo: a.nome, status: 'erro', detalhe: leitura.erro }];
    if (leitura.somenteLeitura) {
      return [{ arquivo: a.nome, status: 'erro', detalhe: leitura.avisos[0] ?? 'Arquivo de uma versão mais nova do sistema' }];
    }
    const p = leitura.processo;
    const existente = await lerRegistro(p.id);
    if (existente && existente.processo.revisao === p.revisao) {
      return [{ arquivo: a.nome, status: 'igual', detalhe: 'Já estava na biblioteca', id: p.id, nome: p.nome }];
    }
    if (existente) {
      return [{
        arquivo: a.nome,
        status: 'conflito',
        detalhe: `A biblioteca tem outra versão (revisão ${existente.processo.revisao}; arquivo: ${p.revisao}). Nada foi alterado: abra este arquivo sozinho para escolher.`,
        id: p.id,
        nome: p.nome,
      }];
    }
    const gravado = await guardarNaBiblioteca(p, {
      arquivo: { nome: a.nome, ...(a.handle ? { handle: a.handle } : {}) },
      revisaoExportada: p.revisao,
    });
    return [{ arquivo: a.nome, status: 'importado', detalhe: resumoValidacao(gravado), id: gravado.id, nome: gravado.nome }];
  } catch (e) {
    return [{ arquivo: a.nome, status: 'erro', detalhe: mensagem(e) }];
  }
}

/**
 * Importa vários arquivos, um de cada vez.
 * @param {ArquivoLido[]} arquivos
 * @param {(itens: ItemLote[], feitos: number) => void} [aoProgredir]
 * @returns {Promise<ItemLote[]>}
 */
export async function importarLote(arquivos, aoProgredir) {
  /** @type {ItemLote[]} */
  const itens = [];
  for (const [i, a] of arquivos.entries()) {
    itens.push(...(await importarArquivo(a)));
    aoProgredir?.([...itens], i + 1);
  }
  return itens;
}
