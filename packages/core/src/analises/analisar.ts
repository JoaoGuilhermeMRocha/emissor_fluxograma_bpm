/**
 * Análises automáticas (ESPECIFICACAO §8): métricas, score de complexidade,
 * checklist de qualidade e recomendações. Limiares e pesos vêm da
 * configuração (§15), com os padrões abaixo.
 */
import { arestasDeRetorno, construirGrafo, inalcancaveis, resumoCaminhos, semCaminhoAteFim, type ResumoCaminhos } from '../grafo/grafo';
import type { Processo } from '../modelo/schema';
import { DEFINICOES, ehAtividade, ehGateway, type TipoEtapa } from '../modelo/tipos';
import { aprovadoresDaEtapa, responsaveisDaEtapa } from '../raci/raci';
import { ordemDasRaias, resolverRaias } from '../regras/raias';
import { limparTexto } from '../util/texto';
import { validar, type Problema } from '../validacao/validar';

export interface ConfigAnalises {
  limiares: { critica: number; alta: number; media: number };
  pesos: { etapa: number; gateway: number; raia: number; retorno: number; handoff: number };
  recomendacoes: { handoffs: number; automacaoMin: number; concentracaoMax: number };
}

export const CONFIG_ANALISES_PADRAO: ConfigAnalises = {
  limiares: { critica: 42, alta: 28, media: 15 },
  pesos: { etapa: 1, gateway: 2, raia: 2, retorno: 3, handoff: 1 },
  recomendacoes: { handoffs: 5, automacaoMin: 40, concentracaoMax: 50 },
};

export type NivelComplexidade = 'Baixa' | 'Média' | 'Alta' | 'Crítica';

export interface Handoff {
  de: string;
  para: string;
  vezes: number;
}

export interface ItemChecklist {
  chave: string;
  rotulo: string;
  ok: boolean;
}

export interface Analise {
  metricas: {
    total: number;
    tarefas: number;
    sistemicas: number;
    subprocessos: number;
    gateways: number;
    gatewaysPorTipo: Partial<Record<TipoEtapa, number>>;
    raias: number;
    retornos: number;
    handoffs: number;
    automacao: number;
  };
  handoffs: Handoff[];
  caminhos: ResumoCaminhos;
  inalcancaveis: string[];
  becos: string[];
  concentracao: { raia: string; atividades: number; percentual: number } | null;
  raci: { semResponsavel: string[]; semAprovador: string[]; variosAprovadores: string[] };
  score: number;
  nivel: NivelComplexidade;
  checklist: ItemChecklist[];
  qualidade: number;
  recomendacoes: string[];
  problemas: Problema[];
}

export function nivelDoScore(score: number, cfg: ConfigAnalises = CONFIG_ANALISES_PADRAO): NivelComplexidade {
  if (score >= cfg.limiares.critica) return 'Crítica';
  if (score >= cfg.limiares.alta) return 'Alta';
  if (score >= cfg.limiares.media) return 'Média';
  return 'Baixa';
}

export function analisar(p: Processo, cfg: ConfigAnalises = CONFIG_ANALISES_PADRAO): Analise {
  const fluxo = p.etapas.filter((e) => e.tipo !== 'anotacao');
  const conta = (t: TipoEtapa) => fluxo.filter((e) => e.tipo === t).length;

  const gatewaysPorTipo: Partial<Record<TipoEtapa, number>> = {};
  for (const e of fluxo) if (ehGateway(e.tipo)) gatewaysPorTipo[e.tipo] = (gatewaysPorTipo[e.tipo] ?? 0) + 1;
  const gateways = Object.values(gatewaysPorTipo).reduce((a, b) => a + b, 0);

  const raias = resolverRaias(p);
  const g = construirGrafo(p);

  const contagemHandoffs = new Map<string, Handoff>();
  for (const a of g.arestas) {
    const de = raias.get(a.origem)!;
    const para = raias.get(a.destino)!;
    if (de === para) continue;
    const chave = `${de}\u0000${para}`;
    const h = contagemHandoffs.get(chave) ?? { de, para, vezes: 0 };
    h.vezes++;
    contagemHandoffs.set(chave, h);
  }
  const handoffs = [...contagemHandoffs.values()].sort((a, b) => b.vezes - a.vezes);
  const totalHandoffs = handoffs.reduce((s, h) => s + h.vezes, 0);

  const tarefas = conta('tarefa');
  const sistemicas = conta('sistema');
  const automacao = tarefas + sistemicas ? Math.round((sistemicas / (tarefas + sistemicas)) * 100) : 0;
  const retornos = arestasDeRetorno(g).length;
  const qtdRaias = ordemDasRaias(p, raias).length;

  const metricas = {
    total: fluxo.length,
    tarefas,
    sistemicas,
    subprocessos: conta('subprocesso'),
    gateways,
    gatewaysPorTipo,
    raias: qtdRaias,
    retornos,
    handoffs: totalHandoffs,
    automacao,
  };

  const atividades = fluxo.filter((e) => ehAtividade(e.tipo));
  let concentracao: Analise['concentracao'] = null;
  if (atividades.length) {
    const porRaia = new Map<string, number>();
    for (const e of atividades) porRaia.set(raias.get(e.id)!, (porRaia.get(raias.get(e.id)!) ?? 0) + 1);
    const [raia, qtd] = [...porRaia.entries()].sort((a, b) => b[1] - a[1])[0]!;
    concentracao = { raia, atividades: qtd, percentual: Math.round((qtd / atividades.length) * 100) };
  }

  const raci = {
    semResponsavel: atividades.filter((e) => responsaveisDaEtapa(p, e).length === 0).map((e) => e.id),
    semAprovador: atividades.filter((e) => aprovadoresDaEtapa(p, e).length === 0).map((e) => e.id),
    variosAprovadores: fluxo.filter((e) => aprovadoresDaEtapa(p, e).length > 1).map((e) => e.id),
  };

  const w = cfg.pesos;
  const score =
    metricas.total * w.etapa + gateways * w.gateway + qtdRaias * w.raia + retornos * w.retorno + totalHandoffs * w.handoff;

  const problemas = validar(p);
  const tem = (...codigos: string[]) => problemas.some((x) => codigos.includes(x.codigo));

  const checklist: ItemChecklist[] = [
    { chave: 'inicio', rotulo: 'Evento de início único', ok: !tem('V01', 'V02') },
    { chave: 'fim', rotulo: 'Evento de fim', ok: !tem('V03') },
    { chave: 'atores', rotulo: 'Responsáveis preenchidos', ok: !tem('V05') },
    { chave: 'gateways', rotulo: 'Decisões e gateways completos', ok: !tem('V08', 'V09') },
    { chave: 'saidas', rotulo: 'Todas as etapas com destino', ok: !tem('V06', 'V17') },
    { chave: 'referencias', rotulo: 'Referências válidas', ok: !tem('V07', 'V14') },
    { chave: 'raci', rotulo: 'Matriz RACI revisada', ok: p.raci.revisada },
    { chave: 'parecer', rotulo: 'Parecer preenchido', ok: limparTexto(p.parecer.texto) !== '' },
  ];
  const qualidade = Math.round((checklist.filter((c) => c.ok).length / checklist.length) * 100);

  const r = cfg.recomendacoes;
  const recomendacoes: string[] = [];
  if (tem('V05')) recomendacoes.push('Completar os responsáveis das etapas');
  if (tem('V08', 'V09')) recomendacoes.push('Completar as saídas e os rótulos das decisões e gateways');
  if (totalHandoffs >= r.handoffs) recomendacoes.push('Padronizar entradas e saídas entre áreas');
  if (retornos > 0) recomendacoes.push('Analisar causas dos retornos para reduzir retrabalho');
  if (tarefas + sistemicas > 0 && automacao < r.automacaoMin) recomendacoes.push('Avaliar automação de atividades repetitivas');
  if (concentracao && atividades.length >= 3 && concentracao.percentual > r.concentracaoMax) {
    recomendacoes.push(`Avaliar a distribuição de atividades (${concentracao.raia} concentra ${concentracao.percentual}%)`);
  }
  if (!p.raci.revisada) recomendacoes.push('Gerar e revisar a Matriz RACI');

  return {
    metricas,
    handoffs,
    caminhos: resumoCaminhos(g),
    inalcancaveis: inalcancaveis(g),
    becos: semCaminhoAteFim(g),
    concentracao,
    raci,
    score,
    nivel: nivelDoScore(score, cfg),
    checklist,
    qualidade,
    recomendacoes,
    problemas,
  };
}

/** Rótulos legíveis dos tipos de gateway contados, para o painel. */
export const rotuloTipo = (t: TipoEtapa): string => DEFINICOES[t].rotulo;
