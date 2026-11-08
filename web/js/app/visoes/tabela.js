/**
 * Gaveta com a tabela de etapas: edição em lista de descrição,
 * responsável, apoio, saídas e detalhes.
 */
/** @import { Problema } from '../../core/index.js' */
/** @import { Estado } from '../estado/loja.js' */
import { atoresConhecidos, DEFINICOES, excluirEtapa, resolverRaias } from '../../core/index.js';
import { atualizar, h, registrar } from '../dom.js';
import { aplicar, definirUi, estado, selecionar } from '../estado/loja.js';
import { detalheEtapa, editorSaidas, piorSeveridade, pontoProblema, seletorTipo, textoEtapa } from './campos.js';

registrar({
  clique: {
    'gaveta-alternar': () => definirUi({ gavetaAberta: !estado().ui.gavetaAberta }),
    'tabela-linha': (el) => selecionar(el.dataset.id ?? null),
    'tabela-excluir': (el, ev) => {
      ev.stopPropagation(); // não seleciona a linha que está sumindo
      const id = el.dataset.id ?? '';
      aplicar((q) => excluirEtapa(q, id));
      selecionar(null);
    },
  },
});

let ultimaSelecao = /** @type {string | null} */ (null);

/**
 * @param {HTMLElement} regiao
 * @param {Estado} s
 * @param {Problema[]} problemas
 */
export function desenharGaveta(regiao, s, problemas) {
  const p = s.processo;
  if (!p) return;
  const aberta = s.ui.gavetaAberta;
  regiao.classList.toggle('aberta', aberta);
  atualizar(
    regiao,
    h(
      'button',
      { class: 'gaveta-cabeca', 'aria-expanded': String(aberta), dataset: { clique: 'gaveta-alternar' } },
      h('span', null, `${aberta ? '▾' : '▸'} Etapas (${p.etapas.length})`),
      h('span', { class: 'mudo' }, 'edite em lista: descrição, responsável, apoio e saídas'),
    ),
    aberta && tabela(s, problemas),
  );

  // a linha selecionada aparece na rolagem
  if (aberta && s.selecionada !== ultimaSelecao) {
    regiao.querySelector('tr.selecionada')?.scrollIntoView({ block: 'nearest' });
  }
  ultimaSelecao = s.selecionada;
}

/**
 * @param {Estado} s
 * @param {Problema[]} problemas
 */
function tabela(s, problemas) {
  const p = s.processo;
  if (!p) return null;
  if (!p.etapas.length) {
    return h('p', { class: 'vazio' }, 'Nenhuma etapa ainda. Use “+ Etapa” acima ou a paleta à esquerda do diagrama.');
  }
  const raias = resolverRaias(p);

  return h(
    'div',
    { class: 'tabela-rolagem' },
    h('datalist', { id: 'lista-atores' }, atoresConhecidos(p).map((a) => h('option', { value: a }))),
    h(
      'table',
      { class: 'etapas' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          ['Id', 'Tipo', 'Descrição', 'Responsável', 'Apoio', 'Saídas', 'Detalhe'].map((t) => h('th', { scope: 'col' }, t)),
          h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Ações')),
        ),
      ),
      h(
        'tbody',
        null,
        p.etapas.map((e) => {
          const def = DEFINICOES[e.tipo];
          const dela = problemas.filter((x) => x.etapa === e.id);
          return h(
            'tr',
            {
              class: s.selecionada === e.id ? 'selecionada' : '',
              dataset: { chave: e.id, clique: 'tabela-linha', id: e.id },
            },
            h(
              'td',
              { class: 'id' },
              pontoProblema(piorSeveridade(problemas, e.id), dela.map((x) => x.mensagem).join('\n')),
              e.id,
            ),
            h('td', null, seletorTipo(e)),
            h('td', null, textoEtapa(e, 'descricao', { 'aria-label': `Descrição de ${e.id}`, placeholder: 'Descrição' })),
            h(
              'td',
              null,
              def.ator === 'nenhum'
                ? h('span', { class: 'herdado', title: 'Raia herdada das etapas vizinhas' }, `↳ ${raias.get(e.id) ?? '—'}`)
                : textoEtapa(e, 'ator', {
                    list: 'lista-atores',
                    'aria-label': `Responsável de ${e.id}`,
                    placeholder: def.ator === 'obrigatorio' ? 'Obrigatório' : `Herda: ${raias.get(e.id) ?? ''}`,
                  }),
            ),
            h(
              'td',
              null,
              def.familia === 'atividade' || def.familia === 'gateway'
                ? textoEtapa(e, 'apoio', { 'aria-label': `Apoio de ${e.id}`, placeholder: 'Sistema, documento…' })
                : h('span', { class: 'mudo' }, '—'),
            ),
            h('td', null, editorSaidas(e, p)),
            h('td', null, detalheEtapa(e, p)),
            h(
              'td',
              null,
              h(
                'button',
                {
                  class: 'icone perigo',
                  title: `Excluir ${e.id}`,
                  'aria-label': `Excluir ${e.id}`,
                  dataset: { clique: 'tabela-excluir', id: e.id },
                },
                '×',
              ),
            ),
          );
        }),
      ),
    ),
  );
}
