/**
 * Tradução do editor bpmn-js para pt-BR (dicas da paleta, ações da forma
 * selecionada e menu "Trocar tipo"). Texto sem tradução aparece em inglês.
 */

/** @type {Record<string, string>} */
const TEXTOS = {
  // ferramentas
  'Activate hand tool': 'Mover a tela',
  'Activate lasso tool': 'Selecionar várias',
  'Activate create/remove space tool': 'Abrir ou fechar espaço',
  'Activate global connect tool': 'Ligar formas',

  // ações na forma selecionada
  'Append task': 'Acrescentar tarefa',
  'Append gateway': 'Acrescentar decisão',
  'Append end event': 'Acrescentar fim',
  'Append intermediate/boundary event': 'Acrescentar evento intermediário',
  'Append receive task': 'Acrescentar tarefa de recebimento',
  'Append message intermediate catch event': 'Acrescentar espera de mensagem',
  'Append timer intermediate catch event': 'Acrescentar espera de tempo',
  'Append conditional intermediate catch event': 'Acrescentar espera de condição',
  'Append signal intermediate catch event': 'Acrescentar espera de sinal',
  'Append compensation activity': 'Acrescentar atividade de compensação',
  'Add text annotation': 'Acrescentar anotação',
  'Connect to other element': 'Ligar a outra forma',
  'Connect using association': 'Ligar por associação',
  'Connect using data input association': 'Ligar por associação de dados',
  'Change element': 'Trocar tipo',
  Delete: 'Excluir',
  'Add lane above': 'Acrescentar raia acima',
  'Add lane below': 'Acrescentar raia abaixo',
  'Divide into two lanes': 'Dividir em duas raias',
  'Divide into three lanes': 'Dividir em três raias',

  // marcadores do menu "Trocar tipo"
  'Parallel multi-instance': 'Várias instâncias em paralelo',
  'Sequential multi-instance': 'Várias instâncias em sequência',
  Loop: 'Repetição',
  Collection: 'Coleção',
  'Participant multiplicity': 'Vários participantes',
  'Toggle non-interrupting': 'Alternar não interruptivo',

  // tipos (menu "Trocar tipo")
  Task: 'Tarefa',
  'User task': 'Tarefa de usuário',
  'Service task': 'Tarefa de sistema',
  'Script task': 'Tarefa de script',
  'Business rule task': 'Tarefa de regra de negócio',
  'Manual task': 'Tarefa manual',
  'Send task': 'Tarefa de envio',
  'Receive task': 'Tarefa de recebimento',
  'Call activity': 'Chamada de processo',
  'Sub-process': 'Subprocesso',
  'Sub-process (collapsed)': 'Subprocesso (recolhido)',
  'Sub-process (expanded)': 'Subprocesso (expandido)',
  'Ad-hoc sub-process': 'Subprocesso ad hoc',
  'Ad-hoc sub-process (collapsed)': 'Subprocesso ad hoc (recolhido)',
  'Ad-hoc sub-process (expanded)': 'Subprocesso ad hoc (expandido)',
  'Event sub-process': 'Subprocesso de evento',
  Transaction: 'Transação',
  'Start event': 'Início',
  'End event': 'Fim',
  'Terminate end event': 'Fim terminal',
  'Intermediate throw event': 'Evento intermediário',
  'Boundary event': 'Evento de borda',
  'Message start event': 'Início por mensagem',
  'Timer start event': 'Início por tempo',
  'Conditional start event': 'Início por condição',
  'Signal start event': 'Início por sinal',
  'Error start event': 'Início por erro',
  'Escalation start event': 'Início por escalonamento',
  'Compensation start event': 'Início por compensação',
  'Message start event (non-interrupting)': 'Início por mensagem (não interruptivo)',
  'Timer start event (non-interrupting)': 'Início por tempo (não interruptivo)',
  'Conditional start event (non-interrupting)': 'Início por condição (não interruptivo)',
  'Signal start event (non-interrupting)': 'Início por sinal (não interruptivo)',
  'Escalation start event (non-interrupting)': 'Início por escalonamento (não interruptivo)',
  'Message intermediate catch event': 'Espera de mensagem',
  'Message intermediate throw event': 'Envio de mensagem',
  'Timer intermediate catch event': 'Espera de tempo',
  'Conditional intermediate catch event': 'Espera de condição',
  'Signal intermediate catch event': 'Espera de sinal',
  'Signal intermediate throw event': 'Disparo de sinal',
  'Escalation intermediate throw event': 'Disparo de escalonamento',
  'Compensation intermediate throw event': 'Disparo de compensação',
  'Link intermediate catch event': 'Link (chegada)',
  'Link intermediate throw event': 'Link (saída)',
  'Message end event': 'Fim com mensagem',
  'Error end event': 'Fim com erro',
  'Escalation end event': 'Fim com escalonamento',
  'Compensation end event': 'Fim com compensação',
  'Signal end event': 'Fim com sinal',
  'Cancel end event': 'Fim com cancelamento',
  'Message boundary event': 'Borda: mensagem',
  'Timer boundary event': 'Borda: tempo',
  'Conditional boundary event': 'Borda: condição',
  'Signal boundary event': 'Borda: sinal',
  'Error boundary event': 'Borda: erro',
  'Escalation boundary event': 'Borda: escalonamento',
  'Compensation boundary event': 'Borda: compensação',
  'Cancel boundary event': 'Borda: cancelamento',
  'Message boundary event (non-interrupting)': 'Borda: mensagem (não interruptivo)',
  'Timer boundary event (non-interrupting)': 'Borda: tempo (não interruptivo)',
  'Conditional boundary event (non-interrupting)': 'Borda: condição (não interruptivo)',
  'Signal boundary event (non-interrupting)': 'Borda: sinal (não interruptivo)',
  'Escalation boundary event (non-interrupting)': 'Borda: escalonamento (não interruptivo)',
  'Exclusive gateway': 'Decisão (exclusiva)',
  'Parallel gateway': 'Paralelo',
  'Inclusive gateway': 'Inclusivo',
  'Complex gateway': 'Complexo',
  'Event-based gateway': 'Baseado em eventos',
  'Event based instantiating Gateway': 'Baseado em eventos (inicia processo)',
  'Parallel Event based instantiating Gateway': 'Baseado em eventos paralelo (inicia processo)',
  'Sequence flow': 'Fluxo de sequência',
  'Default flow': 'Fluxo padrão',
  'Conditional flow': 'Fluxo condicional',
  'Data object reference': 'Objeto de dados',
  'Data store reference': 'Repositório de dados',
  'Empty pool/participant': 'Pool vazia',
  'Expanded pool/participant': 'Pool expandida',
};

/**
 * @param {string} modelo
 * @param {Record<string, string>} [substituicoes]
 */
function traduzir(modelo, substituicoes = {}) {
  const texto = TEXTOS[modelo] ?? modelo;
  return texto.replace(/{([^}]+)}/g, (_, chave) => substituicoes[chave] ?? `{${chave}}`);
}

/** Módulo do bpmn-js: substitui o serviço `translate`. */
export const moduloTraducao = { translate: ['value', traduzir] };
