/** @import { FormaImportada, GrafoImportado, Importador, NoImportado } from './grafo-importado.js' */
/**
 * Importador de SVG exportado pela ferramenta Fluid (ESPECIFICACAO §11.5).
 *
 * O Fluid desenha o fluxo com a biblioteca React Flow e o botão "exportar SVG"
 * gera um SVG que embute o DOM dos nós e das setas. Não é um print cego: dá
 * para recuperar a estrutura.
 *
 * O que é lido com segurança:
 *  - cada nó tem `data-testid="rf__node-<id>"` e, no cartão, a descrição, o
 *    responsável e o tempo estimado;
 *  - cada seta tem `aria-label="Edge from <origem> to <destino>"`.
 *
 * O que é heurística (o SVG não traz): o tipo da etapa é deduzido pelo número
 * de ligações (2+ saídas → decisão; sem entrada → início; sem saída → fim; o
 * resto → tarefa). Os rótulos dos ramos (SIM/NÃO) não existem neste formato.
 */
import { chaveNome } from '../util/texto.js';

const RE_NO = /data-testid="rf__node-(\d+)"/g;
const RE_ARESTA = /aria-label="Edge from (\d+) to (\d+)"/g;
const RE_TEXTO = />([^<>]{1,90})</g;
const RE_DURACAO = /(\d+\s*h\b|\d+\s*min|úteis)/i;
const RE_LETRA = /[A-Za-zÀ-ÿ]/;

/**
 * @param {Uint8Array | string} c
 * @returns {string}
 */
const decodificar = (c) => (typeof c === 'string' ? c : new TextDecoder('utf-8').decode(c));

/**
 * @param {string} conteudo
 * @returns {boolean}
 */
export function ehSvgFluid(conteudo) {
  // Os nós podem ficar além dos primeiros KB (estilos embutidos enormes), então
  // varre o conteúdo inteiro — indexOf é rápido mesmo em arquivos grandes.
  return (
    /<svg[\s>]/i.test(conteudo.slice(0, 2000)) &&
    conteudo.includes('react-flow') &&
    (conteudo.includes('rf__node-') || conteudo.includes('react-flow__node'))
  );
}

/**
 * @param {Uint8Array | string} conteudo
 * @returns {GrafoImportado[]}
 */
export function importarSvgFluid(conteudo) {
  const bruto = decodificar(conteudo);
  if (!ehSvgFluid(bruto))
    throw new Error('O SVG não parece ter sido exportado pelo Fluid (sem elementos do React Flow)');
  // Sem os atributos style gigantes, sobra só o conteúdo útil
  const html = bruto.replace(/\sstyle="[^"]*"/g, '');

  // Setas (origem → destino), sem repetição
  const vistas = new Set();
  const arestas = [];
  for (const m of html.matchAll(RE_ARESTA)) {
    const chave = `${m[1]}\u0000${m[2]}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    arestas.push({ id: `L${arestas.length + 1}`, origem: m[1], destino: m[2] });
  }
  const saidas = new Map();
  const entradas = new Map();
  for (const a of arestas) {
    saidas.set(a.origem, (saidas.get(a.origem) ?? 0) + 1);
    entradas.set(a.destino, (entradas.get(a.destino) ?? 0) + 1);
  }

  // Nós: cada bloco vai do seu data-testid até o do próximo nó
  const inicios = [...html.matchAll(RE_NO)];
  const raias = new Map();
  /** @type {NoImportado[]} */
  const nos = inicios.map((m, i) => {
    const id = m[1];
    const bloco = html.slice(m.index, inicios[i + 1]?.index ?? m.index + 4000);
    const textos = [...bloco.matchAll(RE_TEXTO)]
      .map((t) => t[1].trim())
      .filter((t) => t && !t.startsWith('#'));
    const duracao = textos.find((t) => RE_DURACAO.test(t));
    const comLetra = textos.filter((t) => t !== duracao && RE_LETRA.test(t));

    const od = saidas.get(id) ?? 0;
    const ind = entradas.get(id) ?? 0;
    const forma = od === 0 ? 'fim' : ind === 0 ? 'inicio' : od >= 2 ? 'decisao' : 'tarefa';

    const responsavel = forma === 'inicio' || forma === 'fim' ? '' : (comLetra[1] ?? '');
    /** @type {NoImportado} */
    const no = { id, rotulo: comLetra[0] ?? '', forma };
    if (responsavel) {
      const chave = chaveNome(responsavel);
      if (!raias.has(chave)) raias.set(chave, responsavel);
      no.raiaId = chave;
    }
    if (duracao) no.extras = { apoio: `Tempo estimado: ${duracao.replace(/\s+/g, ' ')}` };
    return no;
  });

  const avisos = [
    'Tipos inferidos pelo desenho: nós com 2+ saídas viraram decisões — ajuste os que forem gateway paralelo ou tarefa com várias saídas.',
    'O SVG do Fluid não traz os rótulos dos ramos (SIM/NÃO) nem distingue tarefa de tarefa de sistema; revise onde for preciso.',
  ];
  const perdas = ['Posições do desenho original (o layout é refeito automaticamente)'];

  const listaRaias = [...raias.values()].map((nome, ordem) => ({ id: chaveNome(nome), nome, ordem }));
  return [{ raias: listaRaias, nos, arestas, associacoes: [], avisos, perdas }];
}

export const importadorFluidSvg = {
  formato: 'fluid-svg',
  nome: 'Fluid (SVG exportado)',
  extensoes: ['.svg'],
  detectar(_nome, conteudo) {
    return ehSvgFluid(decodificar(conteudo)) ? 0.95 : 0; // SVG comum (sem React Flow) não é importável
  },
  importar: (conteudo) => importarSvgFluid(conteudo),
};
