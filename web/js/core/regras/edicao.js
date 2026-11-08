/** @import { Etapa, Processo, Saida } from '../modelo/schema.js' */
/** @import { TipoEtapa } from '../modelo/tipos.js' */
/**
 * Operações de edição do processo. Todas são puras: recebem um processo e
 * devolvem outro, sem alterar o original. Não mexem em `revisao` nem em
 * `alteradoEm`, que são responsabilidade da camada de armazenamento.
 */
import { proximoIdEtapa } from '../modelo/fabrica.js';
import { DEFINICOES } from '../modelo/tipos.js';
import { limparTexto } from '../util/texto.js';
import { canonizarAtor } from './atores.js';

/** @extends Error */
export class ErroEdicao extends Error {
  /** @default "ErroEdicao" */
  name = 'ErroEdicao';
}

/**
 * @template T
 * @param {T} v
 * @returns {T}
 */
const clonar = (v) => structuredClone(v);

/**
 * @param {Processo} p
 * @param {string} id
 * @returns {Etapa}
 */
function buscar(p, id) {
  const e = p.etapas.find((x) => x.id === id);
  if (!e) throw new ErroEdicao(`Etapa ${id} não existe`);
  return e;
}

/**
 * Saídas iniciais de um tipo novo: decisões já nascem com SIM e NÃO.
 * @param {TipoEtapa} tipo
 * @returns {Saida[]}
 */
export function saidasIniciais(tipo) {
  if (tipo === 'gw_exclusivo')
    return [
      { destino: '', rotulo: 'SIM' },
      { destino: '', rotulo: 'NÃO' },
    ];
  const def = DEFINICOES[tipo];
  return Array.from({ length: def.saidasMin }, () => ({ destino: '' }));
}

/**
 * Aplica limpeza de texto, canonização de ator e remove campos que não cabem no tipo.
 * @param {Processo} p
 * @param {Etapa} e
 * @returns {Etapa}
 */
export function normalizarCampos(p, e) {
  const r = {
    ...e,
    descricao: limparTexto(e.descricao),
    saidas: e.saidas.map((s) => {
      const rotulo = limparTexto(s.rotulo);
      return rotulo ? { destino: s.destino, rotulo } : { destino: s.destino };
    }),
  };
  const ator = DEFINICOES[e.tipo].ator === 'nenhum' ? '' : canonizarAtor(p, e.ator);
  if (ator) r.ator = ator;
  else delete r.ator;
  const apoio = limparTexto(e.apoio);
  if (apoio) r.apoio = apoio;
  else delete r.apoio;

  if (e.tipo !== 'fim') delete r.resultado;
  else r.resultado ??= 'Finalizado';
  if (e.tipo !== 'gw_complexo') delete r.regra;
  if (e.tipo !== 'intermediario') delete r.evento;
  else r.evento ??= 'captura';
  if (e.tipo !== 'anotacao') delete r.anotaEtapa;
  return r;
}

/**
 * Adiciona uma etapa no fim da lista ou logo depois de `depoisDe`.
 * @param {Processo} p
 * @param {DadosEtapa} dados
 * @param {{ depoisDe?: string }} [opcoes={}]
 * @returns {{ processo: Processo; id: string }}
 */
export function adicionarEtapa(p, dados, opcoes = {}) {
  const novo = clonar(p);
  const id = proximoIdEtapa(novo.etapas);
  const etapa = normalizarCampos(novo, {
    ...dados,
    id,
    descricao: dados.descricao ?? '',
    saidas: dados.saidas ?? saidasIniciais(dados.tipo),
  });
  const pos = opcoes.depoisDe ? novo.etapas.findIndex((e) => e.id === opcoes.depoisDe) : -1;
  if (opcoes.depoisDe && pos < 0) throw new ErroEdicao(`Etapa ${opcoes.depoisDe} não existe`);
  if (pos >= 0) novo.etapas.splice(pos + 1, 0, etapa);
  else novo.etapas.push(etapa);
  return { processo: novo, id };
}

/**
 * Atualiza campos de uma etapa. O tipo só muda por `trocarTipo`.
 * @param {Processo} p
 * @param {string} id
 * @param {Partial<Omit<Etapa, 'id' | 'tipo'>>} campos
 * @returns {Processo}
 */
export function atualizarEtapa(p, id, campos) {
  const novo = clonar(p);
  const i = novo.etapas.findIndex((e) => e.id === id);
  const atual = novo.etapas[i];
  if (!atual) throw new ErroEdicao(`Etapa ${id} não existe`);
  novo.etapas[i] = normalizarCampos(novo, { ...atual, ...campos, id: atual.id, tipo: atual.tipo });
  return novo;
}

/**
 * Troca o tipo entre tipos da mesma família (ESPECIFICACAO RF-05).
 * Saídas excedentes são mantidas e a validação aponta o excesso.
 * @param {Processo} p
 * @param {string} id
 * @param {TipoEtapa} novoTipo
 * @returns {Processo}
 */
export function trocarTipo(p, id, novoTipo) {
  const atual = buscar(p, id);
  if (DEFINICOES[atual.tipo].familia !== DEFINICOES[novoTipo].familia) {
    throw new ErroEdicao(
      `Não é possível trocar "${DEFINICOES[atual.tipo].rotulo}" por "${DEFINICOES[novoTipo].rotulo}"`,
    );
  }
  const novo = clonar(p);
  const i = novo.etapas.findIndex((e) => e.id === id);
  const etapa = { ...atual, tipo: novoTipo, saidas: [...atual.saidas] };
  while (etapa.saidas.length < DEFINICOES[novoTipo].saidasMin) etapa.saidas.push({ destino: '' });
  novo.etapas[i] = normalizarCampos(novo, etapa);
  return novo;
}

/**
 * Exclui uma etapa e todas as referências a ela (ESPECIFICACAO §5.3):
 * saídas que apontavam para ela ficam sem destino (rótulos preservados),
 * RACI e posição manual são removidas e anotações ligadas ficam soltas.
 * @param {Processo} p
 * @param {string} id
 * @returns {Processo}
 */
export function excluirEtapa(p, id) {
  buscar(p, id);
  const novo = clonar(p);
  novo.etapas = novo.etapas
    .filter((e) => e.id !== id)
    .map((e) => {
      const saidas = e.saidas.map((s) => (s.destino === id ? { ...s, destino: '' } : s));
      const r = { ...e, saidas };
      if (r.anotaEtapa === id) delete r.anotaEtapa;
      return r;
    });
  delete novo.raci.porEtapa[id];
  delete novo.layout.posicoes[id];
  return novo;
}

/**
 * Liga cada etapa de saída única sem destino à próxima da lista (ignorando anotações).
 * @param {Processo} p
 * @returns {Processo}
 */
export function ligarEmSequencia(p) {
  const novo = clonar(p);
  const fluxo = novo.etapas.filter((e) => e.tipo !== 'anotacao');
  fluxo.forEach((e, i) => {
    const prox = fluxo[i + 1];
    if (!prox || DEFINICOES[e.tipo].saidasMax !== 1) return;
    if (e.saidas.some((s) => s.destino)) return;
    e.saidas = [{ destino: prox.id }];
  });
  return novo;
}

/**
 * Insere uma etapa entre `origemId` e `destinoId` (ESPECIFICACAO RF-08):
 * a saída da origem passa a apontar para a etapa nova, que aponta para o destino.
 * @param {Processo} p
 * @param {string} origemId
 * @param {string} destinoId
 * @param {DadosEtapa} dados
 * @returns {{ processo: Processo; id: string }}
 */
export function inserirEntre(p, origemId, destinoId, dados) {
  const origem = buscar(p, origemId);
  buscar(p, destinoId);
  const iSaida = origem.saidas.findIndex((s) => s.destino === destinoId);
  if (iSaida < 0) throw new ErroEdicao(`${origemId} não está ligada a ${destinoId}`);
  if (DEFINICOES[dados.tipo].saidasMax === 0) {
    throw new ErroEdicao(
      `"${DEFINICOES[dados.tipo].rotulo}" não tem saída e não pode ficar no meio do fluxo`,
    );
  }

  const saidas = saidasIniciais(dados.tipo);
  if (saidas[0]) saidas[0] = { ...saidas[0], destino: destinoId };
  else saidas.push({ destino: destinoId });

  const { processo, id } = adicionarEtapa(p, { ...dados, saidas }, { depoisDe: origemId });
  const o = processo.etapas.find((e) => e.id === origemId);
  o.saidas = o.saidas.map((s, i) => (i === iSaida ? { ...s, destino: id } : s));
  return { processo, id };
}
/** @typedef {Partial<Omit<Etapa, 'id' | 'tipo'>> & { tipo: TipoEtapa }} DadosEtapa */
