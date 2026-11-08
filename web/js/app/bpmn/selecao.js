/**
 * Clique numa forma já selecionada mantém a seleção.
 *
 * No bpmn-js, o clique numa forma selecionada a desmarca. Aqui a seleção é
 * restaurada a cada redesenho (e a forma criada já nasce selecionada), então o
 * clique para ver as ações acabava sumindo com elas. Com Ctrl/Shift, a seleção
 * múltipla continua como no bpmn-js.
 */
class CliqueMantemSelecao {
  static $inject = ['eventBus', 'selection'];

  /**
   * @param {any} eventBus
   * @param {any} selection
   */
  constructor(eventBus, selection) {
    // prioridade acima do comportamento de seleção do bpmn-js; devolver false interrompe só este caso
    eventBus.on('element.click', 1500, (/** @type {any} */ e) => {
      const ev = e.originalEvent;
      const modificador = ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey);
      const atual = selection.get();
      if (!modificador && atual.length === 1 && atual[0] === e.element) return false;
    });
  }
}

/** Módulo do bpmn-js. */
export const moduloSelecao = { __init__: ['cliqueMantemSelecao'], cliqueMantemSelecao: ['type', CliqueMantemSelecao] };
