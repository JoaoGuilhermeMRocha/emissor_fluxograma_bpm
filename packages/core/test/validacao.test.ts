import { describe, expect, it } from 'vitest';
import { criarProcesso, processoExemplo, temErros, validar, type Etapa, type Processo } from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

function com(etapas: Etapa[]): Processo {
  const p = criarProcesso(fixo);
  p.etapas = etapas;
  return p;
}

const codigos = (p: Processo) => validar(p).map((x) => (x.etapa ? `${x.codigo}:${x.etapa}` : x.codigo));

describe('validar', () => {
  it('processo vazio: sem início e sem fim', () => {
    expect(codigos(criarProcesso(fixo))).toEqual(['V01', 'V03']);
  });

  it('dois inícios, descrição vazia, ator ausente e destino ausente', () => {
    const p = com([
      { id: 'E01', tipo: 'inicio', descricao: 'A', saidas: [{ destino: 'E03' }] },
      { id: 'E02', tipo: 'inicio', descricao: 'B', saidas: [{ destino: 'E03' }] },
      { id: 'E03', tipo: 'tarefa', descricao: '  ', saidas: [{ destino: '' }] },
      { id: 'E04', tipo: 'fim', descricao: 'Fim', saidas: [] },
    ]);
    const c = codigos(p);
    expect(c).toEqual(expect.arrayContaining(['V02:E02', 'V04:E03', 'V05:E03', 'V06:E03', 'V15:E03']));
    expect(temErros(validar(p))).toBe(true);
  });

  it('referência inexistente e excesso de saídas', () => {
    const p = com([
      { id: 'E01', tipo: 'inicio', descricao: 'A', saidas: [{ destino: 'E02' }, { destino: 'E03' }] },
      { id: 'E02', tipo: 'fim', descricao: 'Fim', saidas: [{ destino: 'E99' }] },
    ]);
    const c = codigos(p);
    expect(c).toContain('V07:E02');
    expect(c).toContain('V17:E02');
    expect(c).toContain('V07:E01');
  });

  it('gateway: mínimo de saídas e rótulos', () => {
    const p = com([
      { id: 'E01', tipo: 'inicio', descricao: 'A', saidas: [{ destino: 'E02' }] },
      { id: 'E02', tipo: 'gw_exclusivo', descricao: 'Ok?', ator: 'X', saidas: [{ destino: 'E03' }, { destino: '', rotulo: 'NÃO' }] },
      { id: 'E03', tipo: 'fim', descricao: 'Fim', saidas: [] },
    ]);
    expect(codigos(p)).toEqual(expect.arrayContaining(['V08:E02', 'V09:E02']));
  });

  it('gateway baseado em eventos seguido de fim', () => {
    const p = com([
      { id: 'E01', tipo: 'inicio', descricao: 'A', saidas: [{ destino: 'E02' }] },
      { id: 'E02', tipo: 'gw_evento', descricao: 'Aguarda', ator: 'X', saidas: [{ destino: 'E03' }, { destino: 'E04' }] },
      { id: 'E03', tipo: 'intermediario', descricao: 'Resposta', evento: 'captura', saidas: [{ destino: 'E04' }] },
      { id: 'E04', tipo: 'fim', descricao: 'Fim', saidas: [] },
    ]);
    expect(codigos(p)).toContain('V12:E02');
  });

  it('inalcançável e beco sem saída', () => {
    const p = com([
      { id: 'E01', tipo: 'inicio', descricao: 'A', saidas: [{ destino: 'E02' }] },
      { id: 'E02', tipo: 'tarefa', descricao: 'B', ator: 'X', saidas: [{ destino: 'E03' }] },
      { id: 'E03', tipo: 'tarefa', descricao: 'C', ator: 'X', saidas: [{ destino: 'E02' }] },
      { id: 'E04', tipo: 'fim', descricao: 'Fim', saidas: [] },
    ]);
    const c = codigos(p);
    expect(c).toContain('V10:E04');
    expect(c).toEqual(expect.arrayContaining(['V11:E01', 'V11:E02', 'V11:E03']));
  });

  it('anotação solta e ids duplicados', () => {
    const p = processoExemplo(fixo);
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Nota', saidas: [] });
    p.etapas.push({ id: 'E02', tipo: 'tarefa', descricao: 'Duplicada', ator: 'X', saidas: [{ destino: 'E03' }] });
    const c = codigos(p);
    expect(c).toContain('V13:E10');
    expect(c).toContain('V14:E02');
  });

  it('saídas repetidas para o mesmo destino', () => {
    const p = processoExemplo(fixo);
    p.etapas[3]!.saidas.push({ destino: 'E05' });
    expect(codigos(p)).toContain('V18:E04');
  });

  it('ordena por severidade', () => {
    const p = processoExemplo(fixo);
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Nota', saidas: [] });
    p.etapas[1]!.ator = '';
    const sev = validar(p).map((x) => x.severidade);
    expect(sev).toEqual([...sev].sort((a, b) => ['erro', 'aviso', 'info'].indexOf(a) - ['erro', 'aviso', 'info'].indexOf(b)));
  });
});
