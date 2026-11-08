/** @import { Etapa, Processo, Saida } from '../modelo/schema.js' */
/** @import { LayoutCalculado } from '../layout/layout.js' */
/** @import { GrafoImportado, NoImportado } from '../importacao/grafo-importado.js' */
/**
 * "Um modelo, duas visões" (ESPECIFICACAO §6.1): aplica ao processo o que o
 * usuário fez no editor de diagrama.
 *
 * O editor trabalha sobre o BPMN gerado pelo próprio sistema. Depois de cada
 * alteração, o BPMN do editor é lido de volta (importador BPMN) e mesclado
 * aqui. O modelo continua sendo a fonte da verdade: campos que o diagrama
 * não mostra (apoio, RACI, resultado, regra…) são preservados.
 *
 * O que se traduz:
 * - criar etapa → etapa nova com o próximo id (E10…), logo depois de quem aponta para ela;
 * - excluir → exclusão segura (limpa RACI, posições e referências);
 * - renomear → descrição; renomear a pool → nome do processo;
 * - ligar/religar/desligar setas → saídas (ordem e destinos pendentes preservados);
 * - arrastar para outra raia → responsável; renomear raia → responsável de todas as suas etapas;
 * - arrastar dentro da raia → posição manual;
 * - soltar ou mover anotação → posição manual da anotação;
 * - dobrar ou rearrumar seta → rota manual (vale enquanto as pontas não mudarem de lugar);
 * - trocar o tipo (menu do editor) → tipo, com os campos ajustados.
 */
import { proximoIdEtapa } from '../modelo/fabrica.js';
import { DEFINICOES } from '../modelo/tipos.js';
import { normalizarCampos, excluirEtapa } from '../regras/edicao.js';
import { resolverRaias, simplificarAtoresDeEventos } from '../regras/raias.js';
import { limparTexto } from '../util/texto.js';
import { FORMA_PARA_TIPO, padronizarRotulo } from '../importacao/normalizar.js';
import { chavesDasSetas } from '../layout/layout.js';

/**
 * Diferença mínima (px) para considerar que a etapa foi arrastada.
 * @type {3}
 */
const TOLERANCIA_MOVIMENTO = 3;

/**
 * @param {NoImportado} n
 * @returns {Etapa['tipo']}
 */
function tipoDoNo(n) {
  if (n.forma === 'intermediario' && n.extras?.link === 'true') return 'link';
  return FORMA_PARA_TIPO[n.forma];
}

/**
 * @param {Processo} p
 * @param {GrafoImportado} g
 * @param {LayoutCalculado} layoutAnterior
 * @returns {Processo}
 */
export function mesclarDoDiagrama(p, g, layoutAnterior) {
  const idsNoDiagrama = new Set(g.nos.map((n) => n.id));

  // 1. Exclusões, com a limpeza de referências do núcleo
  let base = p;
  for (const e of p.etapas) if (!idsNoDiagrama.has(e.id)) base = excluirEtapa(base, e.id);
  const novo = structuredClone(base);
  const raiasAntes = resolverRaias(novo);

  // 2. Ids: existentes mantêm; novos recebem o próximo E##
  const idFinal = new Map();
  const existentes = new Map(novo.etapas.map((e) => [e.id, e]));
  /** @type {Pick<Etapa, 'id'>[]} */
  const reservados = [...novo.etapas];
  for (const n of g.nos) {
    if (existentes.has(n.id)) idFinal.set(n.id, n.id);
    else {
      const id = proximoIdEtapa(reservados);
      reservados.push({ id });
      idFinal.set(n.id, id);
    }
  }

  const nomeRaia = new Map(g.raias.map((r) => [r.id, limparTexto(r.nome)]));
  const arestasDe = new Map();
  for (const a of g.arestas) {
    if (!idFinal.has(a.origem) || !idFinal.has(a.destino)) continue;
    arestasDe.set(a.origem, [...(arestasDe.get(a.origem) ?? []), a]);
  }
  const alvoAnotacao = new Map(g.associacoes.map((a) => [a.anotacao, a.alvo]));

  // 3. Etapas
  /** @type {(n: NoImportado) => Etapa} */
  const etapaDoNo = (n) => {
    const id = idFinal.get(n.id);
    const anterior = existentes.get(id);
    const tipo = tipoDoNo(n);
    /** @type {Etapa} */
    const e = anterior ? { ...anterior, tipo } : { id, tipo, descricao: '', saidas: [] };
    e.descricao = limparTexto(n.rotulo);
    if (tipo === 'intermediario')
      e.evento =
        n.extras?.evento === 'disparo'
          ? 'disparo'
          : anterior?.tipo === 'intermediario'
            ? anterior.evento
            : 'captura';

    // Responsável pela raia: só muda se a raia do diagrama for diferente da que a etapa já tinha
    const raia = n.raiaId ? nomeRaia.get(n.raiaId) : undefined;
    if (raia && DEFINICOES[tipo].ator !== 'nenhum' && raia !== raiasAntes.get(id)) e.ator = raia;

    // Saídas: preserva ordem, rótulos de pendentes e destinos vazios; acrescenta as novas
    if (tipo === 'anotacao') {
      e.saidas = [];
      const alvo = alvoAnotacao.get(n.id);
      if (alvo && idFinal.has(alvo)) e.anotaEtapa = idFinal.get(alvo);
      else delete e.anotaEtapa;
    } else {
      const restantes = [...(arestasDe.get(n.id) ?? [])];
      const rotular = (r) => (DEFINICOES[tipo].saidasRotuladas ? padronizarRotulo(r) : limparTexto(r));
      const saidas = [];
      for (const s of anterior?.saidas ?? []) {
        if (!s.destino) {
          saidas.push(s);
          continue;
        }
        const k = restantes.findIndex((a) => idFinal.get(a.destino) === s.destino);
        if (k < 0) continue; // seta removida no diagrama
        const [a] = restantes.splice(k, 1);
        const rotulo = rotular(a.rotulo);
        saidas.push(rotulo ? { destino: s.destino, rotulo } : { destino: s.destino });
      }
      for (const a of restantes) {
        const rotulo = rotular(a.rotulo);
        const destino = idFinal.get(a.destino);
        // preenche primeiro uma saída pendente (ex.: "NÃO" sem destino)
        const pendente = saidas.findIndex((s) => !s.destino && (!rotulo || !s.rotulo || s.rotulo === rotulo));
        const r = pendente >= 0 ? rotulo || saidas[pendente].rotulo : rotulo;
        const saida = r ? { destino, rotulo: r } : { destino };
        if (pendente >= 0) saidas[pendente] = saida;
        else saidas.push(saida);
      }
      e.saidas = saidas;
    }
    return normalizarCampos(novo, e);
  };

  const porIdFinal = new Map(g.nos.map((n) => [idFinal.get(n.id), etapaDoNo(n)]));

  // Ordem: a da lista atual; etapas novas logo depois de quem aponta para elas (ou no fim)
  const ordem = novo.etapas.map((e) => e.id).filter((id) => porIdFinal.has(id));
  for (const n of g.nos) {
    const id = idFinal.get(n.id);
    if (ordem.includes(id)) continue;
    const origem = g.arestas.find((a) => a.destino === n.id && ordem.includes(idFinal.get(a.origem) ?? ''));
    const pos = origem ? ordem.indexOf(idFinal.get(origem.origem)) + 1 : ordem.length;
    ordem.splice(pos, 0, id);
  }
  novo.etapas = ordem.map((id) => porIdFinal.get(id));
  simplificarAtoresDeEventos(novo);

  // 4. Nome do processo pela pool
  if (limparTexto(g.titulo)) novo.nome = limparTexto(g.titulo);

  // 5. Posições manuais das etapas arrastadas (centro; y relativo ao topo da raia)
  const anterior = new Map(layoutAnterior.nos.map((n) => [n.id, n]));
  const raiasDepois = resolverRaias(novo);
  for (const n of g.nos) {
    const id = idFinal.get(n.id);
    const antes = anterior.get(id);
    if (!antes || !n.caixa || !existentes.has(id)) continue;
    const cx = n.caixa.x + n.caixa.w / 2;
    const cy = n.caixa.y + n.caixa.h / 2;
    const moveu =
      Math.abs(cx - (antes.x + antes.w / 2)) > TOLERANCIA_MOVIMENTO ||
      Math.abs(cy - (antes.y + antes.h / 2)) > TOLERANCIA_MOVIMENTO;
    if (!moveu) continue;
    const raia =
      layoutAnterior.raias.find((r) => r.nome === (raiasDepois.get(id) ?? '')) ??
      layoutAnterior.raias.find((r) => cy >= r.y && cy <= r.y + r.h);
    if (raia) novo.layout.posicoes[id] = { x: Math.round(cx), y: Math.round(cy - raia.y) };
  }

  const topoPool = layoutAnterior.piscina.y;
  const centroDe = (/** @type {{ x: number, y: number, w: number, h: number }} */ c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
  const relativo = (/** @type {{ x: number, y: number }} */ pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y - topoPool) });

  // 6. Anotações soltas ou movidas: ficam onde estão (centro; y relativo ao topo da pool)
  const anotacaoAntes = new Map(layoutAnterior.anotacoes.map((a) => [a.id, a]));
  for (const n of g.nos) {
    if (n.forma !== 'anotacao' || !n.caixa) continue;
    const id = idFinal.get(n.id);
    const antes = anotacaoAntes.get(id);
    const c = centroDe(n.caixa);
    if (antes) {
      const ca = centroDe(antes);
      if (Math.abs(c.x - ca.x) <= TOLERANCIA_MOVIMENTO && Math.abs(c.y - ca.y) <= TOLERANCIA_MOVIMENTO) continue;
    }
    novo.layout.posicoes[id] = relativo(c);
  }

  // 7. Setas desenhadas à mão: guarda a rota de toda seta cujo trajeto difere do calculado
  const caixaDe = new Map(g.nos.filter((n) => n.caixa).map((n) => [idFinal.get(n.id), n.caixa]));
  const calculadas = new Map();
  chavesDasSetas(layoutAnterior.arestas).forEach((k, i) => calculadas.set(k, layoutAnterior.arestas[i]));
  const setas = g.arestas
    .filter((a) => idFinal.has(a.origem) && idFinal.has(a.destino))
    .map((a) => ({ ...a, origem: idFinal.get(a.origem), destino: idFinal.get(a.destino) }));
  /** @type {Processo['layout']['setas']} */
  const rotas = {};
  chavesDasSetas(setas).forEach((k, i) => {
    const a = setas[i];
    if (!a.pontos) return;
    const antes = calculadas.get(k);
    const igual =
      antes &&
      antes.pontos.length === a.pontos.length &&
      antes.pontos.every((pt, j) => Math.abs(pt.x - a.pontos[j].x) <= 2 && Math.abs(pt.y - a.pontos[j].y) <= 2);
    if (igual) {
      // não mexeu: continua manual só se já era
      if (antes.manual && novo.layout.setas?.[k]) rotas[k] = novo.layout.setas[k];
      return;
    }
    const o = caixaDe.get(a.origem);
    const d = caixaDe.get(a.destino);
    if (!o || !d) return;
    rotas[k] = { pontos: a.pontos.map(relativo), de: relativo(centroDe(o)), para: relativo(centroDe(d)) };
  });
  novo.layout.setas = rotas;

  return novo;
}
