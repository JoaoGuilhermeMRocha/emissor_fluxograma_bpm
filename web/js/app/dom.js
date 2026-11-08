/**
 * Utilitários de DOM da interface.
 *
 * - `h()` cria elementos. Texto entra sempre como nó de texto, nunca como
 *   HTML: nada digitado ou importado vira marcação (RNF-06).
 * - `atualizar()` troca o conteúdo de uma região pelo novo usando o
 *   morphdom, que reaproveita os nós existentes. Assim foco, cursor e
 *   rolagem sobrevivem ao redesenho.
 * - Os eventos são delegados (`data-clique`, `data-mudar`, `data-campo`,
 *   `data-digitar`, `data-enviar`): os nós podem ser reaproveitados à
 *   vontade, sem ouvintes presos a valores antigos.
 */
import morphdom from 'morphdom';

/** @typedef {Node | string | number | null | undefined | false} Filho */
/** @typedef {Record<string, unknown>} Props */

/**
 * @param {Element} el
 * @param {(Filho | Filho[])[]} filhos
 */
function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

/**
 * @param {Element} el
 * @param {Props | null | undefined} props
 */
function aplicarProps(el, props) {
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') {
      const classe = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      if (classe) el.setAttribute('class', classe);
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(/** @type {Record<string, unknown>} */ (v))) {
        if (dv != null) /** @type {HTMLElement} */ (el).dataset[dk] = String(dv);
      }
    } else if ((k === 'value' || k === 'checked') && !(el instanceof HTMLSelectElement)) {
      // propriedade, não atributo: é o que o morphdom compara
      /** @type {any} */ (el)[k] = v;
    } else if (k === 'value') {
      // <select>: marcado depois, nas opções (ver `h`)
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

/**
 * Cria um elemento HTML.
 * @param {string} tag
 * @param {Props | null} [props]
 * @param {...(Filho | Filho[])} filhos
 * @returns {HTMLElement}
 */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  aplicarProps(el, props);
  anexar(el, filhos);
  // <select value>: a opção escolhida leva o atributo `selected` (é o que o morphdom respeita)
  if (el instanceof HTMLSelectElement && props?.value != null) {
    const valor = String(props.value);
    for (const op of el.options) {
      if (op.value === valor) {
        op.setAttribute('selected', '');
        break;
      }
    }
  }
  return el;
}

/**
 * Cria um elemento SVG.
 * @param {string} tag
 * @param {Props | null} [props]
 * @param {...(Filho | Filho[])} filhos
 * @returns {SVGElement}
 */
export function s(tag, props, ...filhos) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  aplicarProps(el, props);
  anexar(el, filhos);
  return el;
}

/** Campo de texto com edição em andamento: tem o foco e difere do valor gravado. */
const editando = (/** @type {Element} */ el) =>
  el === document.activeElement &&
  (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
  el.dataset.original !== undefined &&
  el.value !== el.dataset.original;

/**
 * Substitui o conteúdo de `regiao` por `filhos`, reaproveitando os nós.
 * Elementos com `data-chave` são casados pela chave (ex.: linhas da tabela).
 * @param {Element} regiao
 * @param {...(Filho | Filho[])} filhos
 */
export function atualizar(regiao, ...filhos) {
  const novo = document.createElement(regiao.tagName);
  anexar(novo, filhos);
  morphdom(regiao, novo, {
    childrenOnly: true,
    getNodeKey: (no) => (no instanceof HTMLElement ? no.dataset.chave || no.id || undefined : undefined),
    onBeforeElUpdated(de, para) {
      // não apaga o que a pessoa está digitando
      if (editando(de)) /** @type {HTMLInputElement} */ (para).value = /** @type {HTMLInputElement} */ (de).value;
      // diálogo aberto continua aberto
      if (de instanceof HTMLDialogElement && de.open) para.setAttribute('open', '');
      return true;
    },
  });
}

/* ---------- Eventos delegados ---------- */

/**
 * @typedef {Object} Manipuladores
 * @property {Record<string, (el: HTMLElement, ev: Event) => void>} [clique] `data-clique`
 * @property {Record<string, (el: HTMLElement, ev: Event) => void>} [mudar] `data-mudar` (select, checkbox, data)
 * @property {Record<string, (el: HTMLElement, valor: string) => void>} [campo] `data-campo`: grava ao sair ou com Enter
 * @property {Record<string, (el: HTMLElement, ev: Event) => void>} [digitar] `data-digitar`: a cada tecla
 * @property {Record<string, (el: HTMLFormElement, ev: Event) => void>} [enviar] `data-enviar` (formulários)
 */

/** @type {Required<Manipuladores>} */
const registro = { clique: {}, mudar: {}, campo: {}, digitar: {}, enviar: {} };

/**
 * Registra manipuladores de eventos delegados. Os nomes são globais.
 * @param {Manipuladores} m
 */
export function registrar(m) {
  for (const tipo of /** @type {(keyof Manipuladores)[]} */ (Object.keys(m))) {
    for (const [nome, fn] of Object.entries(m[tipo] ?? {})) {
      if (registro[tipo][nome]) throw new Error(`Manipulador "${tipo}:${nome}" registrado duas vezes`);
      /** @type {Record<string, unknown>} */ (registro[tipo])[nome] = fn;
    }
  }
}

/**
 * @param {Event} ev
 * @param {string} atributo
 * @returns {HTMLElement | null}
 */
const alvo = (ev, atributo) =>
  ev.target instanceof Element ? /** @type {HTMLElement | null} */ (ev.target.closest(`[${atributo}]`)) : null;

/** Confirma o campo de texto se o valor mudou. */
function confirmarCampo(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el) {
  const nome = el.dataset.campo;
  if (!nome || el.value === el.dataset.original) return;
  registro.campo[nome]?.(el, el.value);
}

/** Liga a delegação de eventos no documento. Chamar uma vez. */
export function ligarEventos() {
  // Clique sobe pelos ancestrais com `data-clique` (ex.: botão dentro da linha da
  // tabela também seleciona a linha), até alguém chamar `ev.stopPropagation()`.
  document.addEventListener('click', (ev) => {
    let el = alvo(ev, 'data-clique');
    while (el && !ev.cancelBubble) {
      if (!(/** @type {HTMLButtonElement} */ (el).disabled)) registro.clique[el.dataset.clique ?? '']?.(el, ev);
      el = /** @type {HTMLElement | null} */ (el.parentElement?.closest('[data-clique]') ?? null);
    }
  });
  document.addEventListener('change', (ev) => {
    const el = alvo(ev, 'data-mudar');
    if (el) registro.mudar[el.dataset.mudar ?? '']?.(el, ev);
  });
  document.addEventListener('input', (ev) => {
    const el = alvo(ev, 'data-digitar');
    if (el) registro.digitar[el.dataset.digitar ?? '']?.(el, ev);
  });
  document.addEventListener('submit', (ev) => {
    const el = alvo(ev, 'data-enviar');
    if (!(el instanceof HTMLFormElement)) return;
    ev.preventDefault();
    registro.enviar[el.dataset.enviar ?? '']?.(el, ev);
  });
  // Campos de texto: gravam ao sair ou com Enter; Esc volta ao valor gravado.
  // (A limpeza de texto do núcleo apagaria espaços no meio da digitação.)
  document.addEventListener('focusout', (ev) => {
    const el = ev.target;
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.dataset.campo) confirmarCampo(el);
  });
  document.addEventListener('keydown', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !el.dataset.campo) return;
    if (ev.key === 'Enter' && el instanceof HTMLInputElement) el.blur();
    if (ev.key === 'Escape') el.value = el.dataset.original ?? '';
  });
}

/**
 * Campo de texto que grava ao sair ou com Enter (ver `ligarEventos`).
 * @param {string} campo nome do manipulador em `registrar({ campo })`
 * @param {string} valor valor gravado
 * @param {Props} [props] outros atributos (`dataset`, `placeholder`, `aria-label`…)
 * @returns {HTMLElement}
 */
export function campoTexto(campo, valor, props = {}) {
  const { dataset, multilinha, ...resto } = /** @type {Props & { dataset?: Record<string, unknown> }} */ (props);
  return h(multilinha ? 'textarea' : 'input', {
    ...resto,
    ...(multilinha ? { rows: 3 } : {}),
    value: valor,
    dataset: { ...dataset, campo, original: valor },
  });
}

/**
 * Baixa um conteúdo como arquivo.
 * @param {string | Uint8Array} conteudo
 * @param {string} nome
 * @param {string} tipo
 */
export function baixar(conteudo, nome, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([typeof conteudo === 'string' ? conteudo : new Uint8Array(conteudo)], { type: tipo }),
  );
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Mensagem legível de um erro qualquer. */
export const mensagem = (/** @type {unknown} */ e) => (e instanceof Error ? e.message : String(e));
