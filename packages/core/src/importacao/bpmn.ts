/// <reference path="../modulos-externos.d.ts" />
/**
 * Importador BPMN 2.0 XML (ESPECIFICACAO §11.5, prioridade A).
 * Lê arquivos do bpmn.io, Camunda, Bizagi, Signavio, ARIS e do próprio
 * sistema. Gera um Grafo Intermediário por pool (ou um só, sem pools).
 */
import { BpmnModdle, type ElementoModdle } from 'bpmn-moddle';
import type { ArestaImportada, CaixaImportada, FormaImportada, GrafoImportado, Importador, NoImportado } from './grafo-importado';

const NS_BPMN = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

const FORMAS: Record<string, FormaImportada> = {
  'bpmn:StartEvent': 'inicio',
  'bpmn:EndEvent': 'fim',
  'bpmn:Task': 'tarefa',
  'bpmn:UserTask': 'tarefa',
  'bpmn:ManualTask': 'tarefa',
  'bpmn:SendTask': 'tarefa',
  'bpmn:ReceiveTask': 'tarefa',
  'bpmn:ServiceTask': 'sistema',
  'bpmn:ScriptTask': 'sistema',
  'bpmn:BusinessRuleTask': 'sistema',
  'bpmn:SubProcess': 'subprocesso',
  'bpmn:AdHocSubProcess': 'subprocesso',
  'bpmn:Transaction': 'subprocesso',
  'bpmn:CallActivity': 'subprocesso',
  'bpmn:ExclusiveGateway': 'decisao',
  'bpmn:ParallelGateway': 'paralelo',
  'bpmn:InclusiveGateway': 'inclusivo',
  'bpmn:ComplexGateway': 'complexo',
  'bpmn:EventBasedGateway': 'evento_gw',
  'bpmn:IntermediateCatchEvent': 'intermediario',
  'bpmn:IntermediateThrowEvent': 'intermediario',
  'bpmn:BoundaryEvent': 'intermediario',
};

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

const contar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

/** Lê "Apoio: …", "Regra: …" e "Resultado: …" da documentação (formato que o próprio sistema exporta). */
function extrasDaDocumentacao(el: ElementoModdle): Record<string, string> {
  const doc = ((el.documentation ?? []) as ElementoModdle[]).map((d) => texto(d.text)).join('\n').trim();
  if (!doc) return {};
  const extras: Record<string, string> = {};
  const livres: string[] = [];
  for (const linha of doc.split(/\r?\n/)) {
    const m = /^(Apoio|Regra|Resultado):\s*(.*)$/i.exec(linha.trim());
    if (m) extras[m[1]!.toLowerCase() === 'regra' ? 'documentacao' : m[1]!.toLowerCase()] = m[2]!;
    else if (linha.trim()) livres.push(linha.trim());
  }
  if (livres.length) extras.documentacao = [extras.documentacao, ...livres].filter(Boolean).join(' ');
  return extras;
}

/** Raias folha (lanes aninhadas viram "Pai / Filho"). */
function raiasFolha(lanes: ElementoModdle[], prefixo = ''): { lane: ElementoModdle; nome: string }[] {
  return lanes.flatMap((l) => {
    const nome = [prefixo, texto(l.name).trim()].filter(Boolean).join(' / ');
    const filhas = (l.childLaneSet?.lanes ?? []) as ElementoModdle[];
    return filhas.length ? raiasFolha(filhas, nome) : [{ lane: l, nome }];
  });
}

function grafoDoProcesso(
  processo: ElementoModdle,
  titulo: string,
  caixas: Map<string, CaixaImportada>,
): GrafoImportado {
  const g: GrafoImportado = { titulo, raias: [], nos: [], arestas: [], associacoes: [], avisos: [], perdas: [] };

  const raiaDoNo = new Map<string, string>();
  raiasFolha(((processo.laneSets ?? []) as ElementoModdle[]).flatMap((ls) => (ls.lanes ?? []) as ElementoModdle[])).forEach(
    ({ lane, nome }, ordem) => {
      const raia: GrafoImportado['raias'][number] = { id: lane.id!, nome: nome || `Raia ${ordem + 1}`, ordem };
      const caixaRaia = caixas.get(lane.id!);
      if (caixaRaia) raia.caixa = caixaRaia;
      g.raias.push(raia);
      for (const ref of (lane.flowNodeRef ?? []) as ElementoModdle[]) raiaDoNo.set(ref.id!, lane.id!);
    },
  );

  const ignorados = new Map<string, number>();
  const anotaIgnorado = (rotulo: string) => ignorados.set(rotulo, (ignorados.get(rotulo) ?? 0) + 1);
  const bordas: { evento: string; atividade: string }[] = [];

  for (const el of (processo.flowElements ?? []) as ElementoModdle[]) {
    const forma = FORMAS[el.$type];
    if (forma) {
      const no: NoImportado = { id: el.id!, rotulo: texto(el.name), forma, extras: { tipoOriginal: el.$type.replace('bpmn:', ''), ...extrasDaDocumentacao(el) } };
      const raia = raiaDoNo.get(el.id!);
      if (raia) no.raiaId = raia;
      const caixa = caixas.get(el.id!);
      if (caixa) no.caixa = caixa;
      const defs = (el.eventDefinitions ?? []) as ElementoModdle[];
      if (defs.some((d) => d.$type === 'bpmn:LinkEventDefinition')) no.extras!.link = 'true';
      if (el.$type === 'bpmn:IntermediateThrowEvent') no.extras!.evento = 'disparo';
      if (el.$type === 'bpmn:BoundaryEvent' && el.attachedToRef) bordas.push({ evento: el.id!, atividade: el.attachedToRef.id });
      if ((el.$type === 'bpmn:SubProcess' || el.$type === 'bpmn:Transaction' || el.$type === 'bpmn:AdHocSubProcess') && (el.flowElements ?? []).length) {
        g.perdas.push(`Conteúdo interno do subprocesso "${texto(el.name) || el.id}" (${contar(el.flowElements.length, 'elemento', 'elementos')}) não é importado; ele vira um subprocesso recolhido`);
      }
      g.nos.push(no);
    } else if (el.$type === 'bpmn:SequenceFlow') {
      if (!el.sourceRef || !el.targetRef) continue;
      const a: ArestaImportada = { id: el.id!, origem: el.sourceRef.id, destino: el.targetRef.id };
      if (texto(el.name).trim()) a.rotulo = texto(el.name);
      g.arestas.push(a);
    } else if (el.$type === 'bpmn:DataObjectReference' || el.$type === 'bpmn:DataObject') {
      if (el.$type === 'bpmn:DataObjectReference') anotaIgnorado('objeto de dados');
    } else if (el.$type === 'bpmn:DataStoreReference') {
      anotaIgnorado('depósito de dados');
    } else {
      anotaIgnorado(el.$type.replace('bpmn:', ''));
    }
  }

  // Eventos de borda: viram eventos intermediários ligados à atividade, para não perder os caminhos
  for (const b of bordas) {
    g.arestas.push({ id: `borda_${b.evento}`, origem: b.atividade, destino: b.evento });
    g.avisos.push(`Evento de borda "${b.evento}" convertido em evento intermediário depois da atividade "${b.atividade}"`);
  }

  for (const art of (processo.artifacts ?? []) as ElementoModdle[]) {
    if (art.$type === 'bpmn:TextAnnotation') {
      const no: NoImportado = { id: art.id!, rotulo: texto(art.text), forma: 'anotacao' };
      const caixa = caixas.get(art.id!);
      if (caixa) no.caixa = caixa;
      g.nos.push(no);
    } else if (art.$type === 'bpmn:Association' && art.sourceRef && art.targetRef) {
      const [o, d] = [art.sourceRef, art.targetRef] as ElementoModdle[];
      if (o!.$type === 'bpmn:TextAnnotation') g.associacoes.push({ anotacao: o!.id!, alvo: d!.id! });
      else if (d!.$type === 'bpmn:TextAnnotation') g.associacoes.push({ anotacao: d!.id!, alvo: o!.id! });
    } else if (art.$type === 'bpmn:Group') {
      anotaIgnorado('grupo');
    }
  }

  for (const [rotulo, n] of ignorados) g.perdas.push(`${n}× ${rotulo}`);
  return g;
}

export async function importarBpmn(xml: string): Promise<GrafoImportado[]> {
  const moddle = new BpmnModdle();
  let resultado: Awaited<ReturnType<BpmnModdle['fromXML']>>;
  try {
    resultado = await moddle.fromXML(xml);
  } catch (e) {
    throw new Error(`Não foi possível ler o BPMN: ${e instanceof Error ? e.message : String(e)}`);
  }
  const { rootElement: defs, warnings } = resultado;
  const avisosLeitura = warnings.slice(0, 10).map((w) => `Aviso na leitura do XML: ${w.message}`);

  // Coordenadas do diagrama
  const caixas = new Map<string, CaixaImportada>();
  for (const diag of (defs.diagrams ?? []) as ElementoModdle[]) {
    for (const el of (diag.plane?.planeElement ?? []) as ElementoModdle[]) {
      if (el.$type === 'bpmndi:BPMNShape' && el.bpmnElement && el.bounds) {
        const b = el.bounds;
        caixas.set(el.bpmnElement.id, { x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
  }

  const raizes = (defs.rootElements ?? []) as ElementoModdle[];
  const processos = raizes.filter((r) => r.$type === 'bpmn:Process');
  const colaboracoes = raizes.filter((r) => r.$type === 'bpmn:Collaboration');
  const participantes = colaboracoes.flatMap((c) => (c.participants ?? []) as ElementoModdle[]);
  const fluxosMensagem = colaboracoes.reduce((s, c) => s + ((c.messageFlows ?? []) as unknown[]).length, 0);

  const grafos: GrafoImportado[] = [];
  for (const proc of processos) {
    const part = participantes.find((p) => p.processRef?.id === proc.id);
    const titulo = texto(part?.name).trim() || texto(proc.name).trim() || proc.id || 'Processo';
    const g = grafoDoProcesso(proc, titulo, caixas);
    if (fluxosMensagem) g.perdas.push(`${contar(fluxosMensagem, 'fluxo de mensagem', 'fluxos de mensagem')} entre pools`);
    g.avisos.unshift(...avisosLeitura);
    if (g.nos.length) grafos.push(g);
  }
  const vazias = participantes.filter((p) => !p.processRef).length;
  if (grafos[0] && vazias) grafos[0].perdas.push(`${contar(vazias, 'pool sem conteúdo (caixa preta)', 'pools sem conteúdo (caixa preta)')}`);
  if (!grafos.length) throw new Error('O arquivo BPMN não contém nenhum processo com elementos');
  return grafos;
}

const decodificar = (c: Uint8Array | string) => (typeof c === 'string' ? c : new TextDecoder('utf-8').decode(c));

export const importadorBpmn: Importador = {
  formato: 'bpmn',
  nome: 'BPMN 2.0',
  extensoes: ['.bpmn', '.xml'],
  detectar(nome, conteudo) {
    const inicio = decodificar(typeof conteudo === 'string' ? conteudo.slice(0, 4000) : conteudo.subarray(0, 4000));
    const temNs = inicio.includes(NS_BPMN);
    if (temNs && /<([\w-]+:)?definitions[\s>]/.test(inicio)) return 0.95;
    if (nome.toLowerCase().endsWith('.bpmn')) return 0.6;
    return temNs ? 0.5 : 0;
  },
  importar: (conteudo) => importarBpmn(decodificar(conteudo)),
};
