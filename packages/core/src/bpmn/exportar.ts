/**
 * Exportação BPMN 2.0 XML com diagrama (BPMNDI), conforme ESPECIFICACAO §4.3.
 * Gera texto diretamente (sem DOM), para rodar igual no navegador e nos testes.
 * Abre no bpmn.io, Camunda Modeler e demais ferramentas BPMN 2.0.
 */
import type { Etapa, Processo } from '../modelo/schema';
import { ehGateway, type TipoEtapa } from '../modelo/tipos';
import { calcularLayout, type Caixa, type LayoutCalculado } from '../layout/layout';
import { limparTexto, slug } from '../util/texto';

/** Cores por tipo (preenchimento, borda). Padrão neutro; a marca pode trocar (§15). */
export type CoresTipos = Partial<Record<TipoEtapa, { fundo: string; borda: string }>>;

export const CORES_PADRAO: CoresTipos = {
  inicio: { fundo: '#D5E8D4', borda: '#82B366' },
  intermediario: { fundo: '#D5E8D4', borda: '#82B366' },
  fim: { fundo: '#F8CECC', borda: '#B85450' },
  link: { fundo: '#DCEEFB', borda: '#1E88C7' },
  tarefa: { fundo: '#DAE8FC', borda: '#6C8EBF' },
  sistema: { fundo: '#E7F7E9', borda: '#2E7D32' },
  subprocesso: { fundo: '#EDF2ED', borda: '#5A645A' },
  gw_exclusivo: { fundo: '#FFE6CC', borda: '#D79B00' },
  gw_paralelo: { fundo: '#DCEEFB', borda: '#1E88C7' },
  gw_inclusivo: { fundo: '#FFF6D6', borda: '#C79A00' },
  gw_complexo: { fundo: '#F7E0E6', borda: '#8C1F3E' },
  gw_evento: { fundo: '#EDE3D9', borda: '#7A5230' },
  anotacao: { fundo: '#FFFFFF', borda: '#9CA3AF' },
};

export interface OpcoesBpmn {
  layout?: LayoutCalculado;
  /** `null` desliga as cores. */
  cores?: CoresTipos | null;
  /** Cor do texto dos rótulos quando há cores (padrão: grafite, legível sobre os fundos claros). */
  corTexto?: string;
  exportador?: string;
  versaoExportador?: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const ELEMENTO: Record<TipoEtapa, string> = {
  inicio: 'startEvent',
  tarefa: 'userTask',
  sistema: 'serviceTask',
  subprocesso: 'subProcess',
  gw_exclusivo: 'exclusiveGateway',
  gw_paralelo: 'parallelGateway',
  gw_inclusivo: 'inclusiveGateway',
  gw_complexo: 'complexGateway',
  gw_evento: 'eventBasedGateway',
  intermediario: 'intermediateCatchEvent',
  link: 'intermediateCatchEvent',
  fim: 'endEvent',
  anotacao: 'textAnnotation',
};

function elementoDe(e: Etapa): string {
  if (e.tipo === 'intermediario' && e.evento === 'disparo') return 'intermediateThrowEvent';
  return ELEMENTO[e.tipo];
}

function documentacao(e: Etapa): string[] {
  const partes: string[] = [];
  if (limparTexto(e.apoio)) partes.push(`Apoio: ${limparTexto(e.apoio)}`);
  if (e.tipo === 'gw_complexo' && limparTexto(e.regra)) partes.push(`Regra: ${limparTexto(e.regra)}`);
  if (e.tipo === 'fim' && e.resultado) partes.push(`Resultado: ${e.resultado}`);
  return partes;
}

const bounds = (c: Caixa) => `<dc:Bounds x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" />`;

export function exportarBpmn(p: Processo, opcoes: OpcoesBpmn = {}): string {
  const layout = opcoes.layout ?? calcularLayout(p);
  const cores = opcoes.cores === null ? null : (opcoes.cores ?? CORES_PADRAO);
  const ids = new Set(p.etapas.map((e) => e.id));
  const fluxo = p.etapas.filter((e) => e.tipo !== 'anotacao');
  const anotacoes = p.etapas.filter((e) => e.tipo === 'anotacao');

  // Setas válidas, com ids estáveis
  const setas: { id: string; origem: string; destino: string; nome: string }[] = [];
  for (const e of fluxo) {
    e.saidas.forEach((s, i) => {
      if (!s.destino || !ids.has(s.destino)) return;
      if (p.etapas.find((x) => x.id === s.destino)?.tipo === 'anotacao') return;
      setas.push({ id: `Flow_${e.id}_${i + 1}`, origem: e.id, destino: s.destino, nome: limparTexto(s.rotulo) });
    });
  }
  const entradas = new Map<string, string[]>();
  const saidas = new Map<string, string[]>();
  for (const s of setas) {
    entradas.set(s.destino, [...(entradas.get(s.destino) ?? []), s.id]);
    saidas.set(s.origem, [...(saidas.get(s.origem) ?? []), s.id]);
  }

  const L: string[] = [];
  const nomeProcesso = limparTexto(p.nome) || 'Processo';
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"' +
      ' xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"' +
      ' xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"' +
      ' xmlns:di="http://www.omg.org/spec/DD/20100524/DI"' +
      ' xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"' +
      ` id="Definitions_1" targetNamespace="urn:mapeador:${esc(p.id)}"` +
      ` exporter="${esc(opcoes.exportador ?? 'Mapeador de Processos')}" exporterVersion="${esc(opcoes.versaoExportador ?? '0.1.0')}">`,
  );
  L.push('  <bpmn:collaboration id="Collaboration_1">');
  L.push(`    <bpmn:participant id="Participant_1" name="${esc(nomeProcesso)}" processRef="Process_1" />`);
  L.push('  </bpmn:collaboration>');
  L.push(`  <bpmn:process id="Process_1" name="${esc(nomeProcesso)}" isExecutable="false">`);

  // Raias
  const idRaia = new Map(layout.raias.map((r, i) => [r.nome, `Lane_${i + 1}`]));
  L.push('    <bpmn:laneSet id="LaneSet_1">');
  for (const r of layout.raias) {
    L.push(`      <bpmn:lane id="${idRaia.get(r.nome)}" name="${esc(r.nome)}">`);
    for (const n of layout.nos) if (n.raia === r.nome) L.push(`        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`);
    L.push('      </bpmn:lane>');
  }
  L.push('    </bpmn:laneSet>');

  // Elementos de fluxo
  for (const e of fluxo) {
    const tag = elementoDe(e);
    L.push(`    <bpmn:${tag} id="${e.id}" name="${esc(limparTexto(e.descricao))}">`);
    const doc = documentacao(e);
    if (doc.length) L.push(`      <bpmn:documentation>${esc(doc.join('\n'))}</bpmn:documentation>`);
    for (const f of entradas.get(e.id) ?? []) L.push(`      <bpmn:incoming>${f}</bpmn:incoming>`);
    for (const f of saidas.get(e.id) ?? []) L.push(`      <bpmn:outgoing>${f}</bpmn:outgoing>`);
    if (e.tipo === 'link') L.push(`      <bpmn:linkEventDefinition id="Link_${e.id}" name="${esc(limparTexto(e.descricao))}" />`);
    L.push(`    </bpmn:${tag}>`);
  }
  for (const s of setas) {
    const nome = s.nome ? ` name="${esc(s.nome)}"` : '';
    L.push(`    <bpmn:sequenceFlow id="${s.id}"${nome} sourceRef="${s.origem}" targetRef="${s.destino}" />`);
  }
  const associacoes: { id: string; nota: string; alvo: string }[] = [];
  for (const a of anotacoes) {
    L.push(`    <bpmn:textAnnotation id="${a.id}">`);
    L.push(`      <bpmn:text>${esc(limparTexto(a.descricao))}</bpmn:text>`);
    L.push('    </bpmn:textAnnotation>');
    if (a.anotaEtapa && ids.has(a.anotaEtapa)) {
      const id = `Association_${a.id}`;
      associacoes.push({ id, nota: a.id, alvo: a.anotaEtapa });
      L.push(`    <bpmn:association id="${id}" associationDirection="None" sourceRef="${a.id}" targetRef="${a.anotaEtapa}" />`);
    }
  }
  L.push('  </bpmn:process>');

  // Diagrama
  const cor = (t: TipoEtapa) => {
    const c = cores?.[t];
    return c ? ` color:background-color="${esc(c.fundo)}" color:border-color="${esc(c.borda)}"` : '';
  };
  L.push('  <bpmndi:BPMNDiagram id="BPMNDiagram_1">');
  L.push('    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">');
  L.push(`      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">${bounds(layout.piscina)}</bpmndi:BPMNShape>`);
  for (const r of layout.raias) {
    const id = idRaia.get(r.nome)!;
    L.push(`      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" isHorizontal="true">${bounds(r)}</bpmndi:BPMNShape>`);
  }
  for (const n of layout.nos) {
    const extra = n.tipo === 'subprocesso' ? ' isExpanded="false"' : '';
    // Decisões: nome acima, à esquerda do losango, para não ficar sob as setas que saem por baixo
    const caixaRotulo = ehGateway(n.tipo) ? bounds({ x: n.x + n.w / 2 - 112, y: n.y - 34, w: 104, h: 28 }) : '';
    const corRotulo = cores ? ` color:color="${esc(opcoes.corTexto ?? '#1F2937')}"` : '';
    const rotulo = caixaRotulo || corRotulo ? `<bpmndi:BPMNLabel${corRotulo}>${caixaRotulo}</bpmndi:BPMNLabel>` : '';
    L.push(`      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${extra}${cor(n.tipo)}>${bounds(n)}${rotulo}</bpmndi:BPMNShape>`);
  }
  for (const a of layout.anotacoes) {
    L.push(`      <bpmndi:BPMNShape id="${a.id}_di" bpmnElement="${a.id}">${bounds(a)}</bpmndi:BPMNShape>`);
  }
  // Setas do layout na mesma ordem das saídas; consumidas por par origem>destino
  const filaLayout = new Map<string, LayoutCalculado['arestas']>();
  for (const a of layout.arestas) {
    const k = `${a.origem}>${a.destino}`;
    filaLayout.set(k, [...(filaLayout.get(k) ?? []), a]);
  }
  for (const s of setas) {
    const a = filaLayout.get(`${s.origem}>${s.destino}`)?.shift();
    if (!a) continue;
    L.push(`      <bpmndi:BPMNEdge id="${s.id}_di" bpmnElement="${s.id}">`);
    for (const pt of a.pontos) L.push(`        <di:waypoint x="${pt.x}" y="${pt.y}" />`);
    L.push('      </bpmndi:BPMNEdge>');
  }
  const caixa = new Map<string, Caixa>([...layout.nos, ...layout.anotacoes].map((c) => [c.id, c]));
  for (const as of associacoes) {
    const n = caixa.get(as.nota);
    const t = caixa.get(as.alvo);
    if (!n || !t) continue;
    L.push(`      <bpmndi:BPMNEdge id="${as.id}_di" bpmnElement="${as.id}">`);
    L.push(`        <di:waypoint x="${Math.round(n.x + n.w / 2)}" y="${n.y + n.h}" />`);
    L.push(`        <di:waypoint x="${Math.round(t.x + t.w / 2)}" y="${t.y}" />`);
    L.push('      </bpmndi:BPMNEdge>');
  }
  L.push('    </bpmndi:BPMNPlane>');
  L.push('  </bpmndi:BPMNDiagram>');
  L.push('</bpmn:definitions>');
  return L.join('\n');
}

export function nomeArquivoBpmn(p: Pick<Processo, 'nome' | 'versao'>): string {
  return `${[slug(p.nome) || 'processo', slug(p.versao)].filter(Boolean).join('_')}.bpmn`;
}
