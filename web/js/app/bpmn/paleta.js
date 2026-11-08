/**
 * Paleta "Formas" no estilo do Bizagi: lista vertical com ícone e nome,
 * agrupada em Atividades, Eventos, Decisões e Artefatos, e as ferramentas
 * numa linha no topo. Só entram formas que existem no modelo do sistema.
 *
 * Os nomes são constantes daqui (nunca vêm do usuário), por isso podem ir
 * no HTML das entradas.
 */

/**
 * @typedef {Object} Forma
 * @property {string} grupo
 * @property {string} icone classe da fonte de ícones do bpmn-js
 * @property {string} nome
 * @property {string} tipo elemento BPMN criado
 * @property {Record<string, unknown>} [opcoes]
 */

/** @type {Record<string, Forma>} */
const FORMAS = {
  'criar.tarefa': { grupo: 'atividades', icone: 'bpmn-icon-task', nome: 'Tarefa', tipo: 'bpmn:Task' },
  'criar.sistema': {
    grupo: 'atividades',
    icone: 'bpmn-icon-service-task',
    nome: 'Tarefa de sistema',
    tipo: 'bpmn:ServiceTask',
  },
  'criar.subprocesso': {
    grupo: 'atividades',
    icone: 'bpmn-icon-subprocess-collapsed',
    nome: 'Subprocesso',
    tipo: 'bpmn:SubProcess',
    opcoes: { isExpanded: false },
  },
  'criar.inicio': { grupo: 'eventos', icone: 'bpmn-icon-start-event-none', nome: 'Início', tipo: 'bpmn:StartEvent' },
  'criar.intermediario': {
    grupo: 'eventos',
    icone: 'bpmn-icon-intermediate-event-none',
    nome: 'Intermediário',
    tipo: 'bpmn:IntermediateThrowEvent',
  },
  'criar.fim': { grupo: 'eventos', icone: 'bpmn-icon-end-event-none', nome: 'Fim', tipo: 'bpmn:EndEvent' },
  'criar.decisao': {
    grupo: 'decisoes',
    icone: 'bpmn-icon-gateway-xor',
    nome: 'Decisão',
    tipo: 'bpmn:ExclusiveGateway',
  },
  'criar.paralelo': {
    grupo: 'decisoes',
    icone: 'bpmn-icon-gateway-parallel',
    nome: 'Paralelo',
    tipo: 'bpmn:ParallelGateway',
  },
  'criar.inclusivo': {
    grupo: 'decisoes',
    icone: 'bpmn-icon-gateway-or',
    nome: 'Inclusivo',
    tipo: 'bpmn:InclusiveGateway',
  },
  'criar.anotacao': {
    grupo: 'artefatos',
    icone: 'bpmn-icon-text-annotation',
    nome: 'Anotação',
    tipo: 'bpmn:TextAnnotation',
  },
};

class PaletaFormas {
  static $inject = ['palette', 'create', 'elementFactory', 'handTool', 'lassoTool', 'spaceTool', 'globalConnect', 'translate'];

  /**
   * @param {any} palette
   * @param {any} create
   * @param {any} elementFactory
   * @param {any} handTool
   * @param {any} lassoTool
   * @param {any} spaceTool
   * @param {any} globalConnect
   * @param {(t: string) => string} translate
   */
  constructor(palette, create, elementFactory, handTool, lassoTool, spaceTool, globalConnect, translate) {
    this.s = { create, elementFactory, handTool, lassoTool, spaceTool, globalConnect, translate };
    palette.registerProvider(this);
  }

  getPaletteEntries() {
    const { create, elementFactory, handTool, lassoTool, spaceTool, globalConnect, translate } = this.s;

    /**
     * @param {string} icone
     * @param {string} dica
     * @param {(ev: Event) => void} acao
     */
    const ferramenta = (icone, dica, acao) => ({
      group: 'ferramentas',
      className: icone,
      title: dica,
      action: { click: acao },
    });

    /** @type {Record<string, unknown>} */
    const entradas = {
      'ferramenta.mao': ferramenta('bpmn-icon-hand-tool', translate('Activate hand tool'), (ev) => handTool.activateHand(ev)),
      'ferramenta.laco': ferramenta('bpmn-icon-lasso-tool', translate('Activate lasso tool'), (ev) =>
        lassoTool.activateSelection(ev),
      ),
      'ferramenta.espaco': ferramenta('bpmn-icon-space-tool', translate('Activate create/remove space tool'), (ev) =>
        spaceTool.activateSelection(ev),
      ),
      'ferramenta.ligar': ferramenta('bpmn-icon-connection-multi', translate('Activate global connect tool'), (ev) =>
        globalConnect.start(ev),
      ),
    };

    for (const [id, f] of Object.entries(FORMAS)) {
      /** @param {Event} ev */
      const criar = (ev) => create.start(ev, elementFactory.createShape({ type: f.tipo, ...f.opcoes }));
      entradas[id] = {
        group: f.grupo,
        className: f.icone,
        title: f.nome,
        html: `<div class="entry" draggable="true"><span class="rotulo">${f.nome}</span></div>`,
        action: { click: criar, dragstart: criar },
      };
    }
    return entradas;
  }
}

/** Módulo do bpmn-js: troca a paleta padrão pela paleta "Formas". */
export const moduloPaleta = { paletteProvider: ['type', PaletaFormas] };
