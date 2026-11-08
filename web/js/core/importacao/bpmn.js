/** @import { ArestaImportada, CaixaImportada, FormaImportada, GrafoImportado, Importador, NoImportado } from './grafo-importado.js' */
/**
 * Importador BPMN 2.0 XML (ESPECIFICACAO §11.5, prioridade A).
 * Lê arquivos do bpmn.io, Camunda, Bizagi, Signavio, ARIS e do próprio
 * sistema. Gera um Grafo Intermediário por pool (ou um só, sem pools).
 */
import { BpmnModdle } from 'bpmn-moddle';

/**
 * Elemento lido pelo bpmn-moddle (o pacote não publica tipos). Tipagem mínima do que usamos.
 * @typedef {{ $type: string; id?: string; name?: string; [chave: string]: any }} ElementoModdle
 */

const NS_BPMN = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

const FORMAS = {
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

/**
 * @param {unknown} v
 * @returns {string}
 */
const texto = (v) => (typeof v === 'string' ? v : '');

/**
 * @param {number} n
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
const contar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/**
 * Lê "Apoio: …", "Regra: …" e "Resultado: …" da documentação (formato que o próprio sistema exporta).
 * @param {ElementoModdle} el
 * @returns {Record<string, string>}
 */
function extrasDaDocumentacao(el) {
  const doc = (el.documentation ?? [])
    .map((d) => texto(d.text))
    .join('\n')
    .trim();
  if (!doc) return {};
  const extras = {};
  const livres = [];
  for (const linha of doc.split(/\r?\n/)) {
    const m = /^(Apoio|Regra|Resultado):\s*(.*)$/i.exec(linha.trim());
    if (m) extras[m[1].toLowerCase() === 'regra' ? 'documentacao' : m[1].toLowerCase()] = m[2];
    else if (linha.trim()) livres.push(linha.trim());
  }
  if (livres.length) extras.documentacao = [extras.documentacao, ...livres].filter(Boolean).join(' ');
  return extras;
}

/**
 * Raias folha (lanes aninhadas viram "Pai / Filho").
 * @param {ElementoModdle[]} lanes
 * @param {string} [prefixo='']
 * @returns {{ lane: ElementoModdle; nome: string }[]}
 */
function raiasFolha(lanes, prefixo = '') {
  return lanes.flatMap((l) => {
    const nome = [prefixo, texto(l.name).trim()].filter(Boolean).join(' / ');
    const filhas = l.childLaneSet?.lanes ?? [];
    return filhas.length ? raiasFolha(filhas, nome) : [{ lane: l, nome }];
  });
}

/**
 * Anotações, associações e grupos (artefatos) de um processo ou de uma colaboração.
 * @param {ElementoModdle[]} artefatos
 * @param {GrafoImportado} g
 * @param {Map<string, CaixaImportada>} caixas
 * @param {(rotulo: string) => void} anotaIgnorado
 */
function lerArtefatos(artefatos, g, caixas, anotaIgnorado) {
  for (const art of artefatos) {
    if (art.$type === 'bpmn:TextAnnotation') {
      /** @type {NoImportado} */
      const no = { id: art.id, rotulo: texto(art.text), forma: 'anotacao' };
      const caixa = caixas.get(art.id);
      if (caixa) no.caixa = caixa;
      g.nos.push(no);
    } else if (art.$type === 'bpmn:Association' && art.sourceRef && art.targetRef) {
      const [o, d] = [art.sourceRef, art.targetRef];
      if (o.$type === 'bpmn:TextAnnotation') g.associacoes.push({ anotacao: o.id, alvo: d.id });
      else if (d.$type === 'bpmn:TextAnnotation') g.associacoes.push({ anotacao: d.id, alvo: o.id });
    } else if (art.$type === 'bpmn:Group') {
      anotaIgnorado('grupo');
    }
  }
}

/**
 * Artefatos gravados na colaboração (é onde o bpmn-js põe anotações criadas sobre
 * uma pool) vão para o grafo da pool certa: a da etapa associada; senão, a pool cuja
 * área contém a anotação; senão, a primeira.
 * @param {ElementoModdle[]} colaboracoes
 * @param {{ g: GrafoImportado, participante?: ElementoModdle }[]} pools
 * @param {Map<string, CaixaImportada>} caixas
 */
function distribuirArtefatosDaColaboracao(colaboracoes, pools, caixas) {
  if (!pools.length) return;
  const artefatos = colaboracoes.flatMap((c) => c.artifacts ?? []);
  if (!artefatos.length) return;
  const temp = { titulo: '', raias: [], nos: [], arestas: [], associacoes: [], avisos: [], perdas: [] };
  lerArtefatos(artefatos, temp, caixas, () => {});
  const dentro = (c, p) => !!c && !!p && c.x + c.w / 2 >= p.x && c.x + c.w / 2 <= p.x + p.w && c.y + c.h / 2 >= p.y && c.y + c.h / 2 <= p.y + p.h;
  for (const nota of temp.nos) {
    const assoc = temp.associacoes.filter((a) => a.anotacao === nota.id);
    const alvo =
      pools.find((p) => assoc.some((a) => p.g.nos.some((n) => n.id === a.alvo))) ??
      pools.find((p) => p.participante && dentro(nota.caixa, caixas.get(p.participante.id))) ??
      pools[0];
    alvo.g.nos.push(nota);
    alvo.g.associacoes.push(...assoc);
  }
}

/**
 * @param {ElementoModdle} processo
 * @param {string} titulo
 * @param {Map<string, CaixaImportada>} caixas
 * @param {Map<string, { x: number, y: number }[]>} rotas trajetos das setas no diagrama
 * @returns {GrafoImportado}
 */
function grafoDoProcesso(processo, titulo, caixas, rotas) {
  const g = { titulo, raias: [], nos: [], arestas: [], associacoes: [], avisos: [], perdas: [] };

  const raiaDoNo = new Map();
  raiasFolha((processo.laneSets ?? []).flatMap((ls) => ls.lanes ?? [])).forEach(({ lane, nome }, ordem) => {
    const raia = { id: lane.id, nome: nome || `Raia ${ordem + 1}`, ordem };
    const caixaRaia = caixas.get(lane.id);
    if (caixaRaia) raia.caixa = caixaRaia;
    g.raias.push(raia);
    for (const ref of lane.flowNodeRef ?? []) raiaDoNo.set(ref.id, lane.id);
  });

  const ignorados = new Map();
  const anotaIgnorado = (rotulo) => ignorados.set(rotulo, (ignorados.get(rotulo) ?? 0) + 1);
  const bordas = [];

  for (const el of processo.flowElements ?? []) {
    const forma = FORMAS[el.$type];
    if (forma) {
      /** @type {NoImportado} */
      const no = {
        id: el.id,
        rotulo: texto(el.name),
        forma,
        extras: { tipoOriginal: el.$type.replace('bpmn:', ''), ...extrasDaDocumentacao(el) },
      };
      const raia = raiaDoNo.get(el.id);
      if (raia) no.raiaId = raia;
      const caixa = caixas.get(el.id);
      if (caixa) no.caixa = caixa;
      const defs = el.eventDefinitions ?? [];
      if (defs.some((d) => d.$type === 'bpmn:LinkEventDefinition')) no.extras.link = 'true';
      if (el.$type === 'bpmn:IntermediateThrowEvent') no.extras.evento = 'disparo';
      if (el.$type === 'bpmn:BoundaryEvent' && el.attachedToRef)
        bordas.push({ evento: el.id, atividade: el.attachedToRef.id });
      if (
        (el.$type === 'bpmn:SubProcess' ||
          el.$type === 'bpmn:Transaction' ||
          el.$type === 'bpmn:AdHocSubProcess') &&
        (el.flowElements ?? []).length
      ) {
        g.perdas.push(
          `Conteúdo interno do subprocesso "${texto(el.name) || el.id}" (${contar(el.flowElements.length, 'elemento', 'elementos')}) não é importado; ele vira um subprocesso recolhido`,
        );
      }
      g.nos.push(no);
    } else if (el.$type === 'bpmn:SequenceFlow') {
      if (!el.sourceRef || !el.targetRef) continue;
      /** @type {ArestaImportada} */
      const a = { id: el.id, origem: el.sourceRef.id, destino: el.targetRef.id };
      if (texto(el.name).trim()) a.rotulo = texto(el.name);
      const pontos = rotas.get(el.id);
      if (pontos) a.pontos = pontos;
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
    g.avisos.push(
      `Evento de borda "${b.evento}" convertido em evento intermediário depois da atividade "${b.atividade}"`,
    );
  }

  lerArtefatos(processo.artifacts ?? [], g, caixas, anotaIgnorado);

  for (const [rotulo, n] of ignorados) g.perdas.push(`${n}× ${rotulo}`);
  return g;
}

/**
 * @param {string} xml
 * @returns {Promise<GrafoImportado[]>}
 */
export async function importarBpmn(xml) {
  const moddle = new BpmnModdle();
  let resultado;
  try {
    resultado = await moddle.fromXML(xml);
  } catch (e) {
    throw new Error(`Não foi possível ler o BPMN: ${e instanceof Error ? e.message : String(e)}`);
  }
  const { rootElement: defs, warnings } = resultado;
  const avisosLeitura = warnings.slice(0, 10).map((w) => `Aviso na leitura do XML: ${w.message}`);

  // Coordenadas do diagrama
  const caixas = new Map();
  const rotas = new Map();
  for (const diag of defs.diagrams ?? []) {
    for (const el of diag.plane?.planeElement ?? []) {
      if (el.$type === 'bpmndi:BPMNShape' && el.bpmnElement && el.bounds) {
        const b = el.bounds;
        caixas.set(el.bpmnElement.id, { x: b.x, y: b.y, w: b.width, h: b.height });
      } else if (el.$type === 'bpmndi:BPMNEdge' && el.bpmnElement && el.waypoint?.length >= 2) {
        rotas.set(el.bpmnElement.id, el.waypoint.map((w) => ({ x: w.x, y: w.y })));
      }
    }
  }

  const raizes = defs.rootElements ?? [];
  const processos = raizes.filter((r) => r.$type === 'bpmn:Process');
  const colaboracoes = raizes.filter((r) => r.$type === 'bpmn:Collaboration');
  const participantes = colaboracoes.flatMap((c) => c.participants ?? []);
  const fluxosMensagem = colaboracoes.reduce((s, c) => s + (c.messageFlows ?? []).length, 0);

  const pools = [];
  for (const proc of processos) {
    const part = participantes.find((p) => p.processRef?.id === proc.id);
    const titulo = texto(part?.name).trim() || texto(proc.name).trim() || proc.id || 'Processo';
    const g = grafoDoProcesso(proc, titulo, caixas, rotas);
    if (fluxosMensagem)
      g.perdas.push(`${contar(fluxosMensagem, 'fluxo de mensagem', 'fluxos de mensagem')} entre pools`);
    g.avisos.unshift(...avisosLeitura);
    if (g.nos.length) pools.push({ g, participante: part });
  }
  distribuirArtefatosDaColaboracao(colaboracoes, pools, caixas);
  const grafos = pools.map((p) => p.g);
  const vazias = participantes.filter((p) => !p.processRef).length;
  if (grafos[0] && vazias)
    grafos[0].perdas.push(
      `${contar(vazias, 'pool sem conteúdo (caixa preta)', 'pools sem conteúdo (caixa preta)')}`,
    );
  if (!grafos.length) throw new Error('O arquivo BPMN não contém nenhum processo com elementos');
  return grafos;
}

/**
 * @param {Uint8Array | string} c
 * @returns {string}
 */
const decodificar = (c) => (typeof c === 'string' ? c : new TextDecoder('utf-8').decode(c));

export const importadorBpmn = {
  formato: 'bpmn',
  nome: 'BPMN 2.0',
  extensoes: ['.bpmn', '.xml'],
  detectar(nome, conteudo) {
    const inicio = decodificar(
      typeof conteudo === 'string' ? conteudo.slice(0, 4000) : conteudo.subarray(0, 4000),
    );
    const temNs = inicio.includes(NS_BPMN);
    if (temNs && /<([\w-]+:)?definitions[\s>]/.test(inicio)) return 0.95;
    if (nome.toLowerCase().endsWith('.bpmn')) return 0.6;
    return temNs ? 0.5 : 0;
  },
  importar: (conteudo) => importarBpmn(decodificar(conteudo)),
};
