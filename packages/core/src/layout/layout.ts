/**
 * Layout automático em camadas com raias (ESPECIFICACAO §6.2).
 *
 * Por que não ELK: o ELK divide o desenho em colunas ("partitioning"), mas
 * raias BPMN são linhas horizontais com o fluxo andando para a direita.
 * Este algoritmo é um Sugiyama simplificado, feito para isso:
 *
 * 1. remove as arestas de retorno (loops), deixando o grafo acíclico;
 * 2. coluna de cada etapa = caminho mais longo desde a origem
 *    (ramos paralelos ficam na mesma coluna);
 * 3. linha = raia do responsável; etapas da mesma raia e coluna são
 *    empilhadas, ordenadas pelo baricentro dos predecessores;
 * 4. setas ortogonais; retornos passam por um canal no rodapé da raia.
 */
import { arestasDeRetorno, construirGrafo, type Aresta } from '../grafo/grafo';
import type { Processo } from '../modelo/schema';
import { ehEvento, ehGateway, type TipoEtapa } from '../modelo/tipos';
import { ordemDasRaias, resolverRaias } from '../regras/raias';

export interface Ponto {
  x: number;
  y: number;
}

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NoPosicionado extends Caixa {
  id: string;
  tipo: TipoEtapa;
  raia: string;
  coluna: number;
}

export interface ArestaPosicionada extends Aresta {
  pontos: Ponto[];
  retorno: boolean;
}

export interface LayoutCalculado {
  piscina: Caixa;
  raias: (Caixa & { nome: string })[];
  nos: NoPosicionado[];
  arestas: ArestaPosicionada[];
  anotacoes: (Caixa & { id: string; alvo?: string })[];
  largura: number;
  altura: number;
}

export const MEDIDAS = {
  atividade: { w: 110, h: 72 },
  gateway: { w: 50, h: 50 },
  evento: { w: 36, h: 36 },
  anotacao: { w: 140, h: 50 },
  coluna: 175,
  linha: 115,
  raiaMin: 150,
  canalRetorno: 34,
  cabecalhoPiscina: 30,
  cabecalhoRaia: 30,
  margemConteudo: 40,
  faixaAnotacoes: 90,
} as const;

export function tamanhoDoTipo(tipo: TipoEtapa): { w: number; h: number } {
  if (ehGateway(tipo)) return MEDIDAS.gateway;
  if (ehEvento(tipo)) return MEDIDAS.evento;
  if (tipo === 'anotacao') return MEDIDAS.anotacao;
  return MEDIDAS.atividade;
}

export function calcularLayout(p: Processo): LayoutCalculado {
  const g = construirGrafo(p);
  const porId = new Map(p.etapas.map((e) => [e.id, e]));
  const raiaDe = resolverRaias(p);
  const raias = ordemDasRaias(p, raiaDe);
  const indiceRaia = new Map(raias.map((r, i) => [r, i]));

  // 1–2. Colunas por caminho mais longo no grafo sem retornos
  const retornos = new Set(arestasDeRetorno(g));
  const avanco = g.arestas.filter((a) => !retornos.has(a));
  const entrada = new Map(g.nos.map((n) => [n, 0]));
  for (const a of avanco) entrada.set(a.destino, entrada.get(a.destino)! + 1);
  const coluna = new Map(g.nos.map((n) => [n, 0]));
  const fila = g.nos.filter((n) => entrada.get(n) === 0);
  for (let i = 0; i < fila.length; i++) {
    const n = fila[i]!;
    for (const a of g.arestasDe.get(n) ?? []) {
      if (retornos.has(a)) continue;
      coluna.set(a.destino, Math.max(coluna.get(a.destino)!, coluna.get(n)! + 1));
      entrada.set(a.destino, entrada.get(a.destino)! - 1);
      if (entrada.get(a.destino) === 0) fila.push(a.destino);
    }
  }

  // 3. Empilhamento dentro de cada (raia, coluna), por baricentro dos predecessores
  const ordemLista = new Map(g.nos.map((n, i) => [n, i]));
  const grupos = new Map<string, string[]>();
  for (const n of g.nos) {
    const chave = `${indiceRaia.get(raiaDe.get(n)!)}|${coluna.get(n)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), n]);
  }
  const linhaGlobal = new Map<string, number>();
  const subLinha = new Map<string, { s: number; k: number }>();
  const maxColuna = Math.max(0, ...coluna.values());
  for (let c = 0; c <= maxColuna; c++) {
    raias.forEach((_, ri) => {
      const grupo = grupos.get(`${ri}|${c}`);
      if (!grupo) return;
      const peso = (n: string) => {
        const preds = (g.predecessores.get(n) ?? []).filter((x) => linhaGlobal.has(x));
        return preds.length ? preds.reduce((s, x) => s + linhaGlobal.get(x)!, 0) / preds.length : ri * 1000 + ordemLista.get(n)! / 1000;
      };
      grupo.sort((a, b) => peso(a) - peso(b) || ordemLista.get(a)! - ordemLista.get(b)!);
      grupo.forEach((n, s) => {
        subLinha.set(n, { s, k: grupo.length });
        linhaGlobal.set(n, ri * 1000 + s);
      });
    });
  }

  // Altura das raias
  const linhasPorRaia = raias.map((_, ri) => {
    let max = 1;
    for (const [chave, grupo] of grupos) if (chave.startsWith(`${ri}|`)) max = Math.max(max, grupo.length);
    return max;
  });
  const anotacoesEtapas = p.etapas.filter((e) => e.tipo === 'anotacao');
  const topo = anotacoesEtapas.length ? MEDIDAS.faixaAnotacoes : 0;
  const xConteudo = MEDIDAS.cabecalhoPiscina + MEDIDAS.cabecalhoRaia + MEDIDAS.margemConteudo;
  const largura = xConteudo + (maxColuna + 1) * MEDIDAS.coluna;

  let y = topo;
  const caixasRaias = raias.map((nome, ri) => {
    const h = Math.max(MEDIDAS.raiaMin, linhasPorRaia[ri]! * MEDIDAS.linha) + MEDIDAS.canalRetorno;
    const caixa = { nome, x: MEDIDAS.cabecalhoPiscina, y, w: largura - MEDIDAS.cabecalhoPiscina, h };
    y += h;
    return caixa;
  });
  if (!caixasRaias.length) caixasRaias.push({ nome: '', x: MEDIDAS.cabecalhoPiscina, y: topo, w: largura - MEDIDAS.cabecalhoPiscina, h: MEDIDAS.raiaMin });
  const altura = caixasRaias.at(-1)!.y + caixasRaias.at(-1)!.h;
  const piscina = { x: 0, y: topo, w: largura, h: altura - topo };

  // Posições
  const nos: NoPosicionado[] = g.nos.map((id) => {
    const e = porId.get(id)!;
    const { w, h } = tamanhoDoTipo(e.tipo);
    const raia = raiaDe.get(id)!;
    const cr = caixasRaias[indiceRaia.get(raia) ?? 0]!;
    const { s, k } = subLinha.get(id)!;
    const cx = xConteudo + coluna.get(id)! * MEDIDAS.coluna + MEDIDAS.atividade.w / 2;
    const meioUtil = cr.y + (cr.h - MEDIDAS.canalRetorno) / 2;
    const cy = meioUtil + (s - (k - 1) / 2) * MEDIDAS.linha;
    const manual = p.layout.posicoes[id];
    const limiteY = (y: number) => Math.min(Math.max(y, h / 2 + 4), cr.h - h / 2 - 4);
    const centro = manual ? { x: manual.x, y: cr.y + limiteY(manual.y) } : { x: cx, y: cy };
    return { id, tipo: e.tipo, raia, coluna: coluna.get(id)!, x: Math.round(centro.x - w / 2), y: Math.round(centro.y - h / 2), w, h };
  });
  const no = new Map(nos.map((n) => [n.id, n]));

  // 4. Setas: para cada seta, rotas candidatas em ordem de preferência; fica a primeira que não atravessa etapas
  const centro = (n: Caixa): Ponto => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const folga = 4;
  const segmentoLivre = (p1: Ponto, p2: Ponto, ignorar: Caixa[]): boolean => {
    const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y);
    return !nos.some(
      (n) => !ignorar.includes(n) && x1 < n.x + n.w + folga && x2 > n.x - folga && y1 < n.y + n.h + folga && y2 > n.y - folga,
    );
  };
  const rotaLivre = (pts: Ponto[], ignorar: Caixa[]) => pts.every((pt, k) => k === 0 || segmentoLivre(pts[k - 1]!, pt, ignorar));
  const escolher = (candidatas: Ponto[][], ignorar: Caixa[]): Ponto[] => candidatas.find((r) => rotaLivre(r, ignorar)) ?? candidatas[0]!;

  const vao = MEDIDAS.coluna - MEDIDAS.atividade.w;
  const canalUsado = new Map<number, number>();
  const arestas: ArestaPosicionada[] = g.arestas.map((a) => {
    const o = no.get(a.origem)!;
    const d = no.get(a.destino)!;
    const co = centro(o);
    const cd = centro(d);
    const ignorar = [o, d];
    const ehRetorno = retornos.has(a) || d.x <= o.x;
    let pontos: Ponto[];

    if (ehRetorno) {
      // Retornos: descem até o canal no rodapé da raia mais baixa, andam para a esquerda e sobem
      const ri = Math.max(indiceRaia.get(o.raia) ?? 0, indiceRaia.get(d.raia) ?? 0);
      const cr = caixasRaias[ri]!;
      const usados = canalUsado.get(ri) ?? 0;
      canalUsado.set(ri, usados + 1);
      const yCanal = cr.y + cr.h - 12 - (usados % 3) * 7;
      const descidas: Ponto[][] = [
        [{ x: co.x, y: o.y + o.h }, { x: co.x, y: yCanal }],
        [{ x: co.x, y: o.y + o.h }, { x: co.x, y: o.y + o.h + 14 }, { x: co.x + MEDIDAS.coluna / 2, y: o.y + o.h + 14 }, { x: co.x + MEDIDAS.coluna / 2, y: yCanal }],
        [{ x: o.x + o.w, y: co.y }, { x: o.x + o.w + vao / 2, y: co.y }, { x: o.x + o.w + vao / 2, y: yCanal }],
      ];
      const subidas: Ponto[][] = [
        [{ x: cd.x, y: yCanal }, { x: cd.x, y: d.y + d.h }],
        [{ x: d.x - vao / 2, y: yCanal }, { x: d.x - vao / 2, y: cd.y }, { x: d.x, y: cd.y }],
      ];
      pontos = escolher(descidas.flatMap((ds) => subidas.map((sb) => [...ds, ...sb])), ignorar);
    } else if (Math.abs(co.y - cd.y) < 1) {
      const yCima = Math.min(o.y, d.y) - 16;
      const yBaixo = Math.max(o.y + o.h, d.y + d.h) + 16;
      pontos = escolher(
        [
          [{ x: o.x + o.w, y: co.y }, { x: d.x, y: cd.y }],
          [{ x: co.x, y: o.y }, { x: co.x, y: yCima }, { x: cd.x, y: yCima }, { x: cd.x, y: d.y }],
          [{ x: co.x, y: o.y + o.h }, { x: co.x, y: yBaixo }, { x: cd.x, y: yBaixo }, { x: cd.x, y: d.y + d.h }],
        ],
        ignorar,
      );
    } else {
      const espaco = Math.min(vao, d.x - o.x - o.w);
      const xCedo = o.x + o.w + espaco / 2;
      const xTarde = d.x - espaco / 2;
      const desce = cd.y > co.y;
      const candidatas: Ponto[][] = [];
      // Decisões preferem sair por cima/baixo
      if (ehGateway(o.tipo)) candidatas.push([{ x: co.x, y: desce ? o.y + o.h : o.y }, { x: co.x, y: cd.y }, { x: d.x, y: cd.y }]);
      candidatas.push(
        [{ x: o.x + o.w, y: co.y }, { x: xCedo, y: co.y }, { x: xCedo, y: cd.y }, { x: d.x, y: cd.y }],
        [{ x: o.x + o.w, y: co.y }, { x: xTarde, y: co.y }, { x: xTarde, y: cd.y }, { x: d.x, y: cd.y }],
        [{ x: o.x + o.w, y: co.y }, { x: cd.x, y: co.y }, { x: cd.x, y: desce ? d.y : d.y + d.h }],
      );
      if (ehGateway(o.tipo)) candidatas.push([{ x: co.x, y: desce ? o.y + o.h : o.y }, { x: co.x, y: desce ? d.y - 14 : d.y + d.h + 14 }, { x: cd.x, y: desce ? d.y - 14 : d.y + d.h + 14 }, { x: cd.x, y: desce ? d.y : d.y + d.h }]);
      pontos = escolher(candidatas, ignorar);
    }
    return { ...a, pontos: pontos.map((pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) })), retorno: ehRetorno };
  });

  // Anotações na faixa acima da piscina, perto da etapa ligada
  let xLivre = 0;
  const anotacoes = anotacoesEtapas
    .map((e) => ({ e, alvo: e.anotaEtapa ? no.get(e.anotaEtapa) : undefined }))
    .sort((a, b) => (a.alvo?.x ?? Infinity) - (b.alvo?.x ?? Infinity))
    .map(({ e, alvo }) => {
      const x = Math.max(xLivre, alvo ? alvo.x : xLivre);
      xLivre = x + MEDIDAS.anotacao.w + 15;
      const caixa = { id: e.id, x, y: 15, w: MEDIDAS.anotacao.w, h: MEDIDAS.anotacao.h };
      return alvo ? { ...caixa, alvo: alvo.id } : caixa;
    });
  const larguraFinal = Math.max(largura, xLivre);

  return { piscina: { ...piscina, w: larguraFinal }, raias: caixasRaias.map((r) => ({ ...r, w: larguraFinal - r.x })), nos, arestas, anotacoes, largura: larguraFinal, altura };
}
