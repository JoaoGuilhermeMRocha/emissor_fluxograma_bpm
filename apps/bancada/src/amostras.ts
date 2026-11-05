import type { GrafoImportado } from '@mapeador/core';

/**
 * Grafos intermediários de exemplo, imitando o que os importadores de
 * BPMN e draw.io vão produzir. Servem para testar a normalização antes de
 * os importadores existirem.
 */
export const AMOSTRAS_IMPORTACAO: Record<string, { rotulo: string; grafo: GrafoImportado }> = {
  bpmn: {
    rotulo: 'Simulação: BPMN do Camunda (com raias)',
    grafo: {
      titulo: 'Compra de Materiais',
      raias: [
        { id: 'Lane_Sol', nome: 'Solicitante', ordem: 0 },
        { id: 'Lane_Comp', nome: 'Compras', ordem: 1 },
        { id: 'Lane_Fin', nome: 'Financeiro', ordem: 2 },
        { id: 'Lane_Comp2', nome: 'compras', ordem: 3 },
      ],
      nos: [
        { id: 'StartEvent_1', rotulo: 'Necessidade identificada', forma: 'inicio', raiaId: 'Lane_Sol' },
        { id: 'Activity_0a1', rotulo: 'Abrir requisição', forma: 'tarefa', raiaId: 'Lane_Sol' },
        { id: 'Activity_0b2', rotulo: 'Cotar com fornecedores', forma: 'tarefa', raiaId: 'Lane_Comp' },
        { id: 'Gateway_1', rotulo: 'Valor acima de R$ 5 mil?', forma: 'decisao', raiaId: 'Lane_Comp2' },
        { id: 'Activity_0c3', rotulo: 'Aprovar orçamento', forma: 'tarefa', raiaId: 'Lane_Fin' },
        { id: 'Gateway_2', rotulo: '', forma: 'decisao', raiaId: 'Lane_Comp' },
        { id: 'Activity_0d4', rotulo: 'Emitir pedido no ERP', forma: 'sistema', raiaId: 'Lane_Comp' },
        { id: 'Activity_0e5', rotulo: 'Programar pagamento', forma: 'sistema', raiaId: 'Lane_Fin' },
        { id: 'EndEvent_1', rotulo: 'Pedido emitido', forma: 'fim', raiaId: 'Lane_Fin' },
        { id: 'TextAnnotation_1', rotulo: 'Mínimo de 3 cotações', forma: 'anotacao' },
      ],
      arestas: [
        { id: 'Flow_1', origem: 'StartEvent_1', destino: 'Activity_0a1' },
        { id: 'Flow_2', origem: 'Activity_0a1', destino: 'Activity_0b2' },
        { id: 'Flow_3', origem: 'Activity_0b2', destino: 'Gateway_1' },
        { id: 'Flow_4', origem: 'Gateway_1', destino: 'Activity_0c3', rotulo: 'Yes' },
        { id: 'Flow_5', origem: 'Gateway_1', destino: 'Gateway_2', rotulo: 'No' },
        { id: 'Flow_6', origem: 'Activity_0c3', destino: 'Gateway_2' },
        { id: 'Flow_7', origem: 'Gateway_2', destino: 'Activity_0d4' },
        { id: 'Flow_8', origem: 'Activity_0d4', destino: 'Activity_0e5' },
        { id: 'Flow_9', origem: 'Activity_0e5', destino: 'EndEvent_1' },
      ],
      associacoes: [{ anotacao: 'TextAnnotation_1', alvo: 'Activity_0b2' }],
      avisos: [],
      perdas: ['1 fluxo de mensagem entre "Compras" e a pool "Fornecedor"', '1 objeto de dados ("Requisição")'],
    },
  },
  drawio: {
    rotulo: 'Simulação: draw.io (sem raias, sem eventos, HTML nos rótulos)',
    grafo: {
      raias: [],
      nos: [
        { id: '2', rotulo: '<div><b>Receber</b> chamado</div>', forma: 'tarefa' },
        { id: '3', rotulo: 'Problema&nbsp;conhecido?', forma: 'decisao' },
        { id: '4', rotulo: 'Aplicar solu&ccedil;&atilde;o padr&atilde;o', forma: 'tarefa' },
        { id: '5', rotulo: 'Escalar para N2', forma: 'tarefa' },
        { id: '6', rotulo: 'Nuvem', forma: 'desconhecido' },
        { id: '7', rotulo: 'Ver base de conhecimento', forma: 'anotacao' },
      ],
      arestas: [
        { id: 'a', origem: '2', destino: '3' },
        { id: 'b', origem: '3', destino: '4', rotulo: 's' },
        { id: 'c', origem: '3', destino: '5', rotulo: 'n' },
        { id: 'd', origem: '5', destino: '6' },
        { id: 'e', origem: '7', destino: '4' },
        { id: 'f', origem: '4', destino: '99' },
      ],
      associacoes: [],
      avisos: [],
      perdas: [],
      rotulosHtml: true,
    },
  },
};
