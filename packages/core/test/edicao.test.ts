import { describe, expect, it } from 'vitest';
import {
  adicionarEtapa,
  atualizarEtapa,
  criarProcesso,
  ErroEdicao,
  excluirEtapa,
  inserirEntre,
  ligarEmSequencia,
  processoExemplo,
  proximoIdEtapa,
  trocarTipo,
  validar,
} from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

describe('ids', () => {
  it('próximo id = maior + 1, com 2 dígitos no mínimo', () => {
    expect(proximoIdEtapa([])).toBe('E01');
    expect(proximoIdEtapa([{ id: 'E01' }, { id: 'E09' }, { id: 'E03' }])).toBe('E10');
    expect(proximoIdEtapa([{ id: 'E99' }])).toBe('E100');
  });
});

describe('adicionarEtapa', () => {
  it('canoniza o ator e limpa textos', () => {
    const p = processoExemplo(fixo);
    const { processo, id } = adicionarEtapa(p, { tipo: 'tarefa', descricao: '  Arquivar   processo ', ator: 'area  responsavel' });
    const e = processo.etapas.find((x) => x.id === id)!;
    expect(id).toBe('E10');
    expect(e.descricao).toBe('Arquivar processo');
    expect(e.ator).toBe('Área Responsável');
    expect(e.saidas).toEqual([{ destino: '' }]);
  });

  it('decisão nova nasce com SIM e NÃO; não altera o original', () => {
    const p = criarProcesso(fixo);
    const { processo } = adicionarEtapa(p, { tipo: 'gw_exclusivo', descricao: 'Ok?', ator: 'X' });
    expect(processo.etapas[0]!.saidas).toEqual([{ destino: '', rotulo: 'SIM' }, { destino: '', rotulo: 'NÃO' }]);
    expect(p.etapas).toHaveLength(0);
  });

  it('remove campos que não cabem no tipo', () => {
    const p = criarProcesso(fixo);
    const { processo } = adicionarEtapa(p, { tipo: 'inicio', descricao: 'Começa', ator: 'Alguém', resultado: 'Aprovado' });
    expect(processo.etapas[0]).toEqual({ id: 'E01', tipo: 'inicio', descricao: 'Começa', saidas: [{ destino: '' }] });
  });

  it('insere depois de uma etapa específica', () => {
    const { processo } = adicionarEtapa(processoExemplo(fixo), { tipo: 'tarefa', descricao: 'X', ator: 'A' }, { depoisDe: 'E02' });
    expect(processo.etapas.map((e) => e.id).slice(0, 4)).toEqual(['E01', 'E02', 'E10', 'E03']);
  });
});

describe('excluirEtapa', () => {
  it('limpa todas as referências e preserva rótulos', () => {
    const p = processoExemplo(fixo);
    p.raci.porEtapa.E05 = { aprovadores: ['Gerência'], consultados: [], informados: [] };
    p.layout.posicoes.E05 = { x: 10, y: 20 };
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Prazo de 2 dias', anotaEtapa: 'E05', saidas: [] });

    const q = excluirEtapa(p, 'E05');
    expect(q.etapas.find((e) => e.id === 'E05')).toBeUndefined();
    expect(q.etapas.find((e) => e.id === 'E04')!.saidas).toEqual([{ destino: '', rotulo: 'SIM' }, { destino: 'E06', rotulo: 'NÃO' }]);
    expect(q.raci.porEtapa.E05).toBeUndefined();
    expect(q.layout.posicoes.E05).toBeUndefined();
    expect(q.etapas.find((e) => e.id === 'E10')!.anotaEtapa).toBeUndefined();

    const codigos = validar(q).map((x) => `${x.codigo}:${x.etapa ?? ''}`);
    expect(codigos).toContain('V08:E04');
    expect(codigos).toContain('V10:E08'); // fim ficou inalcançável
    expect(codigos).toContain('V13:E10');
  });

  it('erro para etapa inexistente', () => {
    expect(() => excluirEtapa(processoExemplo(fixo), 'E77')).toThrow(ErroEdicao);
  });
});

describe('ligarEmSequencia', () => {
  it('liga só quem está sem destino, pulando anotações', () => {
    let p = criarProcesso(fixo);
    p = adicionarEtapa(p, { tipo: 'inicio', descricao: 'Início' }).processo;
    p = adicionarEtapa(p, { tipo: 'anotacao', descricao: 'Nota' }).processo;
    p = adicionarEtapa(p, { tipo: 'tarefa', descricao: 'Fazer', ator: 'A' }).processo;
    p = adicionarEtapa(p, { tipo: 'fim', descricao: 'Fim' }).processo;
    const q = ligarEmSequencia(p);
    expect(q.etapas.map((e) => e.saidas)).toEqual([[{ destino: 'E03' }], [], [{ destino: 'E04' }], []]);
  });
});

describe('inserirEntre', () => {
  it('religa as setas automaticamente', () => {
    const { processo, id } = inserirEntre(processoExemplo(fixo), 'E04', 'E06', { tipo: 'sistema', descricao: 'Registrar pendência', ator: 'Sistema' });
    expect(id).toBe('E10');
    expect(processo.etapas.find((e) => e.id === 'E04')!.saidas[1]).toEqual({ destino: 'E10', rotulo: 'NÃO' });
    expect(processo.etapas.find((e) => e.id === 'E10')!.saidas).toEqual([{ destino: 'E06' }]);
    expect(validar(processo).filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('recusa etapas sem ligação ou sem saída', () => {
    const p = processoExemplo(fixo);
    expect(() => inserirEntre(p, 'E02', 'E05', { tipo: 'tarefa', descricao: 'x', ator: 'a' })).toThrow(ErroEdicao);
    expect(() => inserirEntre(p, 'E02', 'E03', { tipo: 'fim', descricao: 'x' })).toThrow(ErroEdicao);
  });
});

describe('trocarTipo e atualizarEtapa', () => {
  it('troca dentro da família', () => {
    const q = trocarTipo(processoExemplo(fixo), 'E02', 'sistema');
    expect(q.etapas.find((e) => e.id === 'E02')!.tipo).toBe('sistema');
  });

  it('recusa troca entre famílias', () => {
    expect(() => trocarTipo(processoExemplo(fixo), 'E02', 'gw_paralelo')).toThrow(ErroEdicao);
  });

  it('gateway com menos saídas ganha as que faltam', () => {
    let p = criarProcesso(fixo);
    p = adicionarEtapa(p, { tipo: 'gw_complexo', descricao: 'Regra', ator: 'A', regra: 'se valor > 10' }).processo;
    const q = trocarTipo(p, 'E01', 'gw_paralelo');
    expect(q.etapas[0]!.saidas).toHaveLength(2);
    expect(q.etapas[0]!.regra).toBeUndefined();
  });

  it('atualiza campos sem mudar id nem tipo', () => {
    const q = atualizarEtapa(processoExemplo(fixo), 'E02', { descricao: 'Receber pedido', apoio: '' });
    const e = q.etapas.find((x) => x.id === 'E02')!;
    expect(e.descricao).toBe('Receber pedido');
    expect(e.apoio).toBeUndefined();
    expect(e.tipo).toBe('tarefa');
  });
});
