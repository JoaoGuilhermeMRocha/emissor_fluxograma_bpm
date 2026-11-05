import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abrirArquivo, analisar, ehSvgFluid, importadorFluidSvg, importarSvgFluid, normalizarGrafo, validar } from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'p' };
const svg = readFileSync(new URL('./amostras/fluid-exemplo.svg', import.meta.url), 'utf8');

describe('importar SVG do Fluid', () => {
  it('detecta nós, responsáveis, setas e infere os tipos', () => {
    const [g] = importarSvgFluid(svg);
    expect(g!.nos.map((n) => `${n.id}:${n.forma}:${n.rotulo}`)).toEqual([
      '10:inicio:Começa aqui',
      '20:tarefa:Receber pedido',
      '30:decisao:Pedido completo?', // 2 saídas (40 e 20)
      '40:tarefa:Faturar',
      '50:fim:Processo concluído',
    ]);
    expect(g!.nos.find((n) => n.id === '20')!.raiaId).toBeTruthy();
    expect(g!.nos.find((n) => n.id === '20')!.extras).toEqual({ apoio: 'Tempo estimado: 02h úteis*' });
    expect(g!.nos.find((n) => n.id === '10')!.raiaId).toBeUndefined(); // início não tem responsável
    expect(g!.arestas).toHaveLength(5);
    expect(g!.raias.map((r) => r.nome)).toEqual(['Atendimento', 'Triagem', 'Financeiro']);
  });

  it('normaliza para um processo coerente', () => {
    const { processo, relatorio } = normalizarGrafo(importarSvgFluid(svg)[0]!, { formato: 'fluid-svg', ...fixo });
    expect(processo.etapas.map((e) => e.id)).toEqual(['E01', 'E02', 'E03', 'E04', 'E05']);
    const e02 = processo.etapas.find((e) => e.origem?.idOriginal === '20')!;
    expect(e02).toMatchObject({ tipo: 'tarefa', ator: 'Atendimento', apoio: 'Tempo estimado: 02h úteis*' });
    expect(processo.etapas.find((e) => e.origem?.idOriginal === '30')!.tipo).toBe('gw_exclusivo');
    // retorno 30 -> 20 é detectado
    expect(analisar(processo).metricas.retornos).toBe(1);
    expect(relatorio.avisos.some((a) => a.includes('2+ saídas'))).toBe(true);
    // decisão sem rótulo gera aviso, não erro
    expect(relatorio.problemas.filter((x) => x.severidade === 'erro' && x.codigo === 'V09')).toEqual([]);
  });

  it('é escolhido pela detecção de formato e recusa SVG comum', async () => {
    expect(importadorFluidSvg.detectar('x.svg', svg)).toBe(0.95);
    expect(ehSvgFluid('<svg><rect/></svg>')).toBe(false);
    expect(importadorFluidSvg.detectar('logo.svg', '<svg><rect/></svg>')).toBe(0);
    const r = await abrirArquivo('fluxo.svg', new TextEncoder().encode(svg));
    expect(r.tipo === 'importacao' && r.importador.formato).toBe('fluid-svg');
  });
});
