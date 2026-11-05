import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { calcularLayout, exportarBpmn, importarBpmn, mesclarDoDiagrama, type LayoutCalculado, type Processo } from '@mapeador/core';
import { useLoja } from '../estado/loja';
import { CORES_DIAGRAMA } from '../tema';

/* Serviços internos do bpmn-js usados aqui (tipagem mínima). */
interface Caixa { x: number; y: number; width: number; height: number }
interface Canvas {
  zoom(nivel?: number | 'fit-viewport', centro?: 'auto'): number;
  viewbox(caixa?: Caixa): Caixa;
  scrollToElement(el: unknown): void;
}
interface Elemento { id: string; type?: string }
interface Registro { get(id: string): Elemento | undefined }
interface Selecao { select(el: Elemento | Elemento[] | null): void; get(): Elemento[] }
interface EdicaoDireta { isActive(): boolean }
interface EventBus { on(evento: string, cb: (e: never) => void): void }

export interface ControleDiagrama {
  ajustar(): void;
  zoom(fator: number): void;
}

const ID_ETAPA = /^E\d{2,}$/;

/**
 * Editor BPMN sobre o modelo (ESPECIFICACAO §6.1). O diagrama é sempre gerado
 * pelo núcleo; o que o usuário faz nele é lido de volta e mesclado no modelo
 * (`mesclarDoDiagrama`), que então redesenha. Assim nada que o desenho não
 * mostra (apoio, RACI, resultado…) se perde.
 */
export const EditorDiagrama = forwardRef<ControleDiagrama>(function EditorDiagrama(_, ref) {
  const processo = useLoja((s) => s.processo)!;
  const selecionada = useLoja((s) => s.selecionada);

  const tema = useLoja((s) => s.tema);
  const layout = useMemo(() => calcularLayout(processo), [processo]);
  const xml = useMemo(() => exportarBpmn(processo, { layout, ...CORES_DIAGRAMA[tema] }), [processo, layout, tema]);

  const conteiner = useRef<HTMLDivElement>(null);
  const modeler = useRef<Modeler | null>(null);
  const importando = useRef(false);
  const pendente = useRef(false);
  const primeiraVez = useRef(true);
  const ultimoXml = useRef('');
  const layoutImportado = useRef<LayoutCalculado | null>(null);
  const processoImportado = useRef<Processo | null>(null);
  const filaImportacao = useRef<Promise<void>>(Promise.resolve());
  /** Uma alteração já foi aplicada ao modelo e o redesenho ainda não terminou. */
  const aguardandoRedesenho = useRef(false);

  const servico = <T,>(nome: string): T => modeler.current!.get<T>(nome);

  const importar = (novoXml: string, novoLayout: LayoutCalculado, p: Processo) => {
    filaImportacao.current = filaImportacao.current.then(async () => {
      const m = modeler.current;
      if (!m || novoXml === ultimoXml.current) {
        aguardandoRedesenho.current = false;
        return;
      }
      importando.current = true;
      try {
        const canvas = servico<Canvas>('canvas');
        const caixa = primeiraVez.current ? null : canvas.viewbox();
        await m.importXML(novoXml);
        if (caixa) canvas.viewbox(caixa);
        else {
          canvas.zoom('fit-viewport', 'auto');
          primeiraVez.current = false;
        }
        ultimoXml.current = novoXml;
        layoutImportado.current = novoLayout;
        processoImportado.current = p;
        const sel = useLoja.getState().selecionada;
        const el = sel ? servico<Registro>('elementRegistry').get(sel) : undefined;
        if (el) servico<Selecao>('selection').select(el);
      } catch (e) {
        useLoja.getState().avisar('erro', `Não foi possível desenhar o diagrama: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        importando.current = false;
        aguardandoRedesenho.current = false;
      }
    });
  };

  /** Redesenha a partir do estado atual da loja (nunca de um valor guardado em closure). */
  const redesenharDoModelo = () => {
    const atual = useLoja.getState().processo;
    if (!atual) return;
    const l = calcularLayout(atual);
    ultimoXml.current = '';
    importar(exportarBpmn(atual, { layout: l, ...CORES_DIAGRAMA[useLoja.getState().tema] }), l, atual);
  };

  /** Lê o diagrama editado e aplica no modelo. */
  const sincronizar = async () => {
    const m = modeler.current;
    if (!m || importando.current || aguardandoRedesenho.current || !layoutImportado.current || !processoImportado.current) return;
    if (servico<EdicaoDireta>('directEditing').isActive()) {
      pendente.current = true; // espera terminar de digitar o rótulo
      return;
    }
    const base = processoImportado.current;
    const { xml: editado } = await m.saveXML();
    if (!editado) return;
    try {
      const [g] = await importarBpmn(editado);
      if (!g) return;
      const novo = mesclarDoDiagrama(base, g, layoutImportado.current);
      const loja = useLoja.getState();
      const antes = new Set(base.etapas.map((e) => e.id));
      const criada = novo.etapas.find((e) => !antes.has(e.id));
      aguardandoRedesenho.current = true;
      ultimoXml.current = ''; // o editor foi alterado à mão: redesenha mesmo que o XML final seja igual
      const mudou = loja.aplicar(() => novo);
      if (criada) loja.selecionar(criada.id);
      // nada mudou no modelo (ex.: arrastou a pool): o desenho volta ao estado do modelo
      if (!mudou) redesenharDoModelo();
    } catch (e) {
      useLoja.getState().avisar('erro', `Não foi possível aplicar a alteração: ${e instanceof Error ? e.message : String(e)}`);
      redesenharDoModelo();
    }
  };
  const sincronizarRef = useRef(sincronizar);
  sincronizarRef.current = sincronizar;

  useEffect(() => {
    const m = new Modeler({ container: conteiner.current! });
    modeler.current = m;
    if (import.meta.env.DEV) (window as unknown as { __modeler: unknown }).__modeler = m;
    const bus = m.get<EventBus>('eventBus');
    bus.on('commandStack.changed', ((e: { trigger?: string }) => {
      if (importando.current || (e.trigger && e.trigger !== 'execute')) return;
      void sincronizarRef.current();
    }) as never);
    bus.on('directEditing.deactivate', (() => {
      if (!pendente.current) return;
      pendente.current = false;
      setTimeout(() => void sincronizarRef.current(), 0);
    }) as never);
    bus.on('selection.changed', ((e: { newSelection: Elemento[] }) => {
      if (importando.current) return;
      const el = e.newSelection[0];
      useLoja.getState().selecionar(el && ID_ETAPA.test(el.id) ? el.id : null);
    }) as never);
    return () => {
      m.destroy();
      modeler.current = null;
    };
  }, []);

  useEffect(() => {
    importar(xml, layout, processo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml]);

  // Seleção vinda da tabela ou do painel
  useEffect(() => {
    const m = modeler.current;
    if (!m || importando.current) return;
    const sel = servico<Selecao>('selection');
    const atual = sel.get()[0]?.id ?? null;
    if (atual === selecionada) return;
    const el = selecionada ? servico<Registro>('elementRegistry').get(selecionada) : undefined;
    sel.select(el ?? null);
    if (el) servico<Canvas>('canvas').scrollToElement(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionada]);

  useImperativeHandle(ref, () => ({
    ajustar: () => modeler.current && servico<Canvas>('canvas').zoom('fit-viewport', 'auto'),
    zoom: (fator) => {
      if (!modeler.current) return;
      const c = servico<Canvas>('canvas');
      c.zoom(c.zoom() * fator);
    },
  }));

  return <div ref={conteiner} className="editor-diagrama" aria-label="Editor do diagrama" />;
});
