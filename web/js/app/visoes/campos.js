/**
 * Campos de edição de etapa, usados na tabela e no inspetor do painel
 * lateral. Cada campo leva o id da etapa em `data-id`; os manipuladores
 * registrados aqui aplicam a mudança no processo.
 */
/** @import { Etapa, Problema, Processo, Saida, TipoEtapa } from '../../core/index.js' */
import { atualizarEtapa, DEFINICOES, RESULTADOS_FIM, TIPOS_ETAPA, trocarTipo } from '../../core/index.js';
import { campoTexto, h, registrar } from '../dom.js';
import { aplicar } from '../estado/loja.js';

/**
 * @param {string} id
 * @param {Partial<Omit<Etapa, 'id' | 'tipo'>>} campos
 */
const atualizar = (id, campos) => aplicar((q) => atualizarEtapa(q, id, campos));

/**
 * Troca as saídas de uma etapa a partir das saídas atuais.
 * @param {string} id
 * @param {(saidas: Saida[]) => Saida[]} mudar
 */
const mudarSaidas = (id, mudar) =>
  aplicar((q) => {
    const e = q.etapas.find((x) => x.id === id);
    return e ? atualizarEtapa(q, id, { saidas: mudar(e.saidas) }) : q;
  });

const indice = (/** @type {HTMLElement} */ el) => Number(el.dataset.i);
const valor = (/** @type {HTMLElement} */ el) => /** @type {HTMLInputElement} */ (el).value;

registrar({
  mudar: {
    'etapa-tipo': (el) => aplicar((q) => trocarTipo(q, el.dataset.id ?? '', /** @type {TipoEtapa} */ (valor(el)))),
    'saida-destino': (el) =>
      mudarSaidas(el.dataset.id ?? '', (ss) => ss.map((s, k) => (k === indice(el) ? { ...s, destino: valor(el) } : s))),
    'etapa-resultado': (el) =>
      atualizar(el.dataset.id ?? '', { resultado: /** @type {Etapa['resultado']} */ (valor(el)) }),
    'etapa-evento': (el) =>
      atualizar(el.dataset.id ?? '', { evento: valor(el) === 'disparo' ? 'disparo' : 'captura' }),
    'etapa-anotada': (el) => atualizar(el.dataset.id ?? '', { anotaEtapa: valor(el) || undefined }),
  },
  campo: {
    // descrição, responsável, apoio e regra: o nome do campo vem em data-prop
    'etapa-texto': (el, v) => atualizar(el.dataset.id ?? '', { [el.dataset.prop ?? 'descricao']: v }),
    'saida-rotulo': (el, v) =>
      mudarSaidas(el.dataset.id ?? '', (ss) =>
        ss.map((s, k) => (k !== indice(el) ? s : v ? { ...s, rotulo: v } : { destino: s.destino })),
      ),
  },
  clique: {
    'saida-remover': (el) => mudarSaidas(el.dataset.id ?? '', (ss) => ss.filter((_, k) => k !== indice(el))),
    'saida-adicionar': (el) => mudarSaidas(el.dataset.id ?? '', (ss) => [...ss, { destino: '' }]),
  },
});

/**
 * Lista de opções para um `<select>`.
 * @param {[string, string][]} pares valor e rótulo
 */
export const opcoes = (pares) => pares.map(([v, r]) => h('option', { value: v }, r));

/**
 * Só aparecem tipos que mantêm o sentido das saídas.
 * @param {Etapa} etapa
 */
export function seletorTipo(etapa) {
  const familia = DEFINICOES[etapa.tipo].familia;
  return h(
    'select',
    {
      value: etapa.tipo,
      'aria-label': 'Tipo',
      title: 'Só aparecem tipos que mantêm o sentido das saídas',
      dataset: { mudar: 'etapa-tipo', id: etapa.id },
    },
    opcoes(TIPOS_ETAPA.filter((t) => DEFINICOES[t].familia === familia).map((t) => [t, DEFINICOES[t].rotulo])),
  );
}

/**
 * Campo de texto de uma propriedade da etapa.
 * @param {Etapa} etapa
 * @param {'descricao' | 'ator' | 'apoio' | 'regra'} prop
 * @param {Record<string, unknown>} [props]
 */
export const textoEtapa = (etapa, prop, props = {}) =>
  campoTexto('etapa-texto', etapa[prop] ?? '', { ...props, dataset: { id: etapa.id, prop } });

/**
 * @param {Etapa} etapa
 * @param {Processo} processo
 */
export function editorSaidas(etapa, processo) {
  const def = DEFINICOES[etapa.tipo];
  if (def.saidasMax === 0 && etapa.saidas.length === 0) return h('span', { class: 'mudo' }, 'sem saída');
  const destinos = processo.etapas.filter((x) => x.id !== etapa.id && x.tipo !== 'anotacao');
  const rotulavel = def.familia === 'gateway';
  const removivel = etapa.saidas.length > def.saidasMin || etapa.saidas.length > def.saidasMax;

  return h(
    'div',
    { class: 'saidas' },
    etapa.saidas.map((s, i) =>
      h(
        'div',
        { class: 'saida' },
        rotulavel &&
          campoTexto('saida-rotulo', s.rotulo ?? '', {
            placeholder: def.saidasRotuladas ? 'Rótulo' : 'Rótulo (opcional)',
            'aria-label': `Rótulo da saída ${i + 1}`,
            class: 'rotulo-saida',
            dataset: { id: etapa.id, i },
          }),
        h(
          'select',
          {
            value: s.destino,
            'aria-label': `Destino da saída ${i + 1}`,
            class: s.destino ? '' : 'pendente',
            dataset: { mudar: 'saida-destino', id: etapa.id, i },
          },
          h('option', { value: '' }, '→ sem destino'),
          destinos.map((x) =>
            h('option', { value: x.id }, `→ ${x.id} · ${x.descricao.slice(0, 32) || DEFINICOES[x.tipo].rotulo}`),
          ),
          s.destino &&
            !destinos.some((x) => x.id === s.destino) &&
            h('option', { value: s.destino }, `→ ${s.destino} (inexistente)`),
        ),
        removivel &&
          h(
            'button',
            {
              class: 'icone',
              title: 'Remover saída',
              'aria-label': 'Remover saída',
              dataset: { clique: 'saida-remover', id: etapa.id, i },
            },
            '×',
          ),
      ),
    ),
    etapa.saidas.length < def.saidasMax &&
      h('button', { class: 'mini', dataset: { clique: 'saida-adicionar', id: etapa.id } }, '+ saída'),
  );
}

/**
 * Campo específico do tipo: resultado do fim, regra do complexo, tipo do
 * evento intermediário ou etapa ligada à anotação.
 * @param {Etapa} e
 * @param {Processo} processo
 */
export function detalheEtapa(e, processo) {
  if (e.tipo === 'fim') {
    return h(
      'select',
      { value: e.resultado ?? 'Finalizado', 'aria-label': 'Resultado', dataset: { mudar: 'etapa-resultado', id: e.id } },
      opcoes(RESULTADOS_FIM.map((r) => [r, r])),
    );
  }
  if (e.tipo === 'gw_complexo') {
    return textoEtapa(e, 'regra', { placeholder: 'Regra do gateway', 'aria-label': 'Regra' });
  }
  if (e.tipo === 'intermediario') {
    return h(
      'select',
      { value: e.evento ?? 'captura', 'aria-label': 'Tipo de evento', dataset: { mudar: 'etapa-evento', id: e.id } },
      opcoes([
        ['captura', 'Captura (espera algo)'],
        ['disparo', 'Disparo (sinaliza algo)'],
      ]),
    );
  }
  if (e.tipo === 'anotacao') {
    return h(
      'select',
      { value: e.anotaEtapa ?? '', 'aria-label': 'Etapa anotada', dataset: { mudar: 'etapa-anotada', id: e.id } },
      h('option', { value: '' }, 'Ligada a…'),
      opcoes(processo.etapas.filter((x) => x.tipo !== 'anotacao').map((x) => [x.id, `${x.id} · ${x.descricao.slice(0, 30)}`])),
    );
  }
  return null;
}

/**
 * Pior gravidade entre os problemas de uma etapa.
 * @param {Problema[]} problemas
 * @param {string} id
 * @returns {'' | 'erro' | 'aviso' | 'info'}
 */
export function piorSeveridade(problemas, id) {
  const dela = problemas.filter((x) => x.etapa === id);
  if (dela.some((x) => x.severidade === 'erro')) return 'erro';
  if (dela.some((x) => x.severidade === 'aviso')) return 'aviso';
  return dela.length ? 'info' : '';
}

/**
 * Pontinho de gravidade do pior problema da etapa.
 * @param {'' | 'erro' | 'aviso' | 'info'} severidade
 * @param {string} titulo
 */
export const pontoProblema = (severidade, titulo) =>
  h('span', {
    class: ['ponto', severidade],
    title: titulo || null,
    'aria-label': severidade ? `Problema: ${severidade}` : null,
  });
