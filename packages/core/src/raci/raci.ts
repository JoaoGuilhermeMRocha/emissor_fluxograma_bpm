/**
 * Matriz RACI (ESPECIFICACAO §9). Automático: o ator da raia é R nas
 * atividades e A nos gateways. O usuário acrescenta A, C e I e pode
 * substituir os responsáveis.
 */
import type { Etapa, Processo } from '../modelo/schema';
import { DEFINICOES, RAIA_PADRAO, ehGateway } from '../modelo/tipos';
import { resolverRaias } from '../regras/raias';
import { chaveNome, limparTexto } from '../util/texto';

export type LetraRaci = 'R' | 'A' | 'C' | 'I';

/** Etapas que entram como linha na RACI: atividades e gateways. */
export const entraNaRaci = (e: Etapa): boolean => {
  const f = DEFINICOES[e.tipo].familia;
  return f === 'atividade' || f === 'gateway';
};

/** Responsáveis (R) efetivos: os definidos manualmente ou, se não houver, o ator nas atividades. */
export function responsaveisDaEtapa(p: Processo, e: Etapa): string[] {
  const manual = p.raci.porEtapa[e.id]?.responsaveis;
  if (manual) return manual.map(limparTexto).filter(Boolean);
  if (ehGateway(e.tipo)) return [];
  const ator = limparTexto(e.ator);
  return ator ? [ator] : [];
}

/** Aprovadores (A) efetivos: os manuais e, nos gateways, o ator da raia. */
export function aprovadoresDaEtapa(p: Processo, e: Etapa): string[] {
  const manuais = (p.raci.porEtapa[e.id]?.aprovadores ?? []).map(limparTexto).filter(Boolean);
  const ator = limparTexto(e.ator);
  return ehGateway(e.tipo) && ator ? unicos([ator, ...manuais]) : unicos(manuais);
}

function unicos(nomes: string[]): string[] {
  const vistos = new Map<string, string>();
  for (const n of nomes) if (n && !vistos.has(chaveNome(n))) vistos.set(chaveNome(n), n);
  return [...vistos.values()];
}

export interface LinhaRaci {
  etapa: string;
  descricao: string;
  tipo: Etapa['tipo'];
  condicional: string;
  apoio: string;
  /** Letras por ator (mesma ordem de `MatrizRaci.atores`). */
  celulas: LetraRaci[][];
}

export interface MatrizRaci {
  atores: string[];
  linhas: LinhaRaci[];
}

export function montarMatrizRaci(p: Processo): MatrizRaci {
  const raias = resolverRaias(p);
  const etapas = p.etapas.filter(entraNaRaci);

  const colunas = new Map<string, string>();
  const addColuna = (nome: string) => {
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
    const letras: [LetraRaci, string[]][] = [
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
    const celulas: LetraRaci[][] = atores.map(() => []);
    for (const [letra, nomes] of letras) {
      for (const n of nomes) {
        const cel = celulas[indice.get(chaveNome(n))!]!;
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
