/**
 * Barra do topo (nome do processo, salvamento, ações) e avisos flutuantes.
 */
/** @import { Estado, EstadoSalvamento } from '../estado/loja.js' */
/** @import { FormatoExportacao } from '../acoes.js' */
import { abrir, exportar, salvarComoArquivo } from '../acoes.js';
import { atualizar, campoTexto, h, registrar, s } from '../dom.js';
import {
  alternarTema,
  definirUi,
  desfazer,
  dispensarAviso,
  estado,
  novoProcesso,
  refazer,
} from '../estado/loja.js';
import { abrirBiblioteca } from './modais.js';

/** @type {[FormatoExportacao, string][]} */
const FORMATOS = [
  ['bpmn', 'BPMN 2.0 (.bpmn)'],
  ['xlsx', 'Planilha Excel (.xlsx)'],
  ['csv', 'Planilha CSV (.csv)'],
  ['svg', 'Imagem SVG (.svg)'],
];

registrar({
  clique: {
    'topo-desfazer': () => desfazer(),
    'topo-refazer': () => refazer(),
    'topo-tema': () => alternarTema(),
    'topo-biblioteca': () => void abrirBiblioteca(),
    'topo-novo': () => void novoProcesso(),
    'topo-abrir': () => void abrir(),
    'topo-salvar': () => void salvarComoArquivo(),
    'topo-menu-exportar': () => definirUi({ menuExportar: !estado().ui.menuExportar }),
    'topo-exportar': (el) => {
      definirUi({ menuExportar: false });
      void exportar(/** @type {FormatoExportacao} */ (el.dataset.formato));
    },
    'aviso-dispensar': (el) => dispensarAviso(Number(el.dataset.aviso)),
  },
});

// Menu de exportação: fecha ao clicar fora
document.addEventListener('mousedown', (ev) => {
  if (estado().ui.menuExportar && !(ev.target instanceof Element && ev.target.closest('.menu'))) {
    definirUi({ menuExportar: false });
  }
});

/** @param {EstadoSalvamento} sv */
function textoSalvamento(sv) {
  switch (sv.estado) {
    case 'pronto':
      return 'Salvo no navegador';
    case 'pendente':
      return 'Alterações pendentes…';
    case 'salvando':
      return 'Salvando…';
    case 'salvo':
      return `Salvo às ${new Date(sv.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    case 'erro':
      return 'Erro ao salvar';
  }
}

const marca = () =>
  h(
    'div',
    { class: 'marca', 'aria-label': 'Mapeador de Processos' },
    s(
      'svg',
      { viewBox: '0 0 32 32', width: 26, height: 26, 'aria-hidden': 'true' },
      s('rect', { width: 32, height: 32, rx: 7, fill: 'var(--primaria)' }),
      s('circle', { cx: 8, cy: 16, r: 3.2, fill: '#fff' }),
      s('rect', { x: 13, y: 12, width: 8, height: 8, rx: 2, fill: '#fff' }),
      s('path', { d: 'M24 16l3-3 3 3-3 3z', fill: '#fff' }),
      s('path', { d: 'M11 16h2M21 16h3', stroke: '#fff', 'stroke-width': 1.6 }),
    ),
    h('span', { class: 'marca-nome' }, 'Mapeador'),
  );

/**
 * @param {HTMLElement} regiao
 * @param {Estado} st
 */
export function desenharTopo(regiao, st) {
  const p = st.processo;
  if (!p) return;
  const sv = st.salvamento;
  const semArquivo = st.registro.revisaoExportada !== p.revisao;
  const escuro = st.tema === 'escuro';
  const rotuloTema = escuro ? 'Usar tema claro' : 'Usar tema escuro';

  atualizar(
    regiao,
    marca(),
    h(
      'div',
      { class: 'titulo-processo' },
      campoTexto('processo-nome', p.nome, { 'aria-label': 'Nome do processo', placeholder: 'Nome do processo' }),
      h(
        'span',
        {
          class: ['estado-salvamento', sv.estado],
          title: sv.estado === 'erro' ? sv.erro : 'Tudo é salvo automaticamente neste navegador',
        },
        textoSalvamento(sv),
      ),
    ),
    h(
      'nav',
      { class: 'acoes', 'aria-label': 'Ações' },
      h(
        'button',
        { disabled: !st.passado.length, title: 'Desfazer (Ctrl+Z)', 'aria-label': 'Desfazer', dataset: { clique: 'topo-desfazer' } },
        '↶',
      ),
      h(
        'button',
        {
          disabled: !st.futuro.length,
          title: 'Refazer (Ctrl+Shift+Z)',
          'aria-label': 'Refazer',
          dataset: { clique: 'topo-refazer' },
        },
        '↷',
      ),
      h(
        'button',
        { class: 'botao-tema', title: rotuloTema, 'aria-label': rotuloTema, dataset: { clique: 'topo-tema' } },
        escuro ? '☀' : '☾',
      ),
      h('span', { class: 'sep' }),
      h('button', { dataset: { clique: 'topo-biblioteca' } }, 'Biblioteca'),
      h('button', { dataset: { clique: 'topo-novo' } }, 'Novo'),
      h('button', { title: 'Abrir .processo, BPMN, Excel ou CSV', dataset: { clique: 'topo-abrir' } }, 'Abrir…'),
      h(
        'div',
        { class: 'menu' },
        h(
          'button',
          {
            'aria-expanded': String(st.ui.menuExportar),
            'aria-haspopup': 'menu',
            dataset: { clique: 'topo-menu-exportar' },
          },
          'Exportar ▾',
        ),
        st.ui.menuExportar &&
          h(
            'div',
            { class: 'menu-itens', role: 'menu' },
            FORMATOS.map(([f, r]) =>
              h('button', { role: 'menuitem', dataset: { clique: 'topo-exportar', formato: f } }, r),
            ),
          ),
      ),
      h(
        'button',
        {
          class: ['primario', semArquivo && 'com-indicador'],
          title: semArquivo ? 'Há alterações que ainda não estão em arquivo (Ctrl+S)' : 'Arquivo atualizado (Ctrl+S)',
          dataset: { clique: 'topo-salvar' },
        },
        'Salvar arquivo',
      ),
    ),
  );
}

/**
 * @param {HTMLElement} regiao
 * @param {Estado} st
 */
export function desenharAvisos(regiao, st) {
  atualizar(
    regiao,
    st.avisos.map((a) =>
      h(
        'div',
        { class: ['notificacao', a.tipo], dataset: { chave: `aviso-${a.id}` } },
        h('span', null, a.texto),
        h(
          'button',
          { class: 'icone', 'aria-label': 'Dispensar', dataset: { clique: 'aviso-dispensar', aviso: a.id } },
          '×',
        ),
      ),
    ),
  );
}
