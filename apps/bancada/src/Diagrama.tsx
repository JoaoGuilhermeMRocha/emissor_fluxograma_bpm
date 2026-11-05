import { useEffect, useRef, useState } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import { exportarBpmn, slug, type Processo } from '@mapeador/core';

interface Props {
  processo: Processo;
  selecionada: string | null;
  selecionar: (id: string) => void;
}

/* Serviços internos do bpmn-js usados aqui (tipagem mínima). */
interface Canvas {
  zoom(nivel?: number | 'fit-viewport', centro?: 'auto'): number;
  viewbox(caixa?: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number };
  addMarker(id: string, classe: string): void;
  scrollToElement(id: string): void;
}
interface Registro {
  get(id: string): unknown;
}
interface EventBus {
  on(evento: string, cb: (e: { element: { id: string } }) => void): void;
}

/**
 * Visualização do processo: gera o BPMN pelo núcleo (layout automático) e
 * renderiza com o bpmn-js. É a mesma saída do "Baixar .bpmn".
 */
export function Diagrama({ processo, selecionada, selecionar }: Props) {
  const conteiner = useRef<HTMLDivElement>(null);
  const viewer = useRef<NavigatedViewer | null>(null);
  const primeiraVez = useRef(true);
  const geracao = useRef(0);
  const selecionarRef = useRef(selecionar);
  selecionarRef.current = selecionar;
  const [erro, setErro] = useState('');

  useEffect(() => {
    const v = new NavigatedViewer({ container: conteiner.current! });
    viewer.current = v;
    v.get<EventBus>('eventBus').on('element.click', (e) => {
      if (/^E\d+$/.test(e.element.id)) selecionarRef.current(e.element.id);
    });
    return () => {
      v.destroy();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const minha = ++geracao.current;
    const canvas = v.get<Canvas>('canvas');
    const caixaAnterior = primeiraVez.current ? null : canvas.viewbox();
    v.importXML(exportarBpmn(processo))
      .then(() => {
        if (minha !== geracao.current) return;
        setErro('');
        if (caixaAnterior) canvas.viewbox(caixaAnterior);
        else {
          canvas.zoom('fit-viewport', 'auto');
          primeiraVez.current = false;
        }
        if (selecionada && v.get<Registro>('elementRegistry').get(selecionada)) canvas.addMarker(selecionada, 'selecionada');
      })
      .catch((e: unknown) => minha === geracao.current && setErro(e instanceof Error ? e.message : String(e)));
  }, [processo, selecionada]);

  const zoom = (fator: number) => {
    const canvas = viewer.current?.get<Canvas>('canvas');
    if (canvas) canvas.zoom(canvas.zoom() * fator);
  };

  const baixarSvg = async () => {
    const r = await viewer.current?.saveSVG();
    if (!r) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
    a.download = `${slug(processo.nome) || 'processo'}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="diagrama">
      <div className="diagrama-ferramentas">
        <button className="icone" onClick={() => viewer.current?.get<Canvas>('canvas').zoom('fit-viewport', 'auto')} title="Ajustar à tela">⤢</button>
        <button className="icone" onClick={() => zoom(1.2)} title="Aproximar">+</button>
        <button className="icone" onClick={() => zoom(1 / 1.2)} title="Afastar">−</button>
        <button className="mini" onClick={baixarSvg}>SVG</button>
      </div>
      {erro && <p className="mensagem erro diagrama-erro">Não foi possível desenhar: {erro}</p>}
      <div ref={conteiner} className="diagrama-tela" />
    </div>
  );
}
