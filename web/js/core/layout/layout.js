/** @import { Aresta } from '../grafo/grafo.js' */
/** @import { Processo } from '../modelo/schema.js' */
/** @import { TipoEtapa } from '../modelo/tipos.js' */
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
import { arestasDeRetorno, construirGrafo } from '../grafo/grafo.js';
import { ehEvento, ehGateway } from '../modelo/tipos.js';
import { ordemDasRaias, resolverRaias } from '../regras/raias.js';

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
};

/** Diferença máxima (px) para considerar que uma ponta de seta continua no mesmo lugar. */
const TOLERANCIA_ROTA = 4;

/**
 * Chave de cada seta (`origem>destino`, com `#2`, `#3`… para setas repetidas entre as mesmas
 * etapas), na ordem recebida. É como as rotas manuais ficam guardadas em `layout.setas`.
 * @param {{ origem: string, destino: string }[]} setas
 * @returns {string[]}
 */
export function chavesDasSetas(setas) {
  const vistas = new Map();
  return setas.map((s) => {
    const base = `${s.origem}>${s.destino}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

/**
 * @param {TipoEtapa} tipo
 * @returns {{ w: number; h: number }}
 */
export function tamanhoDoTipo(tipo) {
  if (ehGateway(tipo)) return MEDIDAS.gateway;
  if (ehEvento(tipo)) return MEDIDAS.evento;
  if (tipo === 'anotacao') return MEDIDAS.anotacao;
  return MEDIDAS.atividade;
}

/**
 * @param {Processo} p
 * @returns {LayoutCalculado}
 */
export function calcularLayout(p) {
  const g = construirGrafo(p);
  const porId = new Map(p.etapas.map((e) => [e.id, e]));
  const raiaDe = resolverRaias(p);
  const raias = ordemDasRaias(p, raiaDe);
  const indiceRaia = new Map(raias.map((r, i) => [r, i]));

  // 1–2. Colunas por caminho mais longo no grafo sem retornos
  const retornos = new Set(arestasDeRetorno(g));
  const avanco = g.arestas.filter((a) => !retornos.has(a));
  const entrada = new Map(g.nos.map((n) => [n, 0]));
  for (const a of avanco) entrada.set(a.destino, entrada.get(a.destino) + 1);
  const coluna = new Map(g.nos.map((n) => [n, 0]));
  const fila = g.nos.filter((n) => entrada.get(n) === 0);
  for (let i = 0; i < fila.length; i++) {
    const n = fila[i];
    for (const a of g.arestasDe.get(n) ?? []) {
      if (retornos.has(a)) continue;
      coluna.set(a.destino, Math.max(coluna.get(a.destino), coluna.get(n) + 1));
      entrada.set(a.destino, entrada.get(a.destino) - 1);
      if (entrada.get(a.destino) === 0) fila.push(a.destino);
    }
  }

  // 3. Empilhamento dentro de cada (raia, coluna), por baricentro dos predecessores
  const ordemLista = new Map(g.nos.map((n, i) => [n, i]));
  const grupos = new Map();
  for (const n of g.nos) {
    const chave = `${indiceRaia.get(raiaDe.get(n))}|${coluna.get(n)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), n]);
  }
  const linhaGlobal = new Map();
  const subLinha = new Map();
  const maxColuna = Math.max(0, ...coluna.values());
  for (let c = 0; c <= maxColuna; c++) {
    raias.forEach((_, ri) => {
      const grupo = grupos.get(`${ri}|${c}`);
      if (!grupo) return;
      const peso = (n) => {
        const preds = (g.predecessores.get(n) ?? []).filter((x) => linhaGlobal.has(x));
        return preds.length
          ? preds.reduce((s, x) => s + linhaGlobal.get(x), 0) / preds.length
          : ri * 1000 + ordemLista.get(n) / 1000;
      };
      grupo.sort((a, b) => peso(a) - peso(b) || ordemLista.get(a) - ordemLista.get(b));
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
  // A faixa acima da pool só existe para anotações sem posição definida à mão
  const topo = anotacoesEtapas.some((e) => !p.layout.posicoes[e.id]) ? MEDIDAS.faixaAnotacoes : 0;
  const xConteudo = MEDIDAS.cabecalhoPiscina + MEDIDAS.cabecalhoRaia + MEDIDAS.margemConteudo;
  const largura = xConteudo + (maxColuna + 1) * MEDIDAS.coluna;

  let y = topo;
  const caixasRaias = raias.map((nome, ri) => {
    const h = Math.max(MEDIDAS.raiaMin, linhasPorRaia[ri] * MEDIDAS.linha) + MEDIDAS.canalRetorno;
    const caixa = { nome, x: MEDIDAS.cabecalhoPiscina, y, w: largura - MEDIDAS.cabecalhoPiscina, h };
    y += h;
    return caixa;
  });
  if (!caixasRaias.length)
    caixasRaias.push({
      nome: '',
      x: MEDIDAS.cabecalhoPiscina,
      y: topo,
      w: largura - MEDIDAS.cabecalhoPiscina,
      h: MEDIDAS.raiaMin,
    });
  const altura = caixasRaias.at(-1).y + caixasRaias.at(-1).h;
  const piscina = { x: 0, y: topo, w: largura, h: altura - topo };

  // Posições
  const nos = g.nos.map((id) => {
    const e = porId.get(id);
    const { w, h } = tamanhoDoTipo(e.tipo);
    const raia = raiaDe.get(id);
    const cr = caixasRaias[indiceRaia.get(raia) ?? 0];
    const { s, k } = subLinha.get(id);
    const cx = xConteudo + coluna.get(id) * MEDIDAS.coluna + MEDIDAS.atividade.w / 2;
    const meioUtil = cr.y + (cr.h - MEDIDAS.canalRetorno) / 2;
    const cy = meioUtil + (s - (k - 1) / 2) * MEDIDAS.linha;
    const manual = p.layout.posicoes[id];
    const limiteY = (y) => Math.min(Math.max(y, h / 2 + 4), cr.h - h / 2 - 4);
    const centro = manual ? { x: manual.x, y: cr.y + limiteY(manual.y) } : { x: cx, y: cy };
    return {
      id,
      tipo: e.tipo,
      raia,
      coluna: coluna.get(id),
      x: Math.round(centro.x - w / 2),
      y: Math.round(centro.y - h / 2),
      w,
      h,
    };
  });
  const no = new Map(nos.map((n) => [n.id, n]));

  // 4. Setas: para cada seta, rotas candidatas em ordem de preferência; fica a primeira que não atravessa etapas
  const centro = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const folga = 4;
  const segmentoLivre = (p1, p2, ignorar) => {
    const x1 = Math.min(p1.x, p2.x),
      x2 = Math.max(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y),
      y2 = Math.max(p1.y, p2.y);
    return !nos.some(
      (n) =>
        !ignorar.includes(n) &&
        x1 < n.x + n.w + folga &&
        x2 > n.x - folga &&
        y1 < n.y + n.h + folga &&
        y2 > n.y - folga,
    );
  };
  const rotaLivre = (pts, ignorar) => pts.every((pt, k) => k === 0 || segmentoLivre(pts[k - 1], pt, ignorar));
  const escolher = (candidatas, ignorar) => candidatas.find((r) => rotaLivre(r, ignorar)) ?? candidatas[0];

  const vao = MEDIDAS.coluna - MEDIDAS.atividade.w;
  const canalUsado = new Map();
  /** @type {ArestaPosicionada[]} */
  const arestas = g.arestas.map((a) => {
    const o = no.get(a.origem);
    const d = no.get(a.destino);
    const co = centro(o);
    const cd = centro(d);
    const ignorar = [o, d];
    const ehRetorno = retornos.has(a) || d.x <= o.x;
    let pontos;

    if (ehRetorno) {
      // Retornos: descem até o canal no rodapé da raia mais baixa, andam para a esquerda e sobem
      const ri = Math.max(indiceRaia.get(o.raia) ?? 0, indiceRaia.get(d.raia) ?? 0);
      const cr = caixasRaias[ri];
      const usados = canalUsado.get(ri) ?? 0;
      canalUsado.set(ri, usados + 1);
      const yCanal = cr.y + cr.h - 12 - (usados % 3) * 7;
      const descidas = [
        [
          { x: co.x, y: o.y + o.h },
          { x: co.x, y: yCanal },
        ],
        [
          { x: co.x, y: o.y + o.h },
          { x: co.x, y: o.y + o.h + 14 },
          { x: co.x + MEDIDAS.coluna / 2, y: o.y + o.h + 14 },
          { x: co.x + MEDIDAS.coluna / 2, y: yCanal },
        ],
        [
          { x: o.x + o.w, y: co.y },
          { x: o.x + o.w + vao / 2, y: co.y },
          { x: o.x + o.w + vao / 2, y: yCanal },
        ],
      ];
      const subidas = [
        [
          { x: cd.x, y: yCanal },
          { x: cd.x, y: d.y + d.h },
        ],
        [
          { x: d.x - vao / 2, y: yCanal },
          { x: d.x - vao / 2, y: cd.y },
          { x: d.x, y: cd.y },
        ],
      ];
      pontos = escolher(
        descidas.flatMap((ds) => subidas.map((sb) => [...ds, ...sb])),
        ignorar,
      );
    } else if (Math.abs(co.y - cd.y) < 1) {
      const yCima = Math.min(o.y, d.y) - 16;
      const yBaixo = Math.max(o.y + o.h, d.y + d.h) + 16;
      pontos = escolher(
        [
          [
            { x: o.x + o.w, y: co.y },
            { x: d.x, y: cd.y },
          ],
          [
            { x: co.x, y: o.y },
            { x: co.x, y: yCima },
            { x: cd.x, y: yCima },
            { x: cd.x, y: d.y },
          ],
          [
            { x: co.x, y: o.y + o.h },
            { x: co.x, y: yBaixo },
            { x: cd.x, y: yBaixo },
            { x: cd.x, y: d.y + d.h },
          ],
        ],
        ignorar,
      );
    } else {
      const espaco = Math.min(vao, d.x - o.x - o.w);
      const xCedo = o.x + o.w + espaco / 2;
      const xTarde = d.x - espaco / 2;
      const desce = cd.y > co.y;
      const candidatas = [];
      // Decisões preferem sair por cima/baixo
      if (ehGateway(o.tipo))
        candidatas.push([
          { x: co.x, y: desce ? o.y + o.h : o.y },
          { x: co.x, y: cd.y },
          { x: d.x, y: cd.y },
        ]);
      candidatas.push(
        [
          { x: o.x + o.w, y: co.y },
          { x: xCedo, y: co.y },
          { x: xCedo, y: cd.y },
          { x: d.x, y: cd.y },
        ],
        [
          { x: o.x + o.w, y: co.y },
          { x: xTarde, y: co.y },
          { x: xTarde, y: cd.y },
          { x: d.x, y: cd.y },
        ],
        [
          { x: o.x + o.w, y: co.y },
          { x: cd.x, y: co.y },
          { x: cd.x, y: desce ? d.y : d.y + d.h },
        ],
      );
      if (ehGateway(o.tipo))
        candidatas.push([
          { x: co.x, y: desce ? o.y + o.h : o.y },
          { x: co.x, y: desce ? d.y - 14 : d.y + d.h + 14 },
          { x: cd.x, y: desce ? d.y - 14 : d.y + d.h + 14 },
          { x: cd.x, y: desce ? d.y : d.y + d.h },
        ]);
      pontos = escolher(candidatas, ignorar);
    }
    return {
      ...a,
      pontos: pontos.map((pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) })),
      retorno: ehRetorno,
    };
  });

  // Rotas desenhadas à mão (y relativo ao topo da pool). Se as duas pontas se deslocaram
  // juntas (ex.: uma etapa nova empurrou as colunas), a rota vai junto; se uma ponta se
  // moveu em relação à outra, a rota não serve mais e fica a calculada.
  chavesDasSetas(arestas).forEach((chave, i) => {
    const rota = p.layout.setas?.[chave];
    if (!rota) return;
    const a = arestas[i];
    const co = centro(no.get(a.origem));
    const cd = centro(no.get(a.destino));
    const dx = co.x - rota.de.x;
    const dy = co.y - (rota.de.y + piscina.y);
    const juntas =
      Math.abs(cd.x - rota.para.x - dx) <= TOLERANCIA_ROTA &&
      Math.abs(cd.y - (rota.para.y + piscina.y) - dy) <= TOLERANCIA_ROTA;
    if (!juntas) return;
    arestas[i] = {
      ...a,
      pontos: rota.pontos.map((pt) => ({ x: Math.round(pt.x + dx), y: Math.round(pt.y + piscina.y + dy) })),
      manual: true,
    };
  });

  // Anotações na faixa acima da piscina, perto da etapa ligada
  let xLivre = 0;
  const anotacoes = anotacoesEtapas
    .map((e) => ({ e, alvo: e.anotaEtapa ? no.get(e.anotaEtapa) : undefined }))
    .sort((a, b) => (a.alvo?.x ?? Infinity) - (b.alvo?.x ?? Infinity))
    .map(({ e, alvo }) => {
      // Posição à mão: centro, com y relativo ao topo da pool
      const manual = p.layout.posicoes[e.id];
      if (manual) {
        const caixa = {
          id: e.id,
          x: Math.round(manual.x - MEDIDAS.anotacao.w / 2),
          y: Math.round(piscina.y + manual.y - MEDIDAS.anotacao.h / 2),
          w: MEDIDAS.anotacao.w,
          h: MEDIDAS.anotacao.h,
        };
        return alvo ? { ...caixa, alvo: alvo.id } : caixa;
      }
      const x = Math.max(xLivre, alvo ? alvo.x : xLivre);
      xLivre = x + MEDIDAS.anotacao.w + 15;
      const caixa = { id: e.id, x, y: 15, w: MEDIDAS.anotacao.w, h: MEDIDAS.anotacao.h };
      return alvo ? { ...caixa, alvo: alvo.id } : caixa;
    });
  const larguraFinal = Math.max(largura, xLivre, ...anotacoes.map((a) => a.x + a.w + 15));

  return {
    piscina: { ...piscina, w: larguraFinal },
    raias: caixasRaias.map((r) => ({ ...r, w: larguraFinal - r.x })),
    nos,
    arestas,
    anotacoes,
    largura: larguraFinal,
    altura,
  };
}
/**
 * @typedef {Object} Ponto
 * @property {number} x
 * @property {number} y
 */
/**
 * @typedef {Object} Caixa
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */
/**
 * @typedef {Caixa & NoPosicionadoProprio} NoPosicionado
 */
/**
 * @typedef {Object} NoPosicionadoProprio
 * @property {string} id
 * @property {TipoEtapa} tipo
 * @property {string} raia
 * @property {number} coluna
 */
/**
 * @typedef {Aresta & ArestaPosicionadaPropria} ArestaPosicionada
 */
/**
 * @typedef {Object} ArestaPosicionadaPropria
 * @property {Ponto[]} pontos
 * @property {boolean} retorno
 * @property {boolean} [manual] A rota veio de `layout.setas` (desenhada à mão).
 */
/**
 * @typedef {Object} LayoutCalculado
 * @property {Caixa} piscina
 * @property {(Caixa & { nome: string })[]} raias
 * @property {NoPosicionado[]} nos
 * @property {ArestaPosicionada[]} arestas
 * @property {(Caixa & { id: string; alvo?: string })[]} anotacoes
 * @property {number} largura
 * @property {number} altura
 */
