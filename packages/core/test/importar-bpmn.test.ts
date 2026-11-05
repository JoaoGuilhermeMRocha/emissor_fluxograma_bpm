import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analisar, exportarBpmn, importadorBpmn, importarBpmn, normalizarGrafo, processoExemplo, type Etapa } from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };
const amostra = readFileSync(new URL('./amostras/camunda-compras.bpmn', import.meta.url), 'utf8');

const semOrigem = (etapas: Etapa[]) => etapas.map(({ origem: _origem, ...resto }) => resto);

describe('importar BPMN', () => {
  it('ida e volta com o próprio sistema mantém ids, ordem e campos', async () => {
    const p = processoExemplo(fixo);
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Prazo de 2 dias', anotaEtapa: 'E03', saidas: [] });
    p.etapas[0]!.descricao = 'Cliente envia <solicitação> & anexos';

    const [g] = await importarBpmn(exportarBpmn(p));
    const { processo, relatorio } = normalizarGrafo(g!, { formato: 'bpmn', ...fixo });

    expect(processo.nome).toBe(p.nome);
    expect(semOrigem(processo.etapas)).toEqual(p.etapas);
    expect(processo.layout.ordemRaias).toEqual(['Atendimento', 'Área Responsável']);
    expect(relatorio.perdas).toEqual([]);
    expect(relatorio.avisos).toEqual([]);
  });

  it('arquivo do Camunda: tipos, raias, rótulos e perdas', async () => {
    const grafos = await importarBpmn(amostra);
    expect(grafos).toHaveLength(1); // a pool "Fornecedor" é caixa preta
    const g = grafos[0]!;
    expect(g.titulo).toBe('Compra de Materiais');
    expect(g.raias.map((r) => r.nome)).toEqual(['Solicitante', 'Compras', 'Financeiro']);
    expect(g.nos.find((n) => n.id === 'StartEvent_1')!.caixa).toEqual({ x: 182, y: 102, w: 36, h: 36 });
    expect(g.perdas).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Conteúdo interno do subprocesso "Cotar com fornecedores" (5 elementos)'),
        '1× objeto de dados',
        '1 fluxo de mensagem entre pools',
        '1 pool sem conteúdo (caixa preta)',
      ]),
    );
    expect(g.avisos).toContain('Evento de borda "Event_Prazo" convertido em evento intermediário depois da atividade "Activity_Cotar"');

    const { processo, relatorio } = normalizarGrafo(g, { formato: 'bpmn', ...fixo });
    const porOrigem = Object.fromEntries(processo.etapas.map((e) => [e.origem!.idOriginal, e]));
    expect(porOrigem.Activity_Cotar).toMatchObject({ tipo: 'subprocesso', ator: 'Compras' });
    expect(porOrigem.Activity_Pedido!.tipo).toBe('sistema');
    expect(porOrigem.Activity_Pagar!.tipo).toBe('sistema'); // scriptTask
    expect(porOrigem.Activity_Aprovar!.ator).toBe('Financeiro');
    expect(porOrigem.Gateway_Valor!.saidas.map((s) => s.rotulo)).toEqual(['SIM', 'NÃO']);
    expect(porOrigem.Event_Prazo!.tipo).toBe('intermediario');
    expect(porOrigem.TextAnnotation_1).toMatchObject({ tipo: 'anotacao', anotaEtapa: porOrigem.Activity_Cotar!.id });

    // Gateway convergente sem nome é válido; o subprocesso com 2 saídas (borda) é apontado
    const codigos = relatorio.problemas.map((x) => `${x.codigo}:${x.etapa}`);
    expect(codigos).not.toContain(`V08:${porOrigem.Gateway_Junta!.id}`);
    expect(codigos).toContain(`V17:${porOrigem.Activity_Cotar!.id}`);
    expect(analisar(processo).metricas.raias).toBe(3);
  });

  it('XML inválido gera erro claro', async () => {
    await expect(importarBpmn('<bpmn:definitions')).rejects.toThrow(/Não foi possível ler o BPMN/);
    await expect(
      importarBpmn('<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x"/>'),
    ).rejects.toThrow(/nenhum processo/);
  });

  it('detecção pelo conteúdo e pela extensão', () => {
    expect(importadorBpmn.detectar('qualquer.xml', amostra)).toBe(0.95);
    expect(importadorBpmn.detectar('fluxo.bpmn', '<?xml version="1.0"?><x/>')).toBe(0.6);
    expect(importadorBpmn.detectar('dados.xml', '<?xml version="1.0"?><mxfile/>')).toBe(0);
    expect(importadorBpmn.detectar('fluxo.bpmn', new TextEncoder().encode(amostra))).toBe(0.95);
  });
});
