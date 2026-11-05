import type { Etapa, Processo } from '../modelo/schema';
import { RAIA_PADRAO } from '../modelo/tipos';
import { chaveNome, limparTexto } from '../util/texto';

/**
 * Descobre a raia de cada etapa (ESPECIFICACAO §4.4).
 * Anotações não pertencem a raia nenhuma e ficam fora do mapa.
 */
export function resolverRaias(p: Processo): Map<string, string> {
  const porId = new Map(p.etapas.map((e) => [e.id, e]));
  const indice = new Map(p.etapas.map((e, i) => [e.id, i]));
  const predecessores = new Map<string, string[]>();
  for (const e of p.etapas) {
    for (const s of e.saidas) {
      if (!s.destino || !porId.has(s.destino)) continue;
      const lista = predecessores.get(s.destino) ?? [];
      lista.push(e.id);
      predecessores.set(s.destino, lista);
    }
  }

  const memo = new Map<string, string | null>();
  const visitando = new Set<string>();

  const vizinhoNaLista = (e: Etapa, passo: 1 | -1): Etapa | undefined => {
    for (let i = (indice.get(e.id) ?? 0) + passo; i >= 0 && i < p.etapas.length; i += passo) {
      const v = p.etapas[i];
      if (v && v.tipo !== 'anotacao') return v;
    }
    return undefined;
  };

  /** Raia herdada; `null` quando não dá para concluir sem o padrão. */
  const resolver = (e: Etapa | undefined): string | null => {
    if (!e || e.tipo === 'anotacao') return null;
    if (memo.has(e.id)) return memo.get(e.id) ?? null;
    if (visitando.has(e.id)) return null;
    visitando.add(e.id);

    const ator = limparTexto(e.ator);
    let raia: string | null = null;
    const destino = () => resolver(porId.get(e.saidas.find((s) => s.destino)?.destino ?? ''));
    const predecessor = () => {
      for (const id of predecessores.get(e.id) ?? []) {
        const r = resolver(porId.get(id));
        if (r) return r;
      }
      return null;
    };

    if (ator) {
      raia = ator;
    } else if (e.tipo === 'inicio') {
      raia = destino() ?? resolver(vizinhoNaLista(e, 1));
    } else if (e.tipo === 'fim') {
      raia = predecessor() ?? resolver(vizinhoNaLista(e, -1));
    } else if (e.tipo === 'intermediario' || e.tipo === 'link') {
      raia = destino() ?? predecessor() ?? resolver(vizinhoNaLista(e, -1)) ?? resolver(vizinhoNaLista(e, 1));
    }

    visitando.delete(e.id);
    memo.set(e.id, raia);
    return raia;
  };

  const resultado = new Map<string, string>();
  for (const e of p.etapas) {
    if (e.tipo === 'anotacao') continue;
    resultado.set(e.id, resolver(e) ?? RAIA_PADRAO);
  }
  return resultado;
}

/**
 * Ordem das raias: a ordem manual (se houver) primeiro, depois as raias que
 * não estão nela, por ordem de primeira aparição. Raias da ordem manual que
 * não existem mais são descartadas.
 */
export function ordemDasRaias(p: Processo, raias: Map<string, string> = resolverRaias(p)): string[] {
  const naturais: string[] = [];
  for (const raia of raias.values()) if (!naturais.includes(raia)) naturais.push(raia);

  const manual = p.layout.ordemRaias;
  if (!manual) return naturais;

  const existentes = new Map(naturais.map((r) => [chaveNome(r), r]));
  const ordem: string[] = [];
  for (const r of manual) {
    const real = existentes.get(chaveNome(r));
    if (real && !ordem.includes(real)) ordem.push(real);
  }
  for (const r of naturais) if (!ordem.includes(r)) ordem.push(r);
  return ordem;
}

/**
 * Eventos de fim: o responsável é opcional e só serve para definir a raia.
 * Remove (no próprio objeto) o responsável que coincide com a raia que o
 * evento já herdaria de quem aponta para ele.
 */
export function simplificarAtoresDeFim(p: Processo): void {
  for (const e of p.etapas) {
    if (e.tipo !== 'fim' || !e.ator) continue;
    const ator = e.ator;
    delete e.ator;
    if (resolverRaias(p).get(e.id) !== ator) e.ator = ator;
  }
}
