/**
 * Ações da forma selecionada no estilo do Bizagi: primeiro o que se
 * acrescenta depois dela (tarefa, decisão, evento, fim, anotação), depois
 * ligar, e por fim trocar tipo e excluir. Esconde o que o modelo do
 * sistema não guarda.
 */

/** Ordem de exibição; o que não está aqui vem depois, na ordem do bpmn-js. */
const ORDEM = [
  'append.append-task',
  'append.gateway',
  'append.intermediate-event',
  'append.end-event',
  'append.text-annotation',
  'connect',
  'replace',
  'delete',
];

/** Sem lugar no modelo do sistema (sumiriam ao sincronizar). */
const OCULTAS = new Set(['append.compensation-activity']);

/** Grupos visuais do painel. */
const GRUPO = {
  'append.append-task': 'acrescentar',
  'append.gateway': 'acrescentar',
  'append.intermediate-event': 'acrescentar',
  'append.end-event': 'acrescentar',
  'append.text-annotation': 'acrescentar',
  connect: 'editar',
  replace: 'editar',
  delete: 'editar',
};

class MenuContexto {
  static $inject = ['contextPad'];

  /** @param {any} contextPad */
  constructor(contextPad) {
    // prioridade menor que a do bpmn-js: recebe as entradas já montadas
    contextPad.registerProvider(500, this);
  }

  getContextPadEntries() {
    /** @param {Record<string, any>} entradas */
    return (entradas) => {
      /** @type {Record<string, any>} */
      const ordenadas = {};
      const ids = [...ORDEM.filter((id) => id in entradas), ...Object.keys(entradas).filter((id) => !ORDEM.includes(id))];
      for (const id of ids) {
        if (OCULTAS.has(id)) continue;
        const grupo = GRUPO[/** @type {keyof typeof GRUPO} */ (id)];
        ordenadas[id] = grupo ? { ...entradas[id], group: grupo } : entradas[id];
      }
      return ordenadas;
    };
  }
}

/** Módulo do bpmn-js: reorganiza as ações da forma selecionada. */
export const moduloMenuContexto = { __init__: ['menuContextoMapeador'], menuContextoMapeador: ['type', MenuContexto] };
