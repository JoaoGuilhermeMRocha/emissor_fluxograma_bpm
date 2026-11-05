/** O pacote `bpmn-moddle` não publica tipos para a entrada principal. Tipagem mínima do que usamos. */
declare module 'bpmn-moddle' {
  export interface ElementoModdle {
    $type: string;
    id?: string;
    name?: string;
    [chave: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  export class BpmnModdle {
    constructor(pacotes?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: ElementoModdle; warnings: { message: string }[] }>;
  }
}
