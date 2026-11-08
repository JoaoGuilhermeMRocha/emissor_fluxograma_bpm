/**
 * Painel lateral: inspetor da etapa, problemas, análises, RACI e dados do processo.
 */
/** @import { Analise, Problema, Processo, TipoEtapa } from '../../core/index.js' */
/** @import { AbaLateral, Estado } from '../estado/loja.js' */
import {
  adicionarEtapa,
  atoresConhecidos,
  DEFINICOES,
  excluirEtapa,
  montarMatrizRaci,
  ordemDasRaias,
  resolverRaias,
  TIPOS_ETAPA,
} from '../../core/index.js';
import { atualizar, campoTexto, h, registrar } from '../dom.js';
import { aplicar, avisar, definirUi, estado, selecionar } from '../estado/loja.js';
import { detalheEtapa, editorSaidas, opcoes, seletorTipo, textoEtapa } from './campos.js';

/** @type {[AbaLateral, string][]} */
const ABAS = [
  ['etapa', 'Etapa'],
  ['problemas', 'Problemas'],
  ['analises', 'Análises'],
  ['raci', 'RACI'],
  ['processo', 'Processo'],
];

/** @type {Record<'A' | 'C' | 'I', 'aprovadores' | 'consultados' | 'informados'>} */
const LISTA_DA_LETRA = { A: 'aprovadores', C: 'consultados', I: 'informados' };

/**
 * Altera o processo inteiro (campos que não são de etapa).
 * @param {(p: Processo) => Processo} op
 */
const mudarProcesso = (op) => aplicar(op);

registrar({
  clique: {
    'painel-aba': (el) => definirUi({ aba: /** @type {AbaLateral} */ (el.dataset.aba) }),
    'inspetor-inserir': (el) => {
      const depoisDe = el.dataset.id ?? '';
      const tipo = estado().ui.tipoNovo;
      let novoId = '';
      const ok = aplicar((q) => {
        const ator = q.etapas.find((e) => e.id === depoisDe)?.ator;
        const r = adicionarEtapa(
          q,
          { tipo, descricao: '', ator: DEFINICOES[tipo].ator !== 'nenhum' ? ator : undefined },
          { depoisDe },
        );
        novoId = r.id;
        return r.processo;
      });
      if (ok) selecionar(novoId);
    },
    'inspetor-excluir': (el) => {
      const id = el.dataset.id ?? '';
      aplicar((q) => excluirEtapa(q, id));
      selecionar(null);
    },
    'problema-ir': (el) => {
      if (!el.dataset.etapa) return;
      selecionar(el.dataset.etapa);
      definirUi({ aba: 'etapa' });
    },
    'raci-letra': (el) => {
      const { etapa = '', ator = '' } = el.dataset;
      const chave = LISTA_DA_LETRA[/** @type {'A' | 'C' | 'I'} */ (el.dataset.letra)];
      mudarProcesso((q) => {
        const atual = q.raci.porEtapa[etapa] ?? { aprovadores: [], consultados: [], informados: [] };
        const lista = atual[chave];
        const nova = lista.includes(ator) ? lista.filter((x) => x !== ator) : [...lista, ator];
        return { ...q, raci: { ...q.raci, porEtapa: { ...q.raci.porEtapa, [etapa]: { ...atual, [chave]: nova } } } };
      });
    },
    'raia-mover': (el) => {
      const i = Number(el.dataset.i);
      const d = Number(el.dataset.d);
      mudarProcesso((q) => {
        const nova = ordemDasRaias(q);
        [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
        return { ...q, layout: { ...q.layout, ordemRaias: nova } };
      });
    },
    'raias-automatico': () => mudarProcesso((q) => ({ ...q, layout: { ...q.layout, ordemRaias: null } })),
    'posicoes-automatico': () => mudarProcesso((q) => ({ ...q, layout: { ...q.layout, posicoes: {} } })),
  },
  mudar: {
    'inspetor-tipo-novo': (el) => definirUi({ tipoNovo: /** @type {TipoEtapa} */ (/** @type {HTMLSelectElement} */ (el).value) }),
    'raci-revisada': (el) => {
      const revisada = /** @type {HTMLInputElement} */ (el).checked;
      mudarProcesso((q) => ({ ...q, raci: { ...q.raci, revisada } }));
    },
    'processo-data': (el) => {
      const data = /** @type {HTMLInputElement} */ (el).value;
      if (data) mudarProcesso((q) => ({ ...q, data }));
    },
  },
  campo: {
    'processo-nome': (_el, v) => mudarProcesso((q) => ({ ...q, nome: v.trim() })),
    'processo-versao': (_el, v) => {
      if (/^v\d+\.\d+$/.test(v.trim())) mudarProcesso((q) => ({ ...q, versao: v.trim() }));
      else avisar('erro', 'Versão deve seguir o padrão v1.0');
    },
    'processo-meta': (el, v) => {
      const chave = el.dataset.meta ?? '';
      mudarProcesso((q) => ({ ...q, metadados: { ...q.metadados, [chave]: v.trim() } }));
    },
  },
  enviar: {
    'raci-ator': (form) => {
      const campo = /** @type {HTMLInputElement} */ (form.elements.namedItem('ator'));
      const nome = campo.value.trim();
      if (!nome) return;
      mudarProcesso((q) => ({ ...q, raci: { ...q.raci, atoresExtras: [...q.raci.atoresExtras, nome] } }));
      campo.value = '';
    },
  },
});

/**
 * @param {HTMLElement} regiao
 * @param {Estado} s
 * @param {Problema[]} problemas
 * @param {Analise} analise
 */
export function desenharPainel(regiao, s, problemas, analise) {
  const p = s.processo;
  if (!p) return;
  const aba = s.ui.aba;
  const erros = problemas.filter((x) => x.severidade === 'erro').length;
  atualizar(
    regiao,
    h(
      'div',
      { class: 'abas', role: 'tablist' },
      ABAS.map(([id, rotulo]) =>
        h(
          'button',
          {
            role: 'tab',
            'aria-selected': String(aba === id),
            class: aba === id ? 'ativa' : '',
            dataset: { clique: 'painel-aba', aba: id },
          },
          rotulo,
          id === 'problemas' &&
            problemas.length > 0 &&
            h('span', { class: ['contador', erros && 'erro'] }, String(erros || problemas.length)),
        ),
      ),
    ),
    h(
      'div',
      // a chave muda com a aba: o conteúdo é trocado inteiro e a rolagem volta ao topo
      { class: 'lateral-corpo', role: 'tabpanel', dataset: { chave: `aba-${aba}` } },
      aba === 'etapa' && abaEtapa(s, problemas),
      aba === 'problemas' && abaProblemas(problemas),
      aba === 'analises' && abaAnalises(analise),
      aba === 'raci' && abaRaci(p),
      aba === 'processo' && abaProcesso(p),
    ),
  );
}

/**
 * @param {Estado} s
 * @param {Problema[]} problemas
 */
function abaEtapa(s, problemas) {
  const p = /** @type {Processo} */ (s.processo);
  const e = p.etapas.find((x) => x.id === s.selecionada);
  if (!e) {
    return h(
      'div',
      { class: 'vazio-lateral' },
      h('p', null, 'Selecione uma etapa no diagrama ou na tabela para editar os detalhes.'),
      h(
        'p',
        { class: 'mudo' },
        'No diagrama: clique numa caixa para ver as ações (acrescentar, ligar, trocar tipo, excluir). Clique duas vezes para renomear. Arraste para outra raia para trocar o responsável.',
      ),
    );
  }
  const def = DEFINICOES[e.tipo];
  const raia = resolverRaias(p).get(e.id);
  const dela = problemas.filter((x) => x.etapa === e.id);
  const rotuloDetalhe = { fim: 'Resultado', gw_complexo: 'Regra', anotacao: 'Ligada a', intermediario: 'Evento' }[
    /** @type {string} */ (e.tipo)
  ];

  return h(
    'div',
    { class: 'inspetor', dataset: { chave: `inspetor-${e.id}` } },
    h('div', { class: 'inspetor-cabeca' }, h('span', { class: 'etiqueta' }, e.id), h('strong', null, def.rotulo)),
    dela.length > 0 &&
      h(
        'ul',
        { class: 'problemas compacta' },
        dela.map((x) => h('li', { class: x.severidade }, h('span', { class: 'codigo' }, x.codigo), ` ${x.mensagem}`)),
      ),
    h('label', { class: 'campo' }, h('span', null, 'Tipo'), seletorTipo(e)),
    h(
      'label',
      { class: 'campo' },
      h('span', null, 'Descrição'),
      textoEtapa(e, 'descricao', { placeholder: 'O que acontece nesta etapa' }),
    ),
    def.ator !== 'nenhum'
      ? h(
          'label',
          { class: 'campo' },
          h('span', null, 'Responsável ', def.ator === 'obrigatorio' && h('em', null, 'obrigatório')),
          textoEtapa(e, 'ator', {
            list: 'lista-atores-lateral',
            placeholder: def.ator === 'opcional' ? `Herda: ${raia ?? ''}` : 'Pessoa ou área',
          }),
          h('datalist', { id: 'lista-atores-lateral' }, atoresConhecidos(p).map((a) => h('option', { value: a }))),
        )
      : h(
          'div',
          { class: 'campo' },
          h('span', null, 'Raia'),
          h('p', { class: 'herdado' }, `↳ ${raia ?? '—'} (herdada)`),
        ),
    (def.familia === 'atividade' || def.familia === 'gateway') &&
      h(
        'label',
        { class: 'campo' },
        h('span', null, 'Apoio'),
        textoEtapa(e, 'apoio', { placeholder: 'Sistema, documento ou observação' }),
      ),
    (def.saidasMax > 0 || e.saidas.length > 0) &&
      h('div', { class: 'campo' }, h('span', null, 'Saídas'), editorSaidas(e, p)),
    rotuloDetalhe && h('div', { class: 'campo' }, h('span', null, rotuloDetalhe), detalheEtapa(e, p)),
    h(
      'div',
      { class: 'inspetor-acoes' },
      h(
        'div',
        { class: 'linha' },
        h(
          'select',
          { value: s.ui.tipoNovo, 'aria-label': 'Tipo da nova etapa', dataset: { mudar: 'inspetor-tipo-novo' } },
          opcoes(TIPOS_ETAPA.map((t) => [t, DEFINICOES[t].rotulo])),
        ),
        h('button', { dataset: { clique: 'inspetor-inserir', id: e.id } }, 'Inserir depois'),
      ),
      h('button', { class: 'perigo-texto', dataset: { clique: 'inspetor-excluir', id: e.id } }, 'Excluir etapa'),
    ),
  );
}

/** @param {Problema[]} problemas */
function abaProblemas(problemas) {
  if (!problemas.length) return h('p', { class: 'vazio-lateral ok' }, 'Nenhum problema encontrado. ✓');
  return h(
    'ul',
    { class: 'problemas' },
    problemas.map((x) =>
      h(
        'li',
        { class: x.severidade },
        h(
          'button',
          { disabled: !x.etapa, dataset: { clique: 'problema-ir', etapa: x.etapa } },
          h('span', { class: 'codigo' }, x.codigo),
          h('span', null, x.mensagem),
        ),
      ),
    ),
  );
}

/**
 * @param {string} rotulo
 * @param {string | number} valor
 */
const dado = (rotulo, valor) => h('div', { class: 'dado' }, h('span', null, rotulo), h('strong', null, String(valor)));

/** @param {string[]} itens */
const listaOuNenhum = (itens) =>
  itens.length ? h('ul', { class: 'lista' }, itens.map((t) => h('li', null, t))) : h('p', { class: 'mudo' }, 'Nenhuma.');

/** @param {Analise} a */
function abaAnalises(a) {
  const m = a.metricas;
  return h(
    'div',
    { class: 'analises' },
    h(
      'div',
      { class: 'grade' },
      dado('Complexidade', `${a.nivel} · ${a.score}`),
      dado('Qualidade', `${a.qualidade}%`),
      dado('Etapas', m.total),
      dado('Gateways', m.gateways),
      dado('Raias', m.raias),
      dado('Handoffs', m.handoffs),
      dado('Retornos', m.retornos),
      dado('Automação', `${m.automacao}%`),
      dado('Caminhos', a.caminhos.total ? `${a.caminhos.total}` : '—'),
    ),
    a.caminhos.total > 0 &&
      h('p', { class: 'nota' }, `Do início ao fim: de ${a.caminhos.menor} a ${a.caminhos.maior} etapas.`),
    h('h3', null, 'Trocas entre áreas'),
    a.handoffs.length
      ? h(
          'ul',
          { class: 'lista' },
          a.handoffs.map((x) => h('li', null, `${x.de} → ${x.para} `, h('b', null, `×${x.vezes}`))),
        )
      : h('p', { class: 'mudo' }, 'Nenhuma.'),
    a.concentracao &&
      h('p', { class: 'nota' }, `${a.concentracao.raia} concentra ${a.concentracao.percentual}% das atividades.`),
    h('h3', null, 'Checklist'),
    h(
      'ul',
      { class: 'checklist' },
      a.checklist.map((c) => h('li', { class: c.ok ? 'ok' : 'falta' }, `${c.ok ? '✓' : '○'} ${c.rotulo}`)),
    ),
    h('h3', null, 'Recomendações'),
    listaOuNenhum(a.recomendacoes),
  );
}

/** @param {Processo} p */
function abaRaci(p) {
  const m = montarMatrizRaci(p);
  if (!m.linhas.length) return h('p', { class: 'vazio-lateral' }, 'A RACI aparece quando houver atividades ou decisões.');
  return h(
    'div',
    null,
    h('p', { class: 'nota' }, 'R vem do responsável (A nas decisões). Clique em A, C ou I para atribuir.'),
    h(
      'div',
      { class: 'tabela-rolagem raci-rolagem' },
      h(
        'table',
        { class: 'raci' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Atividade'), m.atores.map((a) => h('th', { scope: 'col' }, a)))),
        h(
          'tbody',
          null,
          m.linhas.map((l) =>
            h(
              'tr',
              { dataset: { chave: `raci-${l.etapa}` } },
              h('td', null, h('b', null, l.etapa), ` ${l.descricao}`),
              m.atores.map((a, i) =>
                h(
                  'td',
                  { class: 'celula' },
                  /** @type {const} */ (['R', 'A', 'C', 'I']).map((letra) => {
                    const ativo = l.celulas[i]?.includes(letra) ?? false;
                    if (letra === 'R') return ativo ? h('span', { class: 'letra R' }, 'R') : null;
                    return h(
                      'button',
                      {
                        class: ['letra', letra, ativo && 'ativa'],
                        'aria-pressed': String(ativo),
                        'aria-label': `${letra} para ${a} em ${l.etapa}`,
                        dataset: { clique: 'raci-letra', etapa: l.etapa, ator: a, letra },
                      },
                      letra,
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      'form',
      { class: 'linha', dataset: { enviar: 'raci-ator' } },
      h('input', { name: 'ator', placeholder: 'Outra pessoa ou área (ex.: Jurídico)', 'aria-label': 'Ator adicional' }),
      h('button', { type: 'submit' }, 'Adicionar'),
    ),
    h(
      'label',
      { class: 'marcador' },
      h('input', { type: 'checkbox', checked: p.raci.revisada, dataset: { mudar: 'raci-revisada' } }),
      'RACI revisada',
    ),
  );
}

/** @param {Processo} p */
function abaProcesso(p) {
  const raias = ordemDasRaias(p);
  const manuais = Object.keys(p.layout.posicoes).length;
  /**
   * @param {string} chave
   * @param {string} rotulo
   */
  const meta = (chave, rotulo) =>
    h(
      'label',
      { class: 'campo' },
      h('span', null, rotulo),
      campoTexto('processo-meta', p.metadados[chave] ?? '', { dataset: { meta: chave } }),
    );

  return h(
    'div',
    { class: 'inspetor' },
    h('label', { class: 'campo' }, h('span', null, 'Nome do processo'), campoTexto('processo-nome', p.nome)),
    h(
      'div',
      { class: 'linha' },
      h('label', { class: 'campo' }, h('span', null, 'Versão'), campoTexto('processo-versao', p.versao)),
      h(
        'label',
        { class: 'campo' },
        h('span', null, 'Data'),
        h('input', { type: 'date', value: p.data, dataset: { mudar: 'processo-data' } }),
      ),
    ),
    meta('area', 'Área responsável'),
    meta('macro', 'Macroprocesso'),
    h('h3', null, 'Ordem das raias'),
    h(
      'ol',
      { class: 'raias' },
      raias.map((r, i) =>
        h(
          'li',
          { dataset: { chave: `raia-${r}` } },
          h('span', null, r),
          h(
            'span',
            { class: 'acoes' },
            h(
              'button',
              { class: 'icone', disabled: i === 0, 'aria-label': `Subir ${r}`, dataset: { clique: 'raia-mover', i, d: -1 } },
              '▲',
            ),
            h(
              'button',
              {
                class: 'icone',
                disabled: i === raias.length - 1,
                'aria-label': `Descer ${r}`,
                dataset: { clique: 'raia-mover', i, d: 1 },
              },
              '▼',
            ),
          ),
        ),
      ),
    ),
    p.layout.ordemRaias && h('button', { class: 'mini', dataset: { clique: 'raias-automatico' } }, 'Ordem automática'),
    manuais > 0 && [
      h('h3', null, 'Layout'),
      h('p', { class: 'nota' }, `${manuais} etapa(s) com posição definida à mão.`),
      h('button', { class: 'mini', dataset: { clique: 'posicoes-automatico' } }, 'Reorganizar automaticamente'),
    ],
  );
}
