import { describe, expect, it } from 'vitest';
import { analisar, normalizarGrafo, padronizarRotulo, relatorioEmTexto, textoDeRotulo, type GrafoImportado } from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

describe('textos importados', () => {
  it('remove HTML e decodifica entidades (só para origens em HTML)', () => {
    expect(textoDeRotulo('<div>Analisar<br>documenta&ccedil;&atilde;o &amp; anexos</div>')).toBe('Analisar documentação & anexos');
    expect(textoDeRotulo('&Aacute;REA &ndash; Opera&ccedil;&otilde;es')).toBe('ÁREA – Operações');
    expect(textoDeRotulo('&inexistente;')).toBe('&inexistente;');
    expect(textoDeRotulo('Aprovar&nbsp;<b>pedido</b>&#33; &#x2713;')).toBe('Aprovar pedido! ✓');
  });

  it('padroniza respostas de decisão', () => {
    expect(['sim', 'S', 'Yes', 'verdadeiro'].map(padronizarRotulo)).toEqual(['SIM', 'SIM', 'SIM', 'SIM']);
    expect(['nao', 'Não', 'no', 'N'].map(padronizarRotulo)).toEqual(['NÃO', 'NÃO', 'NÃO', 'NÃO']);
    expect(padronizarRotulo('Valor > 10 mil')).toBe('Valor > 10 mil');
  });
});

/** Simula o que um importador de BPMN produziria para o exemplo, com raias e ids "de ferramenta". */
function grafoComRaias(): GrafoImportado {
  return {
    titulo: 'Aprovação de Solicitação',
    raias: [
      { id: 'Lane_A', nome: 'Atendimento', ordem: 0 },
      { id: 'Lane_B', nome: 'Área Responsável', ordem: 1 },
      { id: 'Lane_C', nome: 'area responsavel', ordem: 2 }, // duplicada com outra grafia
    ],
    nos: [
      { id: 'Task_3', rotulo: 'Analisar documentação', forma: 'tarefa', raiaId: 'Lane_B', caixa: { x: 400, y: 200, w: 100, h: 80 } },
      { id: 'Start_1', rotulo: 'Cliente envia solicitação', forma: 'inicio', raiaId: 'Lane_A', caixa: { x: 100, y: 50, w: 36, h: 36 } },
      { id: 'Task_2', rotulo: 'Receber solicitação', forma: 'tarefa', raiaId: 'Lane_A' },
      { id: 'Gw_1', rotulo: 'Documentação está correta?', forma: 'decisao', raiaId: 'Lane_C' },
      { id: 'Task_5', rotulo: 'Aprovar solicitação', forma: 'sistema', raiaId: 'Lane_B' },
      { id: 'End_1', rotulo: 'Solicitação aprovada', forma: 'fim', raiaId: 'Lane_B' },
      { id: 'Note_1', rotulo: 'Prazo: 2 dias úteis', forma: 'anotacao' },
    ],
    arestas: [
      { id: 'f1', origem: 'Start_1', destino: 'Task_2' },
      { id: 'f2', origem: 'Task_2', destino: 'Task_3' },
      { id: 'f3', origem: 'Task_3', destino: 'Gw_1' },
      { id: 'f4', origem: 'Gw_1', destino: 'Task_5', rotulo: 'sim' },
      { id: 'f5', origem: 'Gw_1', destino: 'Task_2', rotulo: 'Não' },
      { id: 'f6', origem: 'Task_5', destino: 'End_1' },
      { id: 'f7', origem: 'Task_5', destino: 'Fantasma' },
    ],
    associacoes: [{ anotacao: 'Note_1', alvo: 'Task_3' }],
    avisos: [],
    perdas: ['1 fluxo de mensagem entre pools'],
  };
}

describe('normalizarGrafo', () => {
  it('renumera na ordem do fluxo e guarda o id de origem', () => {
    const { processo } = normalizarGrafo(grafoComRaias(), { formato: 'bpmn', ...fixo });
    expect(processo.nome).toBe('Aprovação de Solicitação');
    expect(processo.etapas.map((e) => `${e.id}=${e.origem?.idOriginal}`)).toEqual([
      'E01=Start_1', 'E02=Task_2', 'E03=Task_3', 'E04=Gw_1', 'E05=Task_5', 'E06=End_1', 'E07=Note_1',
    ]);
  });

  it('converte formas, raias, rótulos e anotações', () => {
    const { processo } = normalizarGrafo(grafoComRaias(), { formato: 'bpmn', ...fixo });
    const e = Object.fromEntries(processo.etapas.map((x) => [x.id, x]));
    expect(e.E01!.ator).toBeUndefined(); // eventos de início não têm ator
    expect(e.E04).toMatchObject({ tipo: 'gw_exclusivo', ator: 'Área Responsável' }); // raia duplicada unificada
    expect(e.E04!.saidas).toEqual([{ destino: 'E05', rotulo: 'SIM' }, { destino: 'E02', rotulo: 'NÃO' }]);
    expect(e.E05!.tipo).toBe('sistema');
    expect(e.E06).toMatchObject({ tipo: 'fim', resultado: 'Finalizado' });
    expect(e.E06!.ator).toBeUndefined(); // herdaria a mesma raia de quem aponta para ele
    expect(e.E07).toMatchObject({ tipo: 'anotacao', anotaEtapa: 'E03' });
    expect(processo.layout.ordemRaias).toEqual(['Atendimento', 'Área Responsável']);
    expect(processo.layout.posicoes).toEqual({});
  });

  it('mantém o desenho original quando pedido', () => {
    const { processo } = normalizarGrafo(grafoComRaias(), { formato: 'bpmn', manterLayout: true, ...fixo });
    expect(processo.layout.posicoes).toEqual({ E01: { x: 100, y: 50 }, E03: { x: 400, y: 200 } });
  });

  it('relatório: contagens, mapeamentos, perdas e avisos', () => {
    const { relatorio } = normalizarGrafo(grafoComRaias(), { formato: 'bpmn', ...fixo });
    expect(relatorio.contagens).toEqual({ etapas: 6, setas: 6, raias: 2, anotacoes: 1 });
    expect(relatorio.mapeamentos).toContainEqual({ forma: 'decisao', tipo: 'gw_exclusivo', quantidade: 1 });
    expect(relatorio.perdas).toEqual(['1 fluxo de mensagem entre pools']);
    expect(relatorio.avisos).toEqual(['Seta "f7" ignorada: liga elementos que não existem']);
    expect(relatorio.problemas.filter((p) => p.severidade === 'erro')).toEqual([]);
    expect(relatorioEmTexto(relatorio)).toContain('Perdas:\n  - 1 fluxo de mensagem entre pools');
  });

  it('fluxo sem raias e sem eventos (estilo draw.io): sugere início e fim', () => {
    const g: GrafoImportado = {
      raias: [],
      nos: [
        { id: '2', rotulo: '<b>Conferir</b> pedido', forma: 'tarefa' },
        { id: '3', rotulo: 'Está completo?', forma: 'decisao' },
        { id: '4', rotulo: 'Faturar', forma: 'tarefa' },
        { id: '5', rotulo: 'Nuvem', forma: 'desconhecido' },
        { id: '6', rotulo: 'obs', forma: 'anotacao' },
      ],
      arestas: [
        { id: 'a', origem: '2', destino: '3' },
        { id: 'b', origem: '3', destino: '4', rotulo: 'S' },
        { id: 'c', origem: '3', destino: '5', rotulo: 'N' },
        { id: 'd', origem: '6', destino: '4' }, // linha ligando a nota → associação
      ],
      associacoes: [],
      avisos: [],
      perdas: [],
      rotulosHtml: true,
    };
    const { processo, relatorio } = normalizarGrafo(g, { formato: 'drawio', ...fixo });
    expect(processo.nome).toBe('Processo importado');
    expect(processo.etapas[0]!.descricao).toBe('Conferir pedido');
    expect(processo.etapas.find((e) => e.tipo === 'anotacao')!.anotaEtapa).toBe('E03');
    expect(relatorio.sugestoes).toEqual({ inicio: ['E01'], fim: ['E03', 'E04'] });
    expect(relatorio.avisos).toContain('E04 ("Nuvem"): forma não reconhecida, importada como tarefa');
    const codigos = relatorio.problemas.map((p) => p.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['V01', 'V03', 'V05']));
  });

  it('aceita gateway convergente e avisa sobre paralelo implícito', () => {
    const g: GrafoImportado = {
      raias: [{ id: 'L', nome: 'Equipe', ordem: 0 }],
      nos: [
        { id: 's', rotulo: 'Início', forma: 'inicio', raiaId: 'L' },
        { id: 't1', rotulo: 'Separar', forma: 'tarefa', raiaId: 'L' },
        { id: 'a', rotulo: 'Embalar', forma: 'tarefa', raiaId: 'L' },
        { id: 'b', rotulo: 'Emitir nota', forma: 'sistema', raiaId: 'L' },
        { id: 'j', rotulo: 'Junta', forma: 'paralelo', raiaId: 'L' },
        { id: 'e', rotulo: 'Fim', forma: 'fim', raiaId: 'L' },
      ],
      arestas: [
        { id: '1', origem: 's', destino: 't1' },
        { id: '2', origem: 't1', destino: 'a' },
        { id: '3', origem: 't1', destino: 'b' },
        { id: '4', origem: 'a', destino: 'j' },
        { id: '5', origem: 'b', destino: 'j' },
        { id: '6', origem: 'j', destino: 'e' },
      ],
      associacoes: [],
      avisos: [],
      perdas: [],
    };
    const { relatorio, processo } = normalizarGrafo(g, { formato: 'bpmn', ...fixo });
    expect(relatorio.avisos).toEqual([
      'E02 tem 2 saídas. Em BPMN isso equivale a um paralelo implícito: considere inserir um gateway',
    ]);
    const codigos = relatorio.problemas.map((p) => `${p.codigo}:${p.etapa}`);
    expect(codigos).toContain('V17:E02');
    expect(codigos.some((c) => c.startsWith('V08'))).toBe(false); // convergente é válido
    expect(analisar(processo).caminhos.total).toBe(2);
  });

  it('ids repetidos na origem são renomeados', () => {
    const g: GrafoImportado = {
      raias: [],
      nos: [
        { id: 'x', rotulo: 'A', forma: 'inicio' },
        { id: 'x', rotulo: 'B', forma: 'fim' },
      ],
      arestas: [],
      associacoes: [],
      avisos: [],
      perdas: [],
    };
    const { processo, relatorio } = normalizarGrafo(g, { formato: 'teste', ...fixo });
    expect(processo.etapas.map((e) => e.origem?.idOriginal)).toEqual(['x', 'x#2']);
    expect(relatorio.avisos[0]).toMatch(/repetido/);
  });
});
