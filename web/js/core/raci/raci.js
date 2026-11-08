/** @import { Etapa, Processo } from '../modelo/schema.js' */
import { DEFINICOES, RAIA_PADRAO, ehGateway } from '../modelo/tipos.js';
import { resolverRaias } from '../regras/raias.js';
import { chaveNome, limparTexto } from '../util/texto.js';

/**
 * Etapas que entram como linha na RACI: atividades e gateways.
 * @param {Etapa} e
 * @returns {boolean}
 */
export const entraNaRaci = (e) => {
  const f = DEFINICOES[e.tipo].familia;
  return f === 'atividade' || f === 'gateway';
};

/**
 * Responsáveis (R) efetivos: os definidos manualmente ou, se não houver, o ator nas atividades.
 * @param {Processo} p
 * @param {Etapa} e
 * @returns {string[]}
 */
export function responsaveisDaEtapa(p, e) {
  const manual = p.raci.porEtapa[e.id]?.responsaveis;
  if (manual) return manual.map(limparTexto).filter(Boolean);
  if (ehGateway(e.tipo)) return [];
  const ator = limparTexto(e.ator);
  return ator ? [ator] : [];
}

/**
 * Aprovadores (A) efetivos: os manuais e, nos gateways, o ator da raia.
 * @param {Processo} p
 * @param {Etapa} e
 * @returns {string[]}
 */
export function aprovadoresDaEtapa(p, e) {
  const manuais = (p.raci.porEtapa[e.id]?.aprovadores ?? []).map(limparTexto).filter(Boolean);
  const ator = limparTexto(e.ator);
  return ehGateway(e.tipo) && ator ? unicos([ator, ...manuais]) : unicos(manuais);
}

/**
 * @param {string[]} nomes
 * @returns {string[]}
 */
function unicos(nomes) {
  const vistos = new Map();
  for (const n of nomes) if (n && !vistos.has(chaveNome(n))) vistos.set(chaveNome(n), n);
  return [...vistos.values()];
}

/**
 * @param {Processo} p
 * @returns {MatrizRaci}
 */
export function montarMatrizRaci(p) {
  const raias = resolverRaias(p);
  const etapas = p.etapas.filter(entraNaRaci);

  const colunas = new Map();
  const addColuna = (nome) => {
    const n = limparTexto(nome);
    if (n && !colunas.has(chaveNome(n))) colunas.set(chaveNome(n), n);
  };
  for (const e of etapas) {
    const raia = raias.get(e.id);
    if (raia && raia !== RAIA_PADRAO) addColuna(raia);
  }
  p.raci.atoresExtras.forEach(addColuna);

  const porEtapa = etapas.map((e) => {
    const r = p.raci.porEtapa[e.id];
    /** @type {[LetraRaci, string[]][]} */
    const letras = [
      ['R', responsaveisDaEtapa(p, e)],
      ['A', aprovadoresDaEtapa(p, e)],
      ['C', (r?.consultados ?? []).map(limparTexto).filter(Boolean)],
      ['I', (r?.informados ?? []).map(limparTexto).filter(Boolean)],
    ];
    for (const [, nomes] of letras) nomes.forEach(addColuna);
    return { e, letras };
  });

  const atores = [...colunas.values()];
  const indice = new Map(atores.map((a, i) => [chaveNome(a), i]));

  const linhas = porEtapa.map(({ e, letras }) => {
    const celulas = atores.map(() => []);
    for (const [letra, nomes] of letras) {
      for (const n of nomes) {
        const cel = celulas[indice.get(chaveNome(n))];
        if (!cel.includes(letra)) cel.push(letra);
      }
    }
    const rotulos = e.saidas.map((s) => limparTexto(s.rotulo)).filter(Boolean);
    const padrao = ehGateway(e.tipo) && rotulos.length ? rotulos.join(' / ') : 'Não informado';
    return {
      etapa: e.id,
      descricao: e.descricao,
      tipo: e.tipo,
      condicional: limparTexto(p.raci.porEtapa[e.id]?.condicional) || padrao,
      apoio: limparTexto(e.apoio),
      celulas,
    };
  });

  return { atores, linhas };
}
/** @typedef {'R' | 'A' | 'C' | 'I'} LetraRaci */
/**
 * @typedef {Object} LinhaRaci
 * @property {string} etapa
 * @property {string} descricao
 * @property {Etapa['tipo']} tipo
 * @property {string} condicional
 * @property {string} apoio
 * @property {LetraRaci[][]} celulas Letras por ator (mesma ordem de `MatrizRaci.atores`).
 */
/**
 * @typedef {Object} MatrizRaci
 * @property {string[]} atores
 * @property {LinhaRaci[]} linhas
 */
