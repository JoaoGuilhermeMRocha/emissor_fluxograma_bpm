/** @import { Etapa, Processo } from '../modelo/schema.js' */
/** @import { TipoEtapa } from '../modelo/tipos.js' */
/** @import { Caixa, LayoutCalculado } from '../layout/layout.js' */
import { ehGateway } from '../modelo/tipos.js';
import { calcularLayout } from '../layout/layout.js';
import { limparTexto, slug } from '../util/texto.js';

/**
 * Cores por tipo, no estilo do Bizagi Modeler: atividades em azul-petróleo
 * claro, início verde, fim vermelho, todas as decisões em amarelo e eventos
 * intermediários em laranja. O tipo de tarefa (usuário, sistema) se
 * distingue pelo ícone, não pela cor.
 */
export const CORES_PADRAO = {
  inicio: { fundo: '#E6FF97', borda: '#62A716' },
  intermediario: { fundo: '#FFE9C2', borda: '#C77700' },
  link: { fundo: '#FFE9C2', borda: '#C77700' },
  fim: { fundo: '#F9CFCF', borda: '#C0161B' },
  tarefa: { fundo: '#ECEFFF', borda: '#03689A' },
  sistema: { fundo: '#ECEFFF', borda: '#03689A' },
  subprocesso: { fundo: '#ECEFFF', borda: '#03689A' },
  gw_exclusivo: { fundo: '#FFF5B5', borda: '#B38B00' },
  gw_paralelo: { fundo: '#FFF5B5', borda: '#B38B00' },
  gw_inclusivo: { fundo: '#FFF5B5', borda: '#B38B00' },
  gw_complexo: { fundo: '#FFF5B5', borda: '#B38B00' },
  gw_evento: { fundo: '#FFF5B5', borda: '#B38B00' },
  anotacao: { fundo: '#FFFFFF', borda: '#7F7F7F' },
};

/**
 * @param {string} s
 * @returns {string}
 */
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const ELEMENTO = {
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

/**
 * @param {Etapa} e
 * @returns {string}
 */
function elementoDe(e) {
  if (e.tipo === 'intermediario' && e.evento === 'disparo') return 'intermediateThrowEvent';
  return ELEMENTO[e.tipo];
}

/**
 * @param {Etapa} e
 * @returns {string[]}
 */
function documentacao(e) {
  const partes = [];
  if (limparTexto(e.apoio)) partes.push(`Apoio: ${limparTexto(e.apoio)}`);
  if (e.tipo === 'gw_complexo' && limparTexto(e.regra)) partes.push(`Regra: ${limparTexto(e.regra)}`);
  if (e.tipo === 'fim' && e.resultado) partes.push(`Resultado: ${e.resultado}`);
  return partes;
}

/**
 * @param {Caixa} c
 * @returns {string}
 */
const bounds = (c) => `<dc:Bounds x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" />`;

/**
 * @param {Processo} p
 * @param {OpcoesBpmn} [opcoes={}]
 * @returns {string}
 */
export function exportarBpmn(p, opcoes = {}) {
  const layout = opcoes.layout ?? calcularLayout(p);
  const cores = opcoes.cores === null ? null : (opcoes.cores ?? CORES_PADRAO);
  const ids = new Set(p.etapas.map((e) => e.id));
  const fluxo = p.etapas.filter((e) => e.tipo !== 'anotacao');
  const anotacoes = p.etapas.filter((e) => e.tipo === 'anotacao');

  // Setas válidas, com ids estáveis
  const setas = [];
  for (const e of fluxo) {
    e.saidas.forEach((s, i) => {
      if (!s.destino || !ids.has(s.destino)) return;
      if (p.etapas.find((x) => x.id === s.destino)?.tipo === 'anotacao') return;
      setas.push({
        id: `Flow_${e.id}_${i + 1}`,
        origem: e.id,
        destino: s.destino,
        nome: limparTexto(s.rotulo),
      });
    });
  }
  const entradas = new Map();
  const saidas = new Map();
  for (const s of setas) {
    entradas.set(s.destino, [...(entradas.get(s.destino) ?? []), s.id]);
    saidas.set(s.origem, [...(saidas.get(s.origem) ?? []), s.id]);
  }

  const L = [];
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
    for (const n of layout.nos)
      if (n.raia === r.nome) L.push(`        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`);
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
    if (e.tipo === 'link')
      L.push(`      <bpmn:linkEventDefinition id="Link_${e.id}" name="${esc(limparTexto(e.descricao))}" />`);
    L.push(`    </bpmn:${tag}>`);
  }
  for (const s of setas) {
    const nome = s.nome ? ` name="${esc(s.nome)}"` : '';
    L.push(`    <bpmn:sequenceFlow id="${s.id}"${nome} sourceRef="${s.origem}" targetRef="${s.destino}" />`);
  }
  const associacoes = [];
  for (const a of anotacoes) {
    L.push(`    <bpmn:textAnnotation id="${a.id}">`);
    L.push(`      <bpmn:text>${esc(limparTexto(a.descricao))}</bpmn:text>`);
    L.push('    </bpmn:textAnnotation>');
    if (a.anotaEtapa && ids.has(a.anotaEtapa)) {
      const id = `Association_${a.id}`;
      associacoes.push({ id, nota: a.id, alvo: a.anotaEtapa });
      L.push(
        `    <bpmn:association id="${id}" associationDirection="None" sourceRef="${a.id}" targetRef="${a.anotaEtapa}" />`,
      );
    }
  }
  L.push('  </bpmn:process>');

  // Diagrama
  const cor = (t) => {
    const c = cores?.[t];
    return c ? ` color:background-color="${esc(c.fundo)}" color:border-color="${esc(c.borda)}"` : '';
  };
  // Tema das linhas (opcional): pool, raias, setas e anotações
  const linha = opcoes.corLinha ? ` color:border-color="${esc(opcoes.corLinha)}"` : '';
  const fundoPiscina = opcoes.corFundoPiscina
    ? ` color:background-color="${esc(opcoes.corFundoPiscina)}"`
    : '';
  const rotuloTema =
    opcoes.corLinha && opcoes.corTexto ? `<bpmndi:BPMNLabel color:color="${esc(opcoes.corTexto)}" />` : '';
  L.push('  <bpmndi:BPMNDiagram id="BPMNDiagram_1">');
  L.push('    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">');
  L.push(
    `      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true"${fundoPiscina}${linha}>${bounds(layout.piscina)}${rotuloTema}</bpmndi:BPMNShape>`,
  );
  for (const r of layout.raias) {
    const id = idRaia.get(r.nome);
    L.push(
      `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" isHorizontal="true"${fundoPiscina}${linha}>${bounds(r)}${rotuloTema}</bpmndi:BPMNShape>`,
    );
  }
  for (const n of layout.nos) {
    const extra = n.tipo === 'subprocesso' ? ' isExpanded="false"' : '';
    // Decisões: nome acima, à esquerda do losango, para não ficar sob as setas que saem por baixo
    const caixaRotulo = ehGateway(n.tipo)
      ? bounds({ x: n.x + n.w / 2 - 112, y: n.y - 34, w: 104, h: 28 })
      : '';
    const corRotulo = cores ? ` color:color="${esc(opcoes.corTexto ?? '#1F2937')}"` : '';
    const rotulo =
      caixaRotulo || corRotulo ? `<bpmndi:BPMNLabel${corRotulo}>${caixaRotulo}</bpmndi:BPMNLabel>` : '';
    L.push(
      `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${extra}${cor(n.tipo)}>${bounds(n)}${rotulo}</bpmndi:BPMNShape>`,
    );
  }
  for (const a of layout.anotacoes) {
    L.push(
      `      <bpmndi:BPMNShape id="${a.id}_di" bpmnElement="${a.id}"${linha}>${bounds(a)}${rotuloTema}</bpmndi:BPMNShape>`,
    );
  }
  // Setas do layout na mesma ordem das saídas; consumidas por par origem>destino
  const filaLayout = new Map();
  for (const a of layout.arestas) {
    const k = `${a.origem}>${a.destino}`;
    filaLayout.set(k, [...(filaLayout.get(k) ?? []), a]);
  }
  for (const s of setas) {
    const a = filaLayout.get(`${s.origem}>${s.destino}`)?.shift();
    if (!a) continue;
    L.push(`      <bpmndi:BPMNEdge id="${s.id}_di" bpmnElement="${s.id}"${linha}>`);
    for (const pt of a.pontos) L.push(`        <di:waypoint x="${pt.x}" y="${pt.y}" />`);
    if (rotuloTema && s.nome) L.push(`        ${rotuloTema}`);
    L.push('      </bpmndi:BPMNEdge>');
  }
  const caixa = new Map([...layout.nos, ...layout.anotacoes].map((c) => [c.id, c]));
  for (const as of associacoes) {
    const n = caixa.get(as.nota);
    const t = caixa.get(as.alvo);
    if (!n || !t) continue;
    L.push(`      <bpmndi:BPMNEdge id="${as.id}_di" bpmnElement="${as.id}"${linha}>`);
    L.push(`        <di:waypoint x="${Math.round(n.x + n.w / 2)}" y="${n.y + n.h}" />`);
    L.push(`        <di:waypoint x="${Math.round(t.x + t.w / 2)}" y="${t.y}" />`);
    L.push('      </bpmndi:BPMNEdge>');
  }
  L.push('    </bpmndi:BPMNPlane>');
  L.push('  </bpmndi:BPMNDiagram>');
  L.push('</bpmn:definitions>');
  return L.join('\n');
}

/**
 * @param {Pick<Processo, 'nome' | 'versao'>} p
 * @returns {string}
 */
export function nomeArquivoBpmn(p) {
  return `${[slug(p.nome) || 'processo', slug(p.versao)].filter(Boolean).join('_')}.bpmn`;
}
/**
 * Cores por tipo (preenchimento, borda). Padrão neutro; a marca pode trocar (§15).
 * @typedef {Partial<Record<TipoEtapa, { fundo: string; borda: string }>>} CoresTipos
 */
/**
 * @typedef {Object} OpcoesBpmn
 * @property {LayoutCalculado} [layout]
 * @property {CoresTipos | null} [cores] `null` desliga as cores.
 * @property {string} [corTexto] Cor do texto dos rótulos quando há cores (padrão: grafite, legível sobre os fundos claros).
 * @property {string} [corLinha] Cor das linhas: setas, bordas da pool e das raias, anotações. Sem ela, a ferramenta usa a padrão.
 * @property {string} [corFundoPiscina] Preenchimento da pool e das raias (ex.: fundo escuro no tema escuro).
 * @property {string} [exportador]
 * @property {string} [versaoExportador]
 */
