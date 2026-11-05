import { BpmnModdle } from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adicionarEtapa, calcularLayout, criarProcesso, exportarBpmn, importarBpmn, lerPlanilha, nomeArquivoBpmn, normalizarGrafo, planilhaParaGrafo, processoExemplo, type Caixa, type LayoutCalculado } from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

function cruzamentos(l: LayoutCalculado): string[] {
  const achados: string[] = [];
  for (const a of l.arestas) {
    for (let i = 1; i < a.pontos.length; i++) {
      const [p1, p2] = [a.pontos[i - 1]!, a.pontos[i]!];
      const seg = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x) || 1, h: Math.abs(p2.y - p1.y) || 1 };
      for (const n of l.nos) if (n.id !== a.origem && n.id !== a.destino && sobrepoe(seg, n)) achados.push(`${a.origem}→${a.destino} atravessa ${n.id}`);
    }
  }
  return achados;
}

const sobrepoe = (a: Caixa, b: Caixa) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout em camadas com raias', () => {
  const p = processoExemplo(fixo);
  const l = calcularLayout(p);
  const no = Object.fromEntries(l.nos.map((n) => [n.id, n]));

  it('colunas pelo caminho mais longo; ramos lado a lado', () => {
    expect(Object.fromEntries(l.nos.map((n) => [n.id, n.coluna]))).toEqual({
      E01: 0, E02: 1, E03: 2, E04: 3, E05: 4, E06: 4, E07: 5, E08: 5, E09: 6,
    });
  });

  it('cada etapa fica dentro da sua raia', () => {
    expect(l.raias.map((r) => r.nome)).toEqual(['Atendimento', 'Área Responsável']);
    for (const n of l.nos) {
      const r = l.raias.find((x) => x.nome === n.raia)!;
      expect(n.y).toBeGreaterThanOrEqual(r.y);
      expect(n.y + n.h).toBeLessThanOrEqual(r.y + r.h);
    }
    expect(no.E01!.raia).toBe('Atendimento');
    expect(no.E08!.raia).toBe('Área Responsável');
  });

  it('nenhuma etapa sobrepõe outra', () => {
    for (const a of l.nos) for (const b of l.nos) if (a !== b) expect(sobrepoe(a, b), `${a.id} × ${b.id}`).toBe(false);
  });

  it('o retorno E07 → E03 é roteado por baixo', () => {
    const r = l.arestas.find((a) => a.origem === 'E07' && a.destino === 'E03')!;
    expect(r.retorno).toBe(true);
    const fundo = Math.max(...r.pontos.map((pt) => pt.y));
    expect(fundo).toBeGreaterThan(Math.max(no.E07!.y + no.E07!.h, no.E03!.y + no.E03!.h, no.E08!.y + no.E08!.h));
  });

  it('nenhuma seta atravessa etapas que não são suas pontas', () => {
    expect(cruzamentos(l)).toEqual([]);
  });

  it('setas são ortogonais', () => {
    for (const a of l.arestas) {
      for (let i = 1; i < a.pontos.length; i++) {
        const [p1, p2] = [a.pontos[i - 1]!, a.pontos[i]!];
        expect(p1.x === p2.x || p1.y === p2.y, `${a.origem}→${a.destino}`).toBe(true);
      }
    }
  });

  it('etapas na mesma raia e coluna são empilhadas', () => {
    let q = criarProcesso(fixo);
    q = adicionarEtapa(q, { tipo: 'inicio', descricao: 'I', saidas: [{ destino: 'E02' }] }).processo;
    q = adicionarEtapa(q, { tipo: 'gw_paralelo', descricao: '', ator: 'A', saidas: [{ destino: 'E03' }, { destino: 'E04' }] }).processo;
    q = adicionarEtapa(q, { tipo: 'tarefa', descricao: 'X', ator: 'A', saidas: [{ destino: 'E05' }] }).processo;
    q = adicionarEtapa(q, { tipo: 'tarefa', descricao: 'Y', ator: 'A', saidas: [{ destino: 'E05' }] }).processo;
    q = adicionarEtapa(q, { tipo: 'fim', descricao: 'F' }).processo;
    const lq = calcularLayout(q);
    const [x, y] = ['E03', 'E04'].map((id) => lq.nos.find((n) => n.id === id)!);
    expect(x!.coluna).toBe(y!.coluna);
    expect(x!.x).toBe(y!.x);
    expect(sobrepoe(x!, y!)).toBe(false);
  });

  it('posição manual sobrepõe a automática', () => {
    const q = structuredClone(p);
    q.layout.posicoes.E05 = { x: 1000, y: 60 };
    const lq = calcularLayout(q);
    const n = lq.nos.find((x) => x.id === 'E05')!;
    const raia = lq.raias.find((r) => r.nome === n.raia)!;
    expect(n.x + n.w / 2).toBe(1000);
    expect(n.y + n.h / 2).toBe(raia.y + 60); // relativo ao topo da raia
    // fora da raia: fica preso dentro dela
    q.layout.posicoes.E05 = { x: 1000, y: 9999 };
    const n2 = calcularLayout(q).nos.find((x) => x.id === 'E05')!;
    expect(n2.y + n2.h).toBeLessThanOrEqual(raia.y + raia.h);
  });
});

describe('setas não atravessam etapas em processos importados', () => {
  const fixoImp = { formato: 'teste', agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'p' };
  it('BPMN do Camunda', async () => {
    const [g] = await importarBpmn(readFileSync(new URL('./amostras/camunda-compras.bpmn', import.meta.url), 'utf8'));
    expect(cruzamentos(calcularLayout(normalizarGrafo(g!, fixoImp).processo))).toEqual([]);
  });
  it('planilha', () => {
    const bytes = new Uint8Array(readFileSync(new URL('./amostras/openpyxl-compras.xlsx', import.meta.url)));
    expect(cruzamentos(calcularLayout(normalizarGrafo(planilhaParaGrafo(lerPlanilha(bytes)).grafo, fixoImp).processo))).toEqual([]);
  });
});

describe('exportação BPMN 2.0', () => {
  const moddle = new BpmnModdle();

  it('gera XML que o bpmn-moddle lê sem avisos', async () => {
    const p = processoExemplo(fixo);
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Prazo: 2 dias & <urgente>', anotaEtapa: 'E03', saidas: [] });
    const xml = exportarBpmn(p);
    const { rootElement, warnings } = await moddle.fromXML(xml);
    expect(warnings).toEqual([]);

    const processo = rootElement.rootElements.find((x: { $type: string }) => x.$type === 'bpmn:Process');
    const tipos = processo.flowElements.map((x: { $type: string }) => x.$type);
    expect(tipos.filter((t: string) => t === 'bpmn:SequenceFlow')).toHaveLength(9);
    expect(tipos).toEqual(expect.arrayContaining(['bpmn:StartEvent', 'bpmn:UserTask', 'bpmn:ExclusiveGateway', 'bpmn:EndEvent']));
    expect(processo.laneSets[0].lanes.map((l: { name: string }) => l.name)).toEqual(['Atendimento', 'Área Responsável']);
    expect(processo.artifacts.map((a: { $type: string }) => a.$type)).toEqual(['bpmn:TextAnnotation', 'bpmn:Association']);
    expect(processo.artifacts[0].text).toBe('Prazo: 2 dias & <urgente>');

    const sim = processo.flowElements.find((x: { id: string }) => x.id === 'Flow_E04_1');
    expect(sim.name).toBe('SIM');
    expect(sim.targetRef.id).toBe('E05');

    const plano = rootElement.diagrams[0].plane;
    const desenhados = new Set(plano.planeElement.map((d: { bpmnElement: { id: string } }) => d.bpmnElement.id));
    for (const e of p.etapas) expect(desenhados.has(e.id), e.id).toBe(true);
  });

  it('mapeia todos os tipos', async () => {
    let q = criarProcesso({ ...fixo, nome: 'Todos os tipos' });
    const add = (d: Parameters<typeof adicionarEtapa>[1]) => (q = adicionarEtapa(q, d).processo);
    add({ tipo: 'inicio', descricao: 'Início', saidas: [{ destino: 'E02' }] });
    add({ tipo: 'sistema', descricao: 'Sistema', ator: 'TI', apoio: 'ERP', saidas: [{ destino: 'E03' }] });
    add({ tipo: 'subprocesso', descricao: 'Sub', ator: 'TI', saidas: [{ destino: 'E04' }] });
    add({ tipo: 'gw_complexo', descricao: 'Regra', ator: 'TI', regra: 'valor > 10', saidas: [{ destino: 'E05' }] });
    add({ tipo: 'intermediario', descricao: 'Avisa', evento: 'disparo', saidas: [{ destino: 'E06' }] });
    add({ tipo: 'link', descricao: 'Vai para B', saidas: [{ destino: 'E07' }] });
    add({ tipo: 'fim', descricao: 'Fim', resultado: 'Cancelado' });
    const { rootElement, warnings } = await moddle.fromXML(exportarBpmn(q));
    expect(warnings).toEqual([]);
    const fe = rootElement.rootElements.find((x: { $type: string }) => x.$type === 'bpmn:Process').flowElements;
    const porId = Object.fromEntries(fe.map((x: { id: string }) => [x.id, x]));
    expect(porId.E02.$type).toBe('bpmn:ServiceTask');
    expect(porId.E02.documentation[0].text).toBe('Apoio: ERP');
    expect(porId.E03.$type).toBe('bpmn:SubProcess');
    expect(porId.E04.documentation[0].text).toBe('Regra: valor > 10');
    expect(porId.E05.$type).toBe('bpmn:IntermediateThrowEvent');
    expect(porId.E06.eventDefinitions[0].$type).toBe('bpmn:LinkEventDefinition');
    expect(porId.E07.documentation[0].text).toBe('Resultado: Cancelado');
  });

  it('tema escuro: cores de linha, fundo e texto continuam gerando XML válido', async () => {
    const p = processoExemplo(fixo);
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Nota', anotaEtapa: 'E03', saidas: [] });
    const xml = exportarBpmn(p, { corLinha: '#9AA4B2', corFundoPiscina: '#141920', corTexto: '#E6E9EE', cores: { tarefa: { fundo: '#172A46', borda: '#60A5FA' } } });
    const { warnings } = await moddle.fromXML(xml);
    expect(warnings).toEqual([]);
    expect(xml).toContain('bpmnElement="Participant_1" isHorizontal="true" color:background-color="#141920" color:border-color="#9AA4B2"');
    expect(xml).toMatch(/bpmnElement="Flow_E04_1" color:border-color="#9AA4B2">[\s\S]*?color:color="#E6E9EE"/);
  });

  it('processo vazio também gera XML válido', async () => {
    const { warnings } = await moddle.fromXML(exportarBpmn(criarProcesso(fixo)));
    expect(warnings).toEqual([]);
  });

  it('ignora setas inválidas', async () => {
    const p = processoExemplo(fixo);
    p.etapas[1]!.saidas = [{ destino: 'E99' }];
    const { warnings, rootElement } = await moddle.fromXML(exportarBpmn(p));
    expect(warnings).toEqual([]);
    const fe = rootElement.rootElements.find((x: { $type: string }) => x.$type === 'bpmn:Process').flowElements;
    expect(fe.some((x: { id: string }) => x.id.startsWith('Flow_E02'))).toBe(false);
  });

  it('nome do arquivo', () => {
    expect(nomeArquivoBpmn({ nome: 'Aprovação de Solicitação', versao: 'v1.0' })).toBe('aprovacao_de_solicitacao_v1_0.bpmn');
  });
});
