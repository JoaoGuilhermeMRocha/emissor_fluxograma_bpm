import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abrirArquivo, EXTENSOES_ACEITAS, exportarBpmn, exportarXlsx, processoExemplo, serializarProcesso } from '../src';

const bytes = (s: string) => new TextEncoder().encode(s);
const p = processoExemplo({ agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' });

describe('abrir arquivo com detecção de formato', () => {
  it('reconhece cada formato', async () => {
    expect((await abrirArquivo('a.processo', bytes(serializarProcesso(p)))).tipo).toBe('processo');
    expect((await abrirArquivo('sem-extensao', bytes(serializarProcesso(p)))).tipo).toBe('processo');
    const bpmn = await abrirArquivo('exportado.xml', bytes(exportarBpmn(p)));
    expect(bpmn.tipo === 'importacao' && bpmn.importador.formato).toBe('bpmn');
    const xlsx = await abrirArquivo('etapas.xlsx', exportarXlsx(p));
    expect(xlsx.tipo === 'importacao' && xlsx.importador.formato).toBe('planilha');
    const camunda = new Uint8Array(readFileSync(new URL('./amostras/camunda-compras.bpmn', import.meta.url)));
    const r = await abrirArquivo('compras.bpmn', camunda);
    expect(r.tipo === 'importacao' && r.grafos[0]!.titulo).toBe('Compra de Materiais');
  });

  it('erros claros', async () => {
    expect(await abrirArquivo('foto.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toMatchObject({ tipo: 'erro', erro: expect.stringContaining('Formato não reconhecido') });
    expect(await abrirArquivo('ruim.bpmn', bytes('<bpmn:definitions'))).toMatchObject({ tipo: 'erro', erro: expect.stringContaining('Não foi possível ler o BPMN') });
    expect(await abrirArquivo('x.csv', bytes('a;b\n1;2'))).toMatchObject({ tipo: 'erro', erro: expect.stringContaining('cabeçalho') });
    expect(EXTENSOES_ACEITAS).toEqual(['.processo', '.bpmn', '.xml', '.csv', '.xlsx', '.txt']);
  });
});
