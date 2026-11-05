import { beforeEach, describe, expect, it } from 'vitest';
import {
  adicionarEtapa,
  calcularLayout,
  exportarBpmn,
  importarBpmn,
  mesclarDoDiagrama,
  processoExemplo,
  validar,
  type GrafoImportado,
  type Processo,
} from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

/** Simula o ciclo do editor: modelo → BPMN → (usuário mexe no grafo) → mescla. */
async function editar(p: Processo, mexer: (g: GrafoImportado) => void): Promise<Processo> {
  const layout = calcularLayout(p);
  const [g] = await importarBpmn(exportarBpmn(p, { layout }));
  mexer(g!);
  return mesclarDoDiagrama(p, g!, layout);
}

const raiaId = (g: GrafoImportado, nome: string) => g.raias.find((r) => r.nome === nome)!.id;
const no = (g: GrafoImportado, id: string) => g.nos.find((n) => n.id === id)!;

describe('mesclar edições do diagrama no modelo', () => {
  let p: Processo;
  beforeEach(() => {
    p = processoExemplo(fixo);
    p.raci.porEtapa.E05 = { aprovadores: ['Gerência'], consultados: [], informados: [] };
  });

  it('sem mudanças, o processo fica idêntico', async () => {
    expect(await editar(p, () => {})).toEqual(p);
  });

  it('renomear etapa e pool preserva o resto', async () => {
    const q = await editar(p, (g) => {
      no(g, 'E02').rotulo = 'Receber   pedido';
      g.titulo = 'Aprovação de Pedido';
    });
    expect(q.nome).toBe('Aprovação de Pedido');
    expect(q.etapas[1]).toEqual({ ...p.etapas[1], descricao: 'Receber pedido' });
  });

  it('excluir limpa referências e mantém o rótulo pendente', async () => {
    const q = await editar(p, (g) => {
      g.nos = g.nos.filter((n) => n.id !== 'E05');
      g.arestas = g.arestas.filter((a) => a.origem !== 'E05' && a.destino !== 'E05');
    });
    expect(q.etapas.map((e) => e.id)).not.toContain('E05');
    expect(q.etapas.find((e) => e.id === 'E04')!.saidas).toEqual([{ destino: '', rotulo: 'SIM' }, { destino: 'E06', rotulo: 'NÃO' }]);
    expect(q.raci.porEtapa.E05).toBeUndefined();
  });

  it('criar etapa no meio de uma seta', async () => {
    const q = await editar(p, (g) => {
      g.arestas = g.arestas.filter((a) => !(a.origem === 'E06' && a.destino === 'E07'));
      g.nos.push({ id: 'Activity_0abc', rotulo: 'Registrar pendência', forma: 'sistema', raiaId: raiaId(g, 'Atendimento') });
      g.arestas.push({ id: 'f1', origem: 'E06', destino: 'Activity_0abc' }, { id: 'f2', origem: 'Activity_0abc', destino: 'E07' });
    });
    const ids = q.etapas.map((e) => e.id);
    expect(ids.indexOf('E10')).toBe(ids.indexOf('E06') + 1);
    expect(q.etapas.find((e) => e.id === 'E06')!.saidas).toEqual([{ destino: 'E10' }]);
    expect(q.etapas.find((e) => e.id === 'E10')).toEqual({ id: 'E10', tipo: 'sistema', descricao: 'Registrar pendência', ator: 'Atendimento', saidas: [{ destino: 'E07' }] });
    expect(validar(q).filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('arrastar para outra raia troca o responsável e guarda a posição relativa', async () => {
    const layout = calcularLayout(p);
    const q = await editar(p, (g) => {
      const n = no(g, 'E06');
      n.raiaId = raiaId(g, 'Área Responsável');
      n.caixa = { ...n.caixa!, y: n.caixa!.y + 200 };
    });
    const e06 = q.etapas.find((e) => e.id === 'E06')!;
    expect(e06.ator).toBe('Área Responsável');
    const raia = layout.raias.find((r) => r.nome === 'Área Responsável')!;
    const antes = layout.nos.find((n) => n.id === 'E06')!;
    expect(q.layout.posicoes.E06).toEqual({ x: antes.x + antes.w / 2, y: antes.y + antes.h / 2 + 200 - raia.y });
  });

  it('arrastar dentro da raia só guarda a posição', async () => {
    const q = await editar(p, (g) => {
      no(g, 'E05').caixa!.x += 40;
    });
    expect(q.etapas.find((e) => e.id === 'E05')!.ator).toBe('Área Responsável');
    expect(Object.keys(q.layout.posicoes)).toEqual(['E05']);
  });

  it('renomear a raia renomeia o responsável das suas etapas', async () => {
    const q = await editar(p, (g) => {
      g.raias.find((r) => r.nome === 'Atendimento')!.nome = 'Recepção';
    });
    expect(q.etapas.filter((e) => e.ator === 'Recepção').map((e) => e.id)).toEqual(['E02', 'E06', 'E07']);
    expect(q.etapas[0]!.ator).toBeUndefined(); // início não tem responsável
  });

  it('ligar uma decisão preenche a saída pendente com o rótulo dela', async () => {
    let r = adicionarEtapa(p, { tipo: 'gw_exclusivo', descricao: 'Urgente?', ator: 'Atendimento' }, { depoisDe: 'E09' });
    const comDecisao = r.processo;
    const q = await editar(comDecisao, (g) => {
      g.arestas.push({ id: 'n1', origem: r.id, destino: 'E09' });
    });
    expect(q.etapas.find((e) => e.id === r.id)!.saidas).toEqual([{ destino: 'E09', rotulo: 'SIM' }, { destino: '', rotulo: 'NÃO' }]);
    r = { processo: q, id: r.id };
  });

  it('trocar o tipo pelo menu do editor mantém o apoio', async () => {
    const q = await editar(p, (g) => {
      no(g, 'E02').forma = 'sistema';
    });
    expect(q.etapas[1]).toMatchObject({ tipo: 'sistema', apoio: 'Formulário', ator: 'Atendimento' });
  });

  it('anotação criada e ligada no diagrama', async () => {
    const q = await editar(p, (g) => {
      g.nos.push({ id: 'TextAnnotation_1', rotulo: 'Prazo: 2 dias', forma: 'anotacao' });
      g.associacoes.push({ anotacao: 'TextAnnotation_1', alvo: 'E03' });
    });
    expect(q.etapas.at(-1)).toEqual({ id: 'E10', tipo: 'anotacao', descricao: 'Prazo: 2 dias', anotaEtapa: 'E03', saidas: [] });
  });
});
