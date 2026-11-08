/** @import { Processo } from '../modelo/schema.js' */

/**
 * @param {Processo} p
 * @returns {Grafo}
 */
export function construirGrafo(p) {
  const fluxo = p.etapas.filter((e) => e.tipo !== 'anotacao');
  const ids = new Set(fluxo.map((e) => e.id));
  const sucessores = new Map(fluxo.map((e) => [e.id, []]));
  const predecessores = new Map(fluxo.map((e) => [e.id, []]));
  const arestas = [];
  const arestasDe = new Map(fluxo.map((e) => [e.id, []]));

  for (const e of fluxo) {
    for (const s of e.saidas) {
      if (!s.destino || !ids.has(s.destino)) continue;
      const a = s.rotulo
        ? { origem: e.id, destino: s.destino, rotulo: s.rotulo }
        : { origem: e.id, destino: s.destino };
      arestas.push(a);
      arestasDe.get(e.id).push(a);
      sucessores.get(e.id).push(s.destino);
      predecessores.get(s.destino).push(e.id);
    }
  }

  const g = {
    nos: fluxo.map((e) => e.id),
    arestas,
    arestasDe,
    sucessores,
    predecessores,
    fins: fluxo.filter((e) => e.tipo === 'fim').map((e) => e.id),
  };
  const inicio = fluxo.find((e) => e.tipo === 'inicio');
  if (inicio) g.inicio = inicio.id;
  return g;
}

/**
 * Nós alcançáveis a partir de `origens`, seguindo `vizinhos`.
 * @param {string[]} origens
 * @param {Map<string, string[]>} vizinhos
 * @returns {Set<string>}
 */
function alcance(origens, vizinhos) {
  const vistos = new Set();
  const pilha = [...origens];
  while (pilha.length) {
    const n = pilha.pop();
    if (vistos.has(n)) continue;
    vistos.add(n);
    for (const v of vizinhos.get(n) ?? []) if (!vistos.has(v)) pilha.push(v);
  }
  return vistos;
}

/**
 * Etapas que o fluxo nunca atinge a partir do início. Vazio se não houver início.
 * @param {Grafo} g
 * @returns {string[]}
 */
export function inalcancaveis(g) {
  if (!g.inicio) return [];
  const ok = alcance([g.inicio], g.sucessores);
  return g.nos.filter((n) => !ok.has(n));
}

/**
 * Etapas das quais não existe caminho até um fim (becos sem saída).
 * @param {Grafo} g
 * @returns {string[]}
 */
export function semCaminhoAteFim(g) {
  if (!g.fins.length) return [];
  const ok = alcance(g.fins, g.predecessores);
  return g.nos.filter((n) => !ok.has(n));
}

/**
 * Arestas de retorno (loops) numa busca em profundidade iterativa. Começa
 * pelo início e depois cobre os nós não visitados, na ordem da lista.
 * Independe da ordem visual das etapas.
 * @param {Grafo} g
 * @returns {Aresta[]}
 */
export function arestasDeRetorno(g) {
  const BRANCO = 0,
    CINZA = 1,
    PRETO = 2;
  const cor = new Map(g.nos.map((n) => [n, BRANCO]));
  const retornos = [];
  const raizes = g.inicio ? [g.inicio, ...g.nos] : g.nos;

  for (const raiz of raizes) {
    if (cor.get(raiz) !== BRANCO) continue;
    const pilha = [{ no: raiz, i: 0 }];
    cor.set(raiz, CINZA);
    while (pilha.length) {
      const topo = pilha[pilha.length - 1];
      const a = g.arestasDe.get(topo.no)?.[topo.i++];
      if (!a) {
        cor.set(topo.no, PRETO);
        pilha.pop();
        continue;
      }
      const c = cor.get(a.destino);
      if (c === CINZA) retornos.push(a);
      else if (c === BRANCO) {
        cor.set(a.destino, CINZA);
        pilha.push({ no: a.destino, i: 0 });
      }
    }
  }
  return retornos;
}

/**
 * Conta caminhos do início até cada fim no grafo sem as arestas de retorno
 * (que vira acíclico). Programação dinâmica em ordem topológica: O(V + E).
 * @param {Grafo} g
 * @returns {ResumoCaminhos}
 */
export function resumoCaminhos(g) {
  const vazio = { total: 0, porFim: {}, menor: 0, maior: 0 };
  if (!g.inicio) return vazio;

  const retorno = new Set(arestasDeRetorno(g));
  const saidas = new Map(g.nos.map((n) => [n, (g.arestasDe.get(n) ?? []).filter((a) => !retorno.has(a))]));
  const grauEntrada = new Map(g.nos.map((n) => [n, 0]));
  for (const lista of saidas.values()) {
    for (const a of lista) grauEntrada.set(a.destino, (grauEntrada.get(a.destino) ?? 0) + 1);
  }

  // Kahn
  const fila = g.nos.filter((n) => grauEntrada.get(n) === 0);
  const ordem = [];
  for (let k = 0; k < fila.length; k++) {
    const n = fila[k];
    ordem.push(n);
    for (const a of saidas.get(n) ?? []) {
      const gr = (grauEntrada.get(a.destino) ?? 0) - 1;
      grauEntrada.set(a.destino, gr);
      if (gr === 0) fila.push(a.destino);
    }
  }

  const qtd = new Map([[g.inicio, 1]]);
  const menor = new Map([[g.inicio, 1]]);
  const maior = new Map([[g.inicio, 1]]);
  for (const n of ordem) {
    const q = qtd.get(n);
    if (!q) continue;
    for (const a of saidas.get(n) ?? []) {
      qtd.set(a.destino, (qtd.get(a.destino) ?? 0) + q);
      menor.set(a.destino, Math.min(menor.get(a.destino) ?? Infinity, menor.get(n) + 1));
      maior.set(a.destino, Math.max(maior.get(a.destino) ?? 0, maior.get(n) + 1));
    }
  }

  const porFim = {};
  let total = 0;
  let mn = Infinity;
  let mx = 0;
  for (const f of g.fins) {
    const q = qtd.get(f) ?? 0;
    porFim[f] = q;
    total += q;
    if (q) {
      mn = Math.min(mn, menor.get(f));
      mx = Math.max(mx, maior.get(f));
    }
  }
  return { total, porFim, menor: total ? mn : 0, maior: mx };
}
/**
 * @typedef {Object} Aresta
 * @property {string} origem
 * @property {string} destino
 * @property {string} [rotulo]
 */
/**
 * @typedef {Object} Grafo
 * @property {string[]} nos Ids das etapas de fluxo, na ordem da lista.
 * @property {Aresta[]} arestas
 * @property {Map<string, Aresta[]>} arestasDe Arestas indexadas pela origem.
 * @property {Map<string, string[]>} sucessores
 * @property {Map<string, string[]>} predecessores
 * @property {string} [inicio]
 * @property {string[]} fins
 */
/**
 * @typedef {Object} ResumoCaminhos
 * @property {number} total Total de caminhos distintos do início até algum fim, sem repetir loops.
 * @property {Record<string, number>} porFim
 * @property {number} menor Número de etapas no caminho mais curto e no mais longo (contando início e fim).
 * @property {number} maior
 */
