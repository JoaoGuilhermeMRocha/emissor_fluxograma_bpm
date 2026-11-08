/**
 * Janelas: biblioteca de processos, relatório de importação e conflito
 * entre o arquivo e a cópia do navegador.
 */
/** @import { Processo } from '../../core/index.js' */
/** @import { RegistroProcesso } from '../armazenamento/banco.js' */
/** @import { ConflitoPendente, Estado, Modal } from '../estado/loja.js' */
import { normalizarGrafo, relatorioEmTexto, validar } from '../../core/index.js';
import { excluirRegistro, gravarProcesso, listarProcessos } from '../armazenamento/banco.js';
import { atualizar, baixar, h, registrar } from '../dom.js';
import { importarPasta } from '../acoes.js';
import { nomeSemExtensao } from '../importacao-lote.js';
import {
  abrirDaBiblioteca,
  abrirNovoNaBiblioteca,
  avisar,
  definirUi,
  estado,
  novoProcesso,
} from '../estado/loja.js';

/** Fecha a janela aberta. */
const fechar = () => definirUi({ modal: null });

/**
 * Altera a janela aberta, se ela ainda for do tipo esperado.
 * @template {NonNullable<Modal>['tipo']} T
 * @param {T} tipo
 * @param {(m: Extract<NonNullable<Modal>, { tipo: T }>) => Partial<Extract<NonNullable<Modal>, { tipo: T }>>} mudar
 */
function mudarModal(tipo, mudar) {
  const m = estado().ui.modal;
  if (m?.tipo !== tipo) return;
  const atual = /** @type {Extract<NonNullable<Modal>, { tipo: T }>} */ (m);
  definirUi({ modal: { ...atual, ...mudar(atual) } });
}

/** Abre a biblioteca e carrega a lista de processos. */
export async function abrirBiblioteca() {
  definirUi({ modal: { tipo: 'biblioteca', registros: null, busca: '', confirmarExclusao: null } });
  await recarregarBiblioteca();
}

async function recarregarBiblioteca() {
  const registros = await listarProcessos();
  mudarModal('biblioteca', () => ({ registros }));
}

/**
 * Executa e, se der certo, fecha a janela.
 * @param {() => Promise<unknown>} fn
 */
const eFechar = async (fn) => {
  await fn();
  fechar();
};

/** @param {HTMLElement} el */
const registroDoBotao = (el) => {
  const m = estado().ui.modal;
  return m?.tipo === 'biblioteca' ? m.registros?.find((r) => r.id === el.dataset.registro) : undefined;
};

/** @returns {ConflitoPendente | undefined} */
const conflitoAberto = () => {
  const m = estado().ui.modal;
  return m?.tipo === 'conflito' ? m.dados : undefined;
};

/** Cache do resultado da importação: normalizar é caro e o resultado só muda com o pool e a opção de layout. */
let cacheImportacao = /** @type {{ chave: unknown[], resultado: ReturnType<typeof normalizarGrafo> } | null} */ (null);

/** @param {Extract<NonNullable<Modal>, { tipo: 'importacao' }>} m */
function resultadoImportacao(m) {
  const chave = [m.dados, m.indice, m.manterLayout];
  if (!cacheImportacao || cacheImportacao.chave.some((v, i) => v !== chave[i])) {
    const g = m.dados.grafos[m.indice];
    const nome = g.titulo?.trim() ? undefined : nomeSemExtensao(m.dados.nomeArquivo);
    const resultado = normalizarGrafo(g, { formato: m.dados.formato, manterLayout: m.manterLayout, ...(nome ? { nome } : {}) });
    cacheImportacao = { chave, resultado };
  }
  return cacheImportacao.resultado;
}

registrar({
  clique: {
    'modal-fechar': () => fechar(),
    'biblioteca-novo': () => void eFechar(() => novoProcesso()),
    'biblioteca-importar-pasta': () => void importarPasta(),
    'lote-abrir': (el) => void eFechar(() => abrirDaBiblioteca(el.dataset.registro ?? '')),
    'lote-biblioteca': () => void abrirBiblioteca(),
    'lote-relatorio': () => {
      const m = estado().ui.modal;
      if (m?.tipo !== 'lote') return;
      const linhas = m.itens.map((i) => `${ROTULO_LOTE[i.status]}\t${i.arquivo}${i.nome ? ` → ${i.nome}` : ''}\t${i.detalhe}`);
      baixar(linhas.join('\n') + '\n', 'relatorio-importacao-lote.txt', 'text/plain;charset=utf-8');
    },
    'biblioteca-abrir': (el) => void eFechar(() => abrirDaBiblioteca(el.dataset.registro ?? '')),
    'biblioteca-duplicar': async (el) => {
      const r = registroDoBotao(el);
      if (!r) return;
      const id = crypto.randomUUID();
      const agora = new Date().toISOString();
      /** @type {Processo} */
      const copia = {
        ...structuredClone(r.processo),
        id,
        linhagem: id,
        nome: `${r.processo.nome} (cópia)`,
        revisao: 0,
        criadoEm: agora,
        alteradoEm: agora,
      };
      await gravarProcesso(copia);
      avisar('ok', `“${copia.nome}” criado`);
      await recarregarBiblioteca();
    },
    'biblioteca-excluir': (el) => mudarModal('biblioteca', () => ({ confirmarExclusao: el.dataset.registro ?? null })),
    'biblioteca-cancelar-exclusao': () => mudarModal('biblioteca', () => ({ confirmarExclusao: null })),
    'biblioteca-confirmar-exclusao': async (el) => {
      const id = el.dataset.registro ?? '';
      await excluirRegistro(id);
      mudarModal('biblioteca', () => ({ confirmarExclusao: null }));
      if (id === estado().processo?.id) {
        const m = estado().ui.modal;
        const resto = (m?.tipo === 'biblioteca' ? (m.registros ?? []) : []).filter((x) => x.id !== id);
        if (resto[0]) await abrirDaBiblioteca(resto[0].id);
        else await novoProcesso();
      }
      await recarregarBiblioteca();
    },
    'importacao-relatorio': () => {
      const m = estado().ui.modal;
      if (m?.tipo !== 'importacao') return;
      const nome = `relatorio-importacao-${m.dados.nomeArquivo.replace(/\.[^.]+$/, '')}.txt`;
      baixar(relatorioEmTexto(resultadoImportacao(m).relatorio), nome, 'text/plain;charset=utf-8');
    },
    'importacao-confirmar': async () => {
      const m = estado().ui.modal;
      if (m?.tipo !== 'importacao') return;
      const { processo } = resultadoImportacao(m);
      await abrirNovoNaBiblioteca(processo);
      avisar('ok', `“${processo.nome}” importado`);
      fechar();
    },
    'conflito-arquivo': () => {
      const c = conflitoAberto();
      if (c) void eFechar(() => abrirNovoNaBiblioteca(c.arquivo, registroDoArquivo(c)));
    },
    'conflito-navegador': () => {
      const c = conflitoAberto();
      if (c) void eFechar(() => abrirDaBiblioteca(c.navegador.id));
    },
    'conflito-os-dois': () => {
      const c = conflitoAberto();
      if (!c) return;
      const id = crypto.randomUUID();
      void eFechar(() => abrirNovoNaBiblioteca({ ...c.arquivo, id, nome: `${c.arquivo.nome} (do arquivo)` }));
    },
  },
  digitar: {
    'biblioteca-busca': (el) => mudarModal('biblioteca', () => ({ busca: /** @type {HTMLInputElement} */ (el).value })),
  },
  mudar: {
    'importacao-pool': (el) =>
      mudarModal('importacao', () => ({ indice: Number(/** @type {HTMLSelectElement} */ (el).value) })),
    'importacao-layout': (el) =>
      mudarModal('importacao', () => ({ manterLayout: /** @type {HTMLInputElement} */ (el).checked })),
  },
});

/** @param {ConflitoPendente} c */
const registroDoArquivo = (c) => ({
  arquivo: { nome: c.nomeArquivo, ...(c.handle ? { handle: c.handle } : {}) },
  revisaoExportada: c.arquivo.revisao,
});

/**
 * Liga o fechamento pelo Esc e pelo clique fora. Chamar uma vez.
 * @param {HTMLElement} regiao
 */
export function ligarModais(regiao) {
  // `close` não sobe pela árvore, mas passa pelos ancestrais na fase de captura
  regiao.addEventListener('close', () => estado().ui.modal && fechar(), true);
  regiao.addEventListener('click', (ev) => {
    if (ev.target instanceof HTMLDialogElement) ev.target.close();
  });
}

/**
 * @param {HTMLElement} regiao
 * @param {Estado} s
 */
export function desenharModais(regiao, s) {
  const m = s.ui.modal;
  atualizar(
    regiao,
    m?.tipo === 'biblioteca' && biblioteca(m, s),
    m?.tipo === 'importacao' && importacao(m),
    m?.tipo === 'conflito' && conflito(m.dados),
    m?.tipo === 'lote' && lote(m),
  );
  const d = regiao.querySelector('dialog');
  if (d && !d.open) d.showModal();
}

/**
 * @param {string} titulo
 * @param {string} tipo
 * @param {boolean} largo
 * @param {...import('../dom.js').Filho | import('../dom.js').Filho[]} conteudo
 */
function modal(titulo, tipo, largo, ...conteudo) {
  return h(
    'dialog',
    { class: ['modal', largo && 'largo'], 'aria-label': titulo, dataset: { chave: `modal-${tipo}` } },
    h(
      'div',
      { class: 'modal-conteudo' },
      h(
        'header',
        { class: 'modal-cabeca' },
        h('h2', null, titulo),
        h('button', { class: 'icone', 'aria-label': 'Fechar', dataset: { clique: 'modal-fechar' } }, '×'),
      ),
      ...conteudo,
    ),
  );
}

/** @param {string} iso */
const dataRelativa = (iso) => {
  const d = new Date(iso);
  const mesmoDia = d.toDateString() === new Date().toDateString();
  return mesmoDia
    ? `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('pt-BR');
};

/**
 * @param {Extract<NonNullable<Modal>, { tipo: 'biblioteca' }>} m
 * @param {Estado} s
 */
function biblioteca(m, s) {
  const atualId = s.processo?.id;
  const t = m.busca.trim().toLowerCase();
  /** @param {RegistroProcesso} r */
  const casa = (r) => !t || `${r.nome} ${Object.values(r.processo.metadados).join(' ')}`.toLowerCase().includes(t);
  const filtrados = (m.registros ?? []).filter(casa);

  return modal(
    'Biblioteca de processos',
    'biblioteca',
    true,
    h(
      'div',
      { class: 'linha modal-biblioteca-topo' },
      h('input', {
        type: 'search',
        value: m.busca,
        placeholder: 'Buscar por nome, área, macroprocesso…',
        'aria-label': 'Buscar',
        autofocus: true,
        dataset: { digitar: 'biblioteca-busca' },
      }),
      h(
        'button',
        { title: 'Importa todos os fluxos de uma pasta e das subpastas', dataset: { clique: 'biblioteca-importar-pasta' } },
        'Importar pasta…',
      ),
      h('button', { class: 'primario', dataset: { clique: 'biblioteca-novo' } }, '+ Novo processo'),
    ),
    h(
      'p',
      { class: 'nota' },
      'Os processos ficam guardados neste navegador. Para ter uma cópia segura ou compartilhar, use “Salvar arquivo”.',
    ),
    m.registros === null
      ? h('p', { class: 'mudo' }, 'Carregando…')
      : filtrados.length === 0
        ? h('p', { class: 'vazio' }, 'Nenhum processo encontrado.')
        : h(
            'ul',
            { class: 'biblioteca' },
            filtrados.map((r) => {
              const erros = validar(r.processo).filter((x) => x.severidade === 'erro').length;
              const naoExportado = r.revisaoExportada !== r.processo.revisao;
              const confirmando = m.confirmarExclusao === r.id;
              return h(
                'li',
                { class: r.id === atualId ? 'atual' : '', dataset: { chave: `reg-${r.id}` } },
                h(
                  'button',
                  { class: 'item-principal', dataset: { clique: 'biblioteca-abrir', registro: r.id } },
                  h('strong', null, r.nome || 'Sem nome'),
                  h(
                    'span',
                    { class: 'mudo' },
                    `${r.processo.versao} · ${r.processo.etapas.length} etapas · alterado ${dataRelativa(r.atualizadoEm)}`,
                    r.processo.metadados.area ? ` · ${r.processo.metadados.area}` : '',
                  ),
                  h(
                    'span',
                    { class: 'selos' },
                    r.id === atualId && h('span', { class: 'selo' }, 'aberto'),
                    erros > 0 && h('span', { class: 'selo erro' }, `${erros} erro(s)`),
                    naoExportado &&
                      h(
                        'span',
                        { class: 'selo aviso', title: 'Alterado depois da última vez que foi salvo em arquivo' },
                        'sem arquivo atualizado',
                      ),
                  ),
                ),
                h(
                  'div',
                  { class: 'item-acoes' },
                  h('button', { class: 'mini', dataset: { clique: 'biblioteca-duplicar', registro: r.id } }, 'Duplicar'),
                  confirmando
                    ? [
                        h(
                          'button',
                          { class: 'mini perigo', dataset: { clique: 'biblioteca-confirmar-exclusao', registro: r.id } },
                          'Confirmar exclusão',
                        ),
                        h('button', { class: 'mini', dataset: { clique: 'biblioteca-cancelar-exclusao' } }, 'Cancelar'),
                      ]
                    : h('button', { class: 'mini', dataset: { clique: 'biblioteca-excluir', registro: r.id } }, 'Excluir'),
                ),
              );
            }),
          ),
  );
}

/** @param {Extract<NonNullable<Modal>, { tipo: 'importacao' }>} m */
function importacao(m) {
  const { dados } = m;
  const r = resultadoImportacao(m).relatorio;
  const erros = r.problemas.filter((x) => x.severidade === 'erro').length;
  /** @param {string} titulo @param {string[]} itens */
  const secao = (titulo, itens) =>
    itens.length > 0 && [h('h3', null, titulo), h('ul', { class: 'lista' }, itens.map((x) => h('li', null, x)))];
  const sugestoes = [
    r.sugestoes.inicio.length > 0 && `Sem evento de início. Candidatas: ${r.sugestoes.inicio.join(', ')}`,
    r.sugestoes.fim.length > 0 && `Sem evento de fim. Candidatas: ${r.sugestoes.fim.join(', ')}`,
  ].filter((x) => typeof x === 'string');

  return modal(
    `Importar ${dados.nomeFormato}`,
    'importacao',
    true,
    h(
      'p',
      null,
      h('strong', null, dados.nomeArquivo),
      ' vai virar um ',
      h('strong', null, 'processo novo'),
      ' na biblioteca. Nada existente é alterado.',
    ),
    dados.grafos.length > 1 &&
      h(
        'label',
        { class: 'campo' },
        h('span', null, `O arquivo tem ${dados.grafos.length} pools. Qual importar?`),
        h(
          'select',
          { value: m.indice, dataset: { mudar: 'importacao-pool' } },
          dados.grafos.map((g, i) => h('option', { value: i }, g.titulo ?? `Pool ${i + 1}`)),
        ),
      ),
    h(
      'div',
      { class: 'grade resumo-importacao' },
      h('div', { class: 'dado' }, h('span', null, 'Etapas'), h('strong', null, String(r.contagens.etapas))),
      h('div', { class: 'dado' }, h('span', null, 'Setas'), h('strong', null, String(r.contagens.setas))),
      h('div', { class: 'dado' }, h('span', null, 'Raias'), h('strong', null, String(r.contagens.raias))),
      h(
        'div',
        { class: ['dado', erros && 'destaque'] },
        h('span', null, 'Problemas'),
        h('strong', null, `${erros} erro(s) · ${r.problemas.length - erros} outros`),
      ),
    ),
    secao('O que não foi importado', r.perdas),
    secao('Avisos', r.avisos),
    secao('Sugestões', sugestoes),
    h(
      'label',
      { class: 'marcador' },
      h('input', { type: 'checkbox', checked: m.manterLayout, dataset: { mudar: 'importacao-layout' } }),
      'Manter o desenho original (quando o arquivo tiver coordenadas)',
    ),
    h(
      'footer',
      { class: 'modal-rodape' },
      h('button', { dataset: { clique: 'importacao-relatorio' } }, 'Baixar relatório'),
      h('span', { class: 'espaco' }),
      h('button', { dataset: { clique: 'modal-fechar' } }, 'Cancelar'),
      h('button', { class: 'primario', dataset: { clique: 'importacao-confirmar' } }, 'Importar'),
    ),
  );
}

/** @param {ConflitoPendente} c */
function conflito(c) {
  const { arquivo, navegador } = c;
  /** @param {Processo} p */
  const desc = (p) =>
    `${p.versao} · revisão ${p.revisao} · ${p.etapas.length} etapas · alterado em ${new Date(p.alteradoEm).toLocaleString('pt-BR')}`;
  return modal(
    'Este processo já está no navegador',
    'conflito',
    false,
    h('p', null, `O arquivo e a cópia do navegador são versões diferentes de “${arquivo.nome}”. Qual usar?`),
    h(
      'div',
      { class: 'comparacao' },
      h('div', null, h('h3', null, 'Arquivo'), h('p', { class: 'mudo' }, desc(arquivo))),
      h('div', null, h('h3', null, 'Navegador'), h('p', { class: 'mudo' }, desc(navegador.processo))),
    ),
    h(
      'footer',
      { class: 'modal-rodape coluna' },
      h(
        'button',
        { class: 'primario', dataset: { clique: 'conflito-arquivo' } },
        'Usar o do arquivo (substitui a cópia do navegador)',
      ),
      h('button', { dataset: { clique: 'conflito-navegador' } }, 'Manter o do navegador'),
      h('button', { dataset: { clique: 'conflito-os-dois' } }, 'Guardar os dois (o do arquivo vira uma cópia)'),
    ),
  );
}

/** @type {Record<import('../importacao-lote.js').ItemLote['status'], string>} */
const ROTULO_LOTE = { importado: 'Importado', igual: 'Já estava', conflito: 'Conflito', erro: 'Erro' };
const CLASSE_LOTE = { importado: 'ok', igual: '', conflito: 'aviso', erro: 'erro' };

/** @param {Extract<NonNullable<Modal>, { tipo: 'lote' }>} m */
function lote(m) {
  const andando = m.feitos < m.total;
  /** @param {import('../importacao-lote.js').ItemLote['status']} st */
  const conta = (st) => m.itens.filter((i) => i.status === st).length;
  return modal(
    andando ? 'Importando arquivos…' : 'Importação concluída',
    'lote',
    true,
    h('p', { 'aria-live': 'polite' }, andando ? `${m.feitos} de ${m.total} arquivos lidos` : `${m.total} arquivo(s) lidos.`, ' Nada que já estava na biblioteca foi alterado.'),
    h(
      'div',
      { class: 'grade resumo-importacao' },
      h('div', { class: 'dado' }, h('span', null, 'Importados'), h('strong', null, String(conta('importado')))),
      h('div', { class: 'dado' }, h('span', null, 'Já estavam'), h('strong', null, String(conta('igual')))),
      h('div', { class: ['dado', conta('conflito') > 0 && 'destaque'] }, h('span', null, 'Conflitos'), h('strong', null, String(conta('conflito')))),
      h('div', { class: ['dado', conta('erro') > 0 && 'destaque'] }, h('span', null, 'Erros'), h('strong', null, String(conta('erro')))),
    ),
    h(
      'ul',
      { class: 'biblioteca lote' },
      m.itens.map((i, n) =>
        h(
          'li',
          { dataset: { chave: `lote-${n}` } },
          h(
            'div',
            { class: 'item-principal' },
            h('strong', null, i.nome ?? i.arquivo),
            h('span', { class: 'mudo' }, i.nome ? `${i.arquivo} · ${i.detalhe}` : i.detalhe),
          ),
          h('span', { class: ['selo', CLASSE_LOTE[i.status]] }, ROTULO_LOTE[i.status]),
          i.id && i.status !== 'conflito' && h('button', { class: 'mini', dataset: { clique: 'lote-abrir', registro: i.id } }, 'Abrir'),
        ),
      ),
    ),
    h(
      'footer',
      { class: 'modal-rodape' },
      h('button', { disabled: andando, dataset: { clique: 'lote-relatorio' } }, 'Baixar relatório'),
      h('span', { class: 'espaco' }),
      h('button', { disabled: andando, dataset: { clique: 'lote-biblioteca' } }, 'Ver na biblioteca'),
      h('button', { class: 'primario', disabled: andando, dataset: { clique: 'modal-fechar' } }, 'Fechar'),
    ),
  );
}
