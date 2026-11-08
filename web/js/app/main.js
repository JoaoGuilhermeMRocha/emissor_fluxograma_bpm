/**
 * Ponto de entrada da interface: liga os eventos, monta o editor do
 * diagrama e redesenha as regiões da tela a cada mudança da loja.
 */
/** @import { Analise, Problema, Processo } from '../core/index.js' */
/** @import { Estado } from './estado/loja.js' */
import { analisar, validar } from '../core/index.js';
import { abrir, salvarComoArquivo } from './acoes.js';
import { ligarEventos, mensagem } from './dom.js';
import { assinar, avisar, desfazer, estado, inicializar, refazer } from './estado/loja.js';
import * as loja from './estado/loja.js';
import { aplicarTema } from './tema.js';
import { desenharIndicadores, montarDiagrama } from './visoes/diagrama.js';
import { desenharModais, ligarModais } from './visoes/modais.js';
import { desenharPainel } from './visoes/painel.js';
import { desenharGaveta } from './visoes/tabela.js';
import { desenharAvisos, desenharTopo } from './visoes/topo.js';

/** @param {string} id */
const regiao = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Região #${id} não encontrada no index.html`);
  return el;
};

const R = {
  app: regiao('app'),
  carregando: regiao('carregando'),
  topo: regiao('topo'),
  indicadores: regiao('indicadores'),
  editor: regiao('editor-diagrama'),
  gaveta: regiao('gaveta'),
  lateral: regiao('lateral'),
  notificacoes: regiao('notificacoes'),
  modais: regiao('modais'),
};

/* Validação e análises só são refeitas quando o processo muda. */
/** @type {{ p: Processo | null, problemas: Problema[], analise: Analise | null }} */
let derivados = { p: null, problemas: [], analise: null };

/** @param {Processo} p */
function derivadosDe(p) {
  if (derivados.p !== p) derivados = { p, problemas: validar(p), analise: analisar(p) };
  return { problemas: derivados.problemas, analise: /** @type {Analise} */ (derivados.analise) };
}

/** @param {Estado} s */
function desenhar(s) {
  if (!s.processo) return;
  const { problemas, analise } = derivadosDe(s.processo);
  desenharTopo(R.topo, s);
  desenharIndicadores(R.indicadores, analise, problemas);
  desenharGaveta(R.gaveta, s, problemas);
  desenharPainel(R.lateral, s, problemas, analise);
  desenharAvisos(R.notificacoes, s);
  desenharModais(R.modais, s);
}

/* Várias mudanças seguidas viram um desenho só. */
let agendado = false;
function agendarDesenho() {
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => {
    agendado = false;
    desenhar(estado());
  });
}

/** Atalhos: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+S, Ctrl+O. */
function ligarAtalhos() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || !estado().processo) return;
      const editandoTexto =
        e.target instanceof Element && e.target.matches('input, textarea, select, [contenteditable="true"]');
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void salvarComoArquivo();
      } else if (k === 'o') {
        e.preventDefault();
        void abrir();
      } else if (!editandoTexto && (k === 'z' || k === 'y')) {
        e.preventDefault();
        e.stopPropagation(); // o bpmn-js tem o próprio desfazer; o histórico que vale é o do modelo
        if (k === 'z' && !e.shiftKey) desfazer();
        else refazer();
      }
    },
    true,
  );
}

async function iniciar() {
  aplicarTema(estado().tema);
  ligarEventos();
  ligarAtalhos();
  ligarModais(R.modais);

  let resultado;
  try {
    resultado = await inicializar();
  } catch (e) {
    R.carregando.replaceChildren();
    R.carregando.append(
      Object.assign(document.createElement('h1'), { textContent: 'Não foi possível abrir o armazenamento do navegador' }),
      Object.assign(document.createElement('p'), { textContent: mensagem(e) }),
      Object.assign(document.createElement('p'), {
        className: 'mudo',
        textContent:
          'Em janelas anônimas ou com dados de sites bloqueados, o navegador pode impedir o salvamento local.',
      }),
    );
    return;
  }

  R.carregando.hidden = true;
  R.app.hidden = false;
  assinar(agendarDesenho);
  desenhar(estado());
  const modeler = montarDiagrama(R.editor);
  if (resultado === 'continuou') avisar('info', 'Continuando de onde você parou.');

  // Só no servidor local: acesso ao estado pelo console (e pelos testes no navegador)
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    Object.assign(window, { __mapeador: { loja, modeler } });
  }
}

void iniciar();
