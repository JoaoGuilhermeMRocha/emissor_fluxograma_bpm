/**
 * Personalização do bpmn-js no estilo do Bizagi: tradução, paleta "Formas",
 * ações da forma selecionada, faixas de cabeçalho e fonte dos rótulos.
 */
/** @import { Tema } from '../tema.js' */
import { CABECALHOS, FONTE_DIAGRAMA } from '../tema.js';
import { instalarCabecalhos } from './cabecalhos.js';
import { moduloMenuContexto } from './menu-contexto.js';
import { moduloPaleta } from './paleta.js';
import { moduloSelecao } from './selecao.js';
import { moduloTraducao } from './traducao.js';

/** Fonte dos rótulos: dentro das formas e fora delas (eventos, decisões, setas). */
const textRenderer = {
  defaultStyle: FONTE_DIAGRAMA,
  externalStyle: { ...FONTE_DIAGRAMA, fontSize: 11 },
};

/**
 * Opções do Modeler (editor na tela).
 * @param {HTMLElement} container
 */
export const opcoesEditor = (container) => ({
  container,
  textRenderer,
  additionalModules: [moduloTraducao, moduloPaleta, moduloMenuContexto, moduloSelecao],
});

/**
 * Opções do Viewer (SVG exportado).
 * @param {HTMLElement} container
 */
export const opcoesVisualizador = (container) => ({ container, textRenderer, additionalModules: [moduloTraducao] });

/**
 * Liga as faixas de cabeçalho da pool e das raias.
 * @param {any} visualizador Modeler ou Viewer
 * @param {() => Tema} tema
 */
export const ligarCabecalhos = (visualizador, tema) => instalarCabecalhos(visualizador, () => CABECALHOS[tema()]);
