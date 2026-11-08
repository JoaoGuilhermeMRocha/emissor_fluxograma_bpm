/**
 * Faixas de cabeçalho da pool e das raias, como no Bizagi: a coluna da
 * esquerda, onde o nome fica na vertical, ganha um fundo próprio.
 *
 * O bpmn-js desenha a pool e a raia normalmente; este ouvinte, com
 * prioridade maior que a do desenhista padrão, chama o desenhista padrão e
 * acrescenta a faixa logo acima do retângulo de fundo (abaixo do texto).
 * Aqui devolver o desenho é o esperado: é o contrato de quem desenha.
 */

const LARGURA = 30;
const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {any} visualizador Modeler ou Viewer do bpmn-js
 * @param {() => { piscina: string, raia: string }} cores lidas a cada desenho (seguem o tema)
 */
export function instalarCabecalhos(visualizador, cores) {
  const bus = visualizador.get('eventBus');
  const desenhista = visualizador.get('bpmnRenderer');

  bus.on('render.shape', 1500, (/** @type {any} */ evento) => {
    const { gfx, element } = evento;
    const tipo = element.type;
    if (tipo !== 'bpmn:Participant' && tipo !== 'bpmn:Lane') return;
    // pool recolhida (sem raias) e pools verticais ficam com o desenho padrão
    if (element.collapsed || element.di?.isHorizontal === false) return;

    const visual = desenhista.drawShape(gfx, element);
    const faixa = document.createElementNS(SVG, 'rect');
    faixa.setAttribute('x', '0');
    faixa.setAttribute('y', '0');
    faixa.setAttribute('width', String(LARGURA));
    faixa.setAttribute('height', String(element.height));
    faixa.setAttribute('class', 'mapeador-cabecalho');
    faixa.style.fill = tipo === 'bpmn:Participant' ? cores().piscina : cores().raia;
    faixa.style.stroke = 'none';
    // logo depois do retângulo de fundo: fica por baixo da linha divisória e do nome
    gfx.insertBefore(faixa, visual.nextSibling);
    return visual;
  });
}
