/**
 * Editor BPMN sobre o modelo (ESPECIFICACAO §6.1). O diagrama é sempre gerado
 * pelo núcleo; o que o usuário faz nele é lido de volta e mesclado no modelo
 * (`mesclarDoDiagrama`), que então redesenha. Assim nada que o desenho não
 * mostra (apoio, RACI, resultado…) se perde.
 */
/** @import { Analise, LayoutCalculado, Problema, Processo } from '../../core/index.js' */
/** @import { Estado } from '../estado/loja.js' */
import Modeler from 'bpmn-js/lib/Modeler';
import { adicionarEtapa, calcularLayout, exportarBpmn, importarBpmn, mesclarDoDiagrama } from '../../core/index.js';
import { atualizar, h, mensagem, registrar } from '../dom.js';
import { aplicar, assinar, avisar, definirUi, estado, selecionar } from '../estado/loja.js';
import { CORES_DIAGRAMA } from '../tema.js';
import { ligarCabecalhos, opcoesEditor } from '../bpmn/index.js';

/**
 * Serviços internos do bpmn-js usados aqui (tipagem mínima).
 * @typedef {{ x: number, y: number, width: number, height: number }} CaixaVisao
 * @typedef {{ id: string, type?: string }} Elemento
 * @typedef {{ zoom(nivel?: number | 'fit-viewport', centro?: 'auto'): number, viewbox(caixa?: CaixaVisao): CaixaVisao, scrollToElement(el: Elemento): void }} Canvas
 * @typedef {{ get(id: string): Elemento | undefined }} RegistroElementos
 * @typedef {{ select(el: Elemento | Elemento[] | null): void, get(): Elemento[] }} Selecao
 * @typedef {{ isActive(): boolean }} EdicaoDireta
 * @typedef {{ on(evento: string, cb: (e: any) => void): void }} EventBus
 */

const ID_ETAPA = /^E\d{2,}$/;

/** @type {any} */
let modeler = null;
let importando = false;
/** Edição de rótulo em andamento quando a mudança chegou: sincroniza ao terminar. */
let pendente = false;
let primeiraVez = true;
let ultimoXml = '';
/** @type {LayoutCalculado | null} */
let layoutImportado = null;
/** @type {Processo | null} */
let processoImportado = null;
let filaImportacao = Promise.resolve();
/** Importações na fila: enquanto houver, a seleção espera o desenho novo. */
let importacoesPendentes = 0;
/** Uma alteração já foi aplicada ao modelo e o redesenho ainda não terminou. */
let aguardandoRedesenho = false;

/**
 * @template T
 * @param {string} nome
 * @returns {T}
 */
const servico = (nome) => modeler.get(nome);

/**
 * Importa o XML no editor, em fila (uma importação de cada vez).
 * @param {string} xml
 * @param {LayoutCalculado} layout
 * @param {Processo} p
 */
function importar(xml, layout, p) {
  importacoesPendentes++;
  filaImportacao = filaImportacao.then(async () => {
    if (!modeler || xml === ultimoXml) {
      importacoesPendentes--;
      aguardandoRedesenho = false;
      return;
    }
    importando = true;
    try {
      const canvas = /** @type {Canvas} */ (servico('canvas'));
      const caixa = primeiraVez ? null : canvas.viewbox();
      await modeler.importXML(xml);
      if (caixa) canvas.viewbox(caixa);
      else {
        ajustarATela();
        primeiraVez = false;
      }
      ultimoXml = xml;
      layoutImportado = layout;
      processoImportado = p;
      // a seleção da loja vale para o desenho novo
      const sel = estado().selecionada;
      const el = sel ? /** @type {RegistroElementos} */ (servico('elementRegistry')).get(sel) : undefined;
      if (el) /** @type {Selecao} */ (servico('selection')).select(el);
    } catch (e) {
      avisar('erro', `Não foi possível desenhar o diagrama: ${mensagem(e)}`);
    } finally {
      importacoesPendentes--;
      importando = false;
      aguardandoRedesenho = false;
    }
  });
}

/**
 * Desenha a partir do estado atual da loja.
 * @param {boolean} [forcar] redesenha mesmo que o XML seja o mesmo (o editor foi alterado à mão)
 */
function redesenhar(forcar = false) {
  const s = estado();
  if (!s.processo) return;
  const layout = calcularLayout(s.processo);
  if (forcar) ultimoXml = '';
  importar(exportarBpmn(s.processo, { layout, ...CORES_DIAGRAMA[s.tema] }), layout, s.processo);
}

/** Lê o diagrama editado e aplica no modelo. */
async function sincronizar() {
  if (!modeler || importando || aguardandoRedesenho || !layoutImportado || !processoImportado) return;
  if (/** @type {EdicaoDireta} */ (servico('directEditing')).isActive()) {
    pendente = true; // espera terminar de digitar o rótulo
    return;
  }
  const base = processoImportado;
  const { xml: editado } = await modeler.saveXML();
  if (!editado) return;
  try {
    const [g] = await importarBpmn(editado);
    if (!g) return;
    const novo = mesclarDoDiagrama(base, g, layoutImportado);
    const antes = new Set(base.etapas.map((e) => e.id));
    const criada = novo.etapas.find((e) => !antes.has(e.id));
    aguardandoRedesenho = true;
    ultimoXml = ''; // o editor foi alterado à mão: redesenha mesmo que o XML final seja igual
    const mudou = aplicar(() => novo);
    if (criada) selecionar(criada.id);
    // nada mudou no modelo (ex.: arrastou a pool): o desenho volta ao estado do modelo
    if (!mudou) redesenhar(true);
  } catch (e) {
    avisar('erro', `Não foi possível aplicar a alteração: ${mensagem(e)}`);
    redesenhar(true);
  }
}

/**
 * Enquadra o diagrama na área livre: à direita da paleta "Formas" e abaixo
 * da barra de ferramentas, que ficam por cima do desenho.
 */
function ajustarATela() {
  if (!modeler) return;
  const canvas = servico('canvas');
  const { inner, outer } = /** @type {any} */ (canvas).viewbox();
  if (!inner.width || !inner.height) return;
  const esquerda = 196; // paleta (168) + margens
  const topo = 64; // barra de ferramentas e indicadores
  const folga = 24;
  const escala = Math.min(
    (outer.width - esquerda - folga) / inner.width,
    (outer.height - topo - folga) / inner.height,
    1,
  );
  /** @type {Canvas} */ (canvas).viewbox({
    x: inner.x - esquerda / escala,
    y: inner.y - topo / escala,
    width: outer.width / escala,
    height: outer.height / escala,
  });
}

/**
 * Seleção vinda da tabela ou do painel. Com redesenho na fila, espera: a
 * etapa pode ainda não existir no desenho (ex.: acabou de ser criada).
 */
function refletirSelecao(/** @type {string | null} */ selecionada) {
  if (!modeler || importando || importacoesPendentes > 0) return;
  const sel = /** @type {Selecao} */ (servico('selection'));
  const atual = sel.get()[0]?.id ?? null;
  if (atual === selecionada) return;
  const el = selecionada ? /** @type {RegistroElementos} */ (servico('elementRegistry')).get(selecionada) : undefined;
  sel.select(el ?? null);
  if (el) /** @type {Canvas} */ (servico('canvas')).scrollToElement(el);
}

registrar({
  clique: {
    'diagrama-adicionar': () => {
      const { processo, selecionada } = estado();
      const sel = processo?.etapas.find((e) => e.id === selecionada);
      let novoId = '';
      const ok = aplicar((q) => {
        const ator = sel?.ator ?? q.etapas.find((e) => e.ator)?.ator ?? 'Responsável';
        const r = adicionarEtapa(q, { tipo: 'tarefa', descricao: 'Nova tarefa', ator }, sel ? { depoisDe: sel.id } : {});
        novoId = r.id;
        return r.processo;
      });
      if (ok) selecionar(novoId);
    },
    'diagrama-ajustar': () => ajustarATela(),
    'diagrama-zoom': (el) => {
      if (!modeler) return;
      const c = /** @type {Canvas} */ (servico('canvas'));
      c.zoom(c.zoom() * Number(el.dataset.fator));
    },
    'diagrama-problemas': () => definirUi({ aba: 'problemas' }),
  },
});

/**
 * Cria o editor dentro de `conteiner` e o mantém sincronizado com a loja. Chamar uma vez.
 * @param {HTMLElement} conteiner
 * @returns {any} o Modeler (útil para testes no navegador)
 */
export function montarDiagrama(conteiner) {
  modeler = new Modeler(opcoesEditor(conteiner));
  ligarCabecalhos(modeler, () => estado().tema);
  const bus = /** @type {EventBus} */ (servico('eventBus'));
  // Atenção: ouvintes do eventBus não podem devolver valor, senão interrompem o evento.
  // A sincronização espera o fim do evento: ao criar uma forma, o bpmn-js abre a edição do
  // texto logo depois do comando. Sincronizando antes, o redesenho fecharia a caixa de texto.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let agendada;
  bus.on('commandStack.changed', (e) => {
    if (importando || (e.trigger && e.trigger !== 'execute')) return;
    clearTimeout(agendada);
    agendada = setTimeout(() => void sincronizar(), 0);
  });
  bus.on('directEditing.deactivate', () => {
    if (!pendente) return;
    pendente = false;
    setTimeout(() => void sincronizar(), 0);
  });
  bus.on('selection.changed', (e) => {
    if (importando || importacoesPendentes > 0) return;
    const el = e.newSelection[0];
    selecionar(el && ID_ETAPA.test(el.id) ? el.id : null);
  });

  assinar((s, antes) => {
    if (s.processo !== antes.processo || s.tema !== antes.tema) redesenhar();
    if (s.selecionada !== antes.selecionada) refletirSelecao(s.selecionada);
  });
  redesenhar();
  return modeler;
}

/**
 * Indicadores sobre o diagrama: complexidade, total de etapas e problemas.
 * @param {HTMLElement} regiao
 * @param {Analise} analise
 * @param {Problema[]} problemas
 */
export function desenharIndicadores(regiao, analise, problemas) {
  const erros = problemas.filter((x) => x.severidade === 'erro').length;
  const texto = erros
    ? `${erros} erro(s)`
    : problemas.length
      ? `${problemas.length} sugestão(ões)`
      : 'Sem problemas';
  atualizar(
    regiao,
    h('span', { title: 'Complexidade' }, analise.nivel),
    h('span', null, `${analise.metricas.total} etapas`),
    h(
      'button',
      { class: ['chip', erros ? 'erro' : problemas.length ? 'aviso' : 'ok'], dataset: { clique: 'diagrama-problemas' } },
      texto,
    ),
  );
}
