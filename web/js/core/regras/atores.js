/** @import { Processo } from '../modelo/schema.js' */
import { chaveNome, limparTexto } from '../util/texto.js';

/**
 * Atores citados nas etapas, na ordem de primeira aparição.
 * @param {Processo} p
 * @returns {string[]}
 */
export function atoresDasEtapas(p) {
  const vistos = new Map();
  for (const e of p.etapas) {
    const nome = limparTexto(e.ator);
    if (nome && !vistos.has(chaveNome(nome))) vistos.set(chaveNome(nome), nome);
  }
  return [...vistos.values()];
}

/**
 * Todos os nomes de pessoas/áreas conhecidos no processo (etapas + RACI).
 * @param {Processo} p
 * @returns {string[]}
 */
export function atoresConhecidos(p) {
  const vistos = new Map();
  const add = (nome) => {
    const limpo = limparTexto(nome);
    if (limpo && !vistos.has(chaveNome(limpo))) vistos.set(chaveNome(limpo), limpo);
  };
  for (const e of p.etapas) add(e.ator);
  for (const a of p.raci.atoresExtras) add(a);
  for (const r of Object.values(p.raci.porEtapa)) {
    [...(r.responsaveis ?? []), ...r.aprovadores, ...r.consultados, ...r.informados].forEach(add);
  }
  return [...vistos.values()];
}

/**
 * Canonização (ESPECIFICACAO §4.4): se já existe um ator com o mesmo nome
 * normalizado, devolve a grafia existente; senão, devolve o nome limpo.
 * @param {Processo} p
 * @param {string | undefined} nome
 * @returns {string}
 */
export function canonizarAtor(p, nome) {
  const limpo = limparTexto(nome);
  if (!limpo) return '';
  const chave = chaveNome(limpo);
  return atoresConhecidos(p).find((a) => chaveNome(a) === chave) ?? limpo;
}
