import { describe, expect, it } from 'vitest';
import {
  analisar,
  construirGrafo,
  arestasDeRetorno,
  montarMatrizRaci,
  ordemDasRaias,
  processoExemplo,
  ProcessoSchema,
  resolverRaias,
  resumoCaminhos,
  validar,
} from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

describe('exemplo de referência (§4.5)', () => {
  const p = processoExemplo(fixo);

  it('obedece ao schema', () => {
    expect(ProcessoSchema.safeParse(p).success).toBe(true);
  });

  it('resolve as raias, herdando nos eventos', () => {
    const raias = resolverRaias(p);
    expect(raias.get('E01')).toBe('Atendimento'); // início herda do destino
    expect(raias.get('E08')).toBe('Área Responsável'); // fim herda de quem aponta
    expect(raias.get('E09')).toBe('Atendimento');
    expect(ordemDasRaias(p, raias)).toEqual(['Atendimento', 'Área Responsável']);
  });

  it('não tem erros nem avisos; só sugestões de aprovador', () => {
    const problemas = validar(p);
    expect(problemas.filter((x) => x.severidade !== 'info')).toEqual([]);
    expect(problemas.map((x) => x.etapa)).toEqual(['E02', 'E03', 'E05', 'E06']);
    expect(problemas.every((x) => x.codigo === 'V16')).toBe(true);
  });

  it('detecta o retorno E07 → E03 e os dois caminhos', () => {
    const g = construirGrafo(p);
    expect(arestasDeRetorno(g)).toEqual([{ origem: 'E07', destino: 'E03', rotulo: 'SIM' }]);
    expect(resumoCaminhos(g)).toEqual({ total: 2, porFim: { E08: 1, E09: 1 }, menor: 6, maior: 7 });
  });

  it('calcula métricas, score e nível', () => {
    const a = analisar(p);
    expect(a.metricas).toMatchObject({
      total: 9, tarefas: 4, sistemicas: 0, gateways: 2, raias: 2, retornos: 1, handoffs: 3, automacao: 0,
    });
    expect(a.metricas.gatewaysPorTipo).toEqual({ gw_exclusivo: 2 });
    expect(a.handoffs).toEqual([
      { de: 'Atendimento', para: 'Área Responsável', vezes: 2 },
      { de: 'Área Responsável', para: 'Atendimento', vezes: 1 },
    ]);
    // 9 + 2×2 + 2×2 + 1×3 + 3 = 23
    expect(a.score).toBe(23);
    expect(a.nivel).toBe('Média');
    expect(a.concentracao).toEqual({ raia: 'Atendimento', atividades: 2, percentual: 50 });
  });

  it('checklist e recomendações refletem RACI e parecer pendentes', () => {
    const a = analisar(p);
    expect(a.checklist.filter((c) => !c.ok).map((c) => c.chave)).toEqual(['raci', 'parecer']);
    expect(a.qualidade).toBe(75);
    expect(a.recomendacoes).toEqual([
      'Analisar causas dos retornos para reduzir retrabalho',
      'Avaliar automação de atividades repetitivas',
      'Gerar e revisar a Matriz RACI',
    ]);
  });

  it('limiares configuráveis mudam o nível', () => {
    const a = analisar(p, {
      limiares: { critica: 30, alta: 20, media: 10 },
      pesos: { etapa: 1, gateway: 2, raia: 2, retorno: 3, handoff: 1 },
      recomendacoes: { handoffs: 3, automacaoMin: 0, concentracaoMax: 50 },
    });
    expect(a.nivel).toBe('Alta');
    expect(a.recomendacoes).toContain('Padronizar entradas e saídas entre áreas');
    expect(a.recomendacoes).not.toContain('Avaliar automação de atividades repetitivas');
  });

  it('monta a RACI automática', () => {
    const m = montarMatrizRaci(p);
    expect(m.atores).toEqual(['Atendimento', 'Área Responsável']);
    expect(m.linhas.map((l) => l.etapa)).toEqual(['E02', 'E03', 'E04', 'E05', 'E06', 'E07']);
    const e04 = m.linhas.find((l) => l.etapa === 'E04')!;
    expect(e04.celulas).toEqual([[], ['A']]);
    expect(e04.condicional).toBe('SIM / NÃO');
    const e02 = m.linhas.find((l) => l.etapa === 'E02')!;
    expect(e02.celulas).toEqual([['R'], []]);
    expect(e02.condicional).toBe('Não informado');
    expect(e02.apoio).toBe('Formulário');
  });

  it('RACI manual soma A, C e I e cria colunas novas', () => {
    const q = structuredClone(p);
    q.raci.porEtapa.E05 = { aprovadores: ['Gerência'], consultados: ['jurídico'], informados: ['atendimento'] };
    q.raci.atoresExtras = ['Jurídico'];
    const m = montarMatrizRaci(q);
    expect(m.atores).toEqual(['Atendimento', 'Área Responsável', 'Jurídico', 'Gerência']);
    const e05 = m.linhas.find((l) => l.etapa === 'E05')!;
    expect(e05.celulas).toEqual([['I'], ['R'], ['C'], ['A']]);
  });
});
