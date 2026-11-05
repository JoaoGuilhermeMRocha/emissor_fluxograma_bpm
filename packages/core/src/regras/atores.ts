import type { Processo } from '../modelo/schema';
import { chaveNome, limparTexto } from '../util/texto';

/** Atores citados nas etapas, na ordem de primeira aparição. */
export function atoresDasEtapas(p: Processo): string[] {
  const vistos = new Map<string, string>();
  for (const e of p.etapas) {
    const nome = limparTexto(e.ator);
    if (nome && !vistos.has(chaveNome(nome))) vistos.set(chaveNome(nome), nome);
  }
  return [...vistos.values()];
}

/** Todos os nomes de pessoas/áreas conhecidos no processo (etapas + RACI). */
export function atoresConhecidos(p: Processo): string[] {
  const vistos = new Map<string, string>();
  const add = (nome: string | undefined) => {
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
 */
export function canonizarAtor(p: Processo, nome: string | undefined): string {
  const limpo = limparTexto(nome);
  if (!limpo) return '';
  const chave = chaveNome(limpo);
  return atoresConhecidos(p).find((a) => chaveNome(a) === chave) ?? limpo;
}
