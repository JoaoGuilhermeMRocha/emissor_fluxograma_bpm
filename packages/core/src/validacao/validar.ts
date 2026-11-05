/**
 * Validação ao vivo (ESPECIFICACAO §7). Roda a cada alteração e alimenta o
 * painel de problemas. Cada problema aponta a etapa, quando houver.
 */
import { construirGrafo, inalcancaveis, semCaminhoAteFim } from '../grafo/grafo';
import type { Processo } from '../modelo/schema';
import { DEFINICOES, ehAtividade } from '../modelo/tipos';
import { aprovadoresDaEtapa, responsaveisDaEtapa } from '../raci/raci';
import { limparTexto } from '../util/texto';

export type Severidade = 'erro' | 'aviso' | 'info';

export type CodigoProblema =
  | 'V01' | 'V02' | 'V03' | 'V04' | 'V05' | 'V06' | 'V07' | 'V08'
  | 'V09' | 'V10' | 'V11' | 'V12' | 'V13' | 'V14' | 'V15' | 'V16' | 'V17' | 'V18';

export interface Problema {
  codigo: CodigoProblema;
  severidade: Severidade;
  mensagem: string;
  etapa?: string;
}

export const SEVERIDADE: Record<CodigoProblema, Severidade> = {
  V01: 'erro', V02: 'erro', V03: 'erro', V04: 'erro', V05: 'erro', V06: 'erro', V07: 'erro',
  V08: 'erro', V09: 'aviso', V10: 'aviso', V11: 'aviso', V12: 'aviso', V13: 'aviso',
  V14: 'aviso', V15: 'aviso', V16: 'info', V17: 'erro', V18: 'aviso',
};

const ORDEM_SEVERIDADE: Record<Severidade, number> = { erro: 0, aviso: 1, info: 2 };

export function validar(p: Processo): Problema[] {
  const problemas: Problema[] = [];
  const add = (codigo: CodigoProblema, mensagem: string, etapa?: string) =>
    problemas.push(etapa ? { codigo, severidade: SEVERIDADE[codigo], mensagem, etapa } : { codigo, severidade: SEVERIDADE[codigo], mensagem });

  const ids = new Set<string>();
  const duplicados = new Set<string>();
  for (const e of p.etapas) (ids.has(e.id) ? duplicados : ids).add(e.id);
  for (const id of duplicados) add('V14', `Id ${id} aparece mais de uma vez`, id);

  const entradas = new Map<string, number>();
  for (const e of p.etapas) {
    for (const s of e.saidas) if (s.destino) entradas.set(s.destino, (entradas.get(s.destino) ?? 0) + 1);
  }

  const inicios = p.etapas.filter((e) => e.tipo === 'inicio');
  if (inicios.length === 0) add('V01', 'O processo não tem evento de início');
  for (const extra of inicios.slice(1)) add('V02', 'Só pode existir um evento de início', extra.id);
  if (!p.etapas.some((e) => e.tipo === 'fim')) add('V03', 'O processo não tem evento de fim');

  for (const e of p.etapas) {
    const def = DEFINICOES[e.tipo];
    if (!limparTexto(e.descricao)) add('V04', `${e.id} está sem descrição`, e.id);
    if (def.ator === 'obrigatorio' && !limparTexto(e.ator)) add('V05', `${e.id} (${def.rotulo}) está sem responsável`, e.id);

    if (e.tipo === 'anotacao') {
      if (!e.anotaEtapa || !ids.has(e.anotaEtapa)) add('V13', `Anotação ${e.id} não está ligada a nenhuma etapa`, e.id);
      continue;
    }

    const preenchidas = e.saidas.filter((s) => s.destino);
    for (const s of preenchidas) {
      if (!ids.has(s.destino)) add('V07', `${e.id} aponta para ${s.destino}, que não existe`, e.id);
    }

    if (def.familia === 'gateway') {
      // Gateway convergente (junta ramos): várias entradas e uma saída é BPMN válido.
      const convergente = preenchidas.length === 1 && (entradas.get(e.id) ?? 0) >= 2;
      if (convergente) {
        // nada a validar quanto a mínimo de saídas e rótulos
      } else if (preenchidas.length < def.saidasMin) {
        add('V08', `${e.id} precisa de pelo menos ${def.saidasMin} ${def.saidasMin === 1 ? 'saída' : 'saídas'} (tem ${preenchidas.length})`, e.id);
      }
      if (!convergente && def.saidasRotuladas && e.saidas.some((s) => !limparTexto(s.rotulo))) {
        add('V09', `${e.id} tem saída sem rótulo`, e.id);
      }
    } else if (def.saidasMin > 0 && preenchidas.length === 0) {
      add('V06', `${e.id} está sem destino`, e.id);
    }

    if (preenchidas.length > def.saidasMax) {
      add('V17', def.saidasMax === 0
        ? `${e.id} (${def.rotulo}) não pode ter saída`
        : `${e.id} (${def.rotulo}) só pode ter ${def.saidasMax} saída (tem ${preenchidas.length})`, e.id);
    }

    const repetidos = preenchidas.map((s) => s.destino).filter((d, i, todos) => todos.indexOf(d) !== i);
    for (const d of new Set(repetidos)) add('V18', `${e.id} tem mais de uma saída para ${d}`, e.id);

    if (e.tipo === 'gw_evento') {
      for (const s of preenchidas) {
        const alvo = p.etapas.find((x) => x.id === s.destino);
        if (alvo && !['intermediario', 'tarefa', 'sistema'].includes(alvo.tipo)) {
          add('V12', `Depois do gateway baseado em eventos ${e.id}, ${alvo.id} deveria ser um evento intermediário ou uma tarefa`, e.id);
        }
      }
    }

    if (ehAtividade(e.tipo)) {
      if (responsaveisDaEtapa(p, e).length === 0) add('V15', `${e.id} não tem Responsável (R) na RACI`, e.id);
      if (aprovadoresDaEtapa(p, e).length === 0) add('V16', `${e.id} não tem Aprovador (A) definido na RACI`, e.id);
    }
  }

  if (!duplicados.size) {
    const g = construirGrafo(p);
    for (const id of inalcancaveis(g)) add('V10', `${id} nunca é alcançada a partir do início`, id);
    for (const id of semCaminhoAteFim(g)) add('V11', `De ${id} não há caminho até um evento de fim`, id);
  }

  return problemas.sort(
    (a, b) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade] || a.codigo.localeCompare(b.codigo),
  );
}

export const temErros = (problemas: readonly Problema[]): boolean => problemas.some((x) => x.severidade === 'erro');
