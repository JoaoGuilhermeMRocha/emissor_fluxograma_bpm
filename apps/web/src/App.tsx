import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  abrirArquivo,
  adicionarEtapa,
  analisar,
  EXTENSOES_ACEITAS,
  exportarBpmn,
  exportarCsv,
  exportarXlsx,
  nomeArquivoBpmn,
  nomeDoArquivo,
  serializarProcesso,
  slug,
  validar,
  type Processo,
} from '@mapeador/core';
import { abrirArquivoDoDisco, salvarArquivo } from './armazenamento/arquivos';
import { lerRegistro } from './armazenamento/banco';
import { abrirDaBiblioteca, abrirNovoNaBiblioteca, inicializar, novoProcesso, useLoja } from './estado/loja';
import { EditorDiagrama, type ControleDiagrama } from './componentes/EditorDiagrama';
import { PainelLateral, type AbaLateral } from './componentes/PainelLateral';
import { TabelaEtapas } from './componentes/TabelaEtapas';
import { Avisos, Topo, type AcoesTopo } from './componentes/Topo';
import { Biblioteca, ModalConflito, ModalImportacao, type ConflitoPendente, type ImportacaoPendente } from './componentes/Modais';

/** SVG do diagrama sempre no tema claro (para documentos), num visualizador fora da tela. */
async function svgNoTemaClaro(p: Processo): Promise<string> {
  const { default: Viewer } = await import('bpmn-js/lib/Viewer');
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-10000px;top:0;width:1600px;height:900px';
  document.body.appendChild(div);
  const v = new Viewer({ container: div });
  try {
    await v.importXML(exportarBpmn(p));
    return (await v.saveSVG()).svg;
  } finally {
    v.destroy();
    div.remove();
  }
}

export function App() {
  const processo = useLoja((s) => s.processo);
  const [erroInicio, setErroInicio] = useState('');

  useEffect(() => {
    let ativo = true;
    if (useLoja.getState().processo) return;
    inicializar()
      .then((r) => ativo && r === 'continuou' && useLoja.getState().avisar('info', 'Continuando de onde você parou.'))
      .catch((e: unknown) => setErroInicio(e instanceof Error ? e.message : String(e)));
    return () => {
      ativo = false;
    };
  }, []);

  if (erroInicio) {
    return (
      <div className="tela-cheia">
        <h1>Não foi possível abrir o armazenamento do navegador</h1>
        <p>{erroInicio}</p>
        <p className="mudo">Em janelas anônimas ou com dados de sites bloqueados, o navegador pode impedir o salvamento local.</p>
      </div>
    );
  }
  if (!processo) return <div className="tela-cheia"><p className="mudo">Carregando…</p></div>;
  return <Editor />;
}

function Editor() {
  const p = useLoja((s) => s.processo)!;
  const selecionada = useLoja((s) => s.selecionada);
  const { aplicar, avisar, selecionar, desfazer, refazer } = useLoja.getState();
  const diagrama = useRef<ControleDiagrama>(null);

  const [aba, setAba] = useState<AbaLateral>('etapa');
  const [gavetaAberta, setGavetaAberta] = useState(true);
  const [biblioteca, setBiblioteca] = useState(false);
  const [importacao, setImportacao] = useState<ImportacaoPendente | null>(null);
  const [conflito, setConflito] = useState<ConflitoPendente | null>(null);

  const problemas = useMemo(() => validar(p), [p]);
  const analise = useMemo(() => analisar(p), [p]);
  const erros = problemas.filter((x) => x.severidade === 'erro').length;

  // Ao selecionar uma etapa, o painel mostra os detalhes dela (menos quando se está na RACI)
  useEffect(() => {
    if (selecionada) setAba((a) => (a === 'raci' ? a : 'etapa'));
  }, [selecionada]);

  const baixar = (conteudo: string | Uint8Array, nome: string, tipo: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([typeof conteudo === 'string' ? conteudo : new Uint8Array(conteudo)], { type: tipo }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const salvarComoArquivo = useCallback(async () => {
    const loja = useLoja.getState();
    await loja.salvarAgora();
    const atual = useLoja.getState().processo!;
    const nome = nomeDoArquivo(atual);
    try {
      const r = await salvarArquivo(serializarProcesso(atual), nome, 'application/json', '.processo', loja.registro.arquivo?.handle);
      if (!r.salvo) return;
      await loja.marcarExportado({ nome, ...(r.handle ? { handle: r.handle } : {}) });
      avisar('ok', r.handle ? `Salvo em ${r.handle.name}` : `${nome} baixado`);
    } catch (e) {
      avisar('erro', `Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [avisar]);

  const abrir = useCallback(async () => {
    let escolhido;
    try {
      escolhido = await abrirArquivoDoDisco(EXTENSOES_ACEITAS);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : String(e));
      return;
    }
    if (!escolhido) return;
    const r = await abrirArquivo(escolhido.nome, escolhido.bytes);
    if (r.tipo === 'erro') return avisar('erro', r.erro);
    if (r.tipo === 'importacao') {
      setImportacao({ nomeArquivo: escolhido.nome, formato: r.importador.formato, nomeFormato: r.importador.nome, grafos: r.grafos });
      return;
    }
    const leitura = r.leitura;
    if (!leitura.ok) return avisar('erro', `${leitura.erro}${leitura.detalhes ? `: ${leitura.detalhes.slice(0, 2).join('; ')}` : ''}`);
    if (leitura.somenteLeitura) return avisar('erro', leitura.avisos[0] ?? 'Arquivo de uma versão mais nova do sistema');
    leitura.avisos.forEach((a) => avisar('info', a));
    const doArquivo = leitura.processo;
    const registroArquivo = { arquivo: { nome: escolhido.nome, ...(escolhido.handle ? { handle: escolhido.handle } : {}) }, revisaoExportada: doArquivo.revisao };
    const existente = await lerRegistro(doArquivo.id);
    if (!existente) {
      await abrirNovoNaBiblioteca(doArquivo, registroArquivo);
      avisar('ok', `“${doArquivo.nome}” aberto e guardado na biblioteca`);
    } else if (existente.processo.revisao === doArquivo.revisao) {
      await abrirDaBiblioteca(doArquivo.id);
    } else {
      setConflito({ arquivo: doArquivo, navegador: existente, nomeArquivo: escolhido.nome, ...(escolhido.handle ? { handle: escolhido.handle } : {}) });
    }
  }, [avisar]);

  const exportar = useCallback(async (formato: 'bpmn' | 'xlsx' | 'csv' | 'svg') => {
    const atual = useLoja.getState().processo!;
    const base = nomeDoArquivo(atual).replace(/\.processo$/, '');
    if (formato === 'bpmn') baixar(exportarBpmn(atual), nomeArquivoBpmn(atual), 'application/xml');
    if (formato === 'xlsx') baixar(exportarXlsx(atual), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (formato === 'csv') baixar(exportarCsv(atual), `${base}.csv`, 'text/csv;charset=utf-8');
    if (formato === 'svg') {
      try {
        baixar(await svgNoTemaClaro(atual), `${slug(atual.nome) || 'processo'}.svg`, 'image/svg+xml');
      } catch (e) {
        avisar('erro', `Não foi possível gerar o SVG: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, [avisar]);

  const acoes: AcoesTopo = {
    biblioteca: () => setBiblioteca(true),
    novo: () => void novoProcesso(),
    abrir: () => void abrir(),
    salvarArquivo: () => void salvarComoArquivo(),
    exportar: (f) => void exportar(f),
  };

  // Atalhos: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+S, Ctrl+O
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const alvo = e.target as HTMLElement;
      const editandoTexto = alvo.matches('input, textarea, select, [contenteditable="true"]');
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void salvarComoArquivo(); }
      else if (k === 'o') { e.preventDefault(); void abrir(); }
      else if (!editandoTexto && k === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) refazer(); else desfazer(); }
      else if (!editandoTexto && k === 'y') { e.preventDefault(); e.stopPropagation(); refazer(); }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [abrir, salvarComoArquivo, desfazer, refazer]);

  const adicionar = () => {
    const sel = p.etapas.find((e) => e.id === selecionada);
    let novoId = '';
    const ok = aplicar((q) => {
      const r = adicionarEtapa(q, { tipo: 'tarefa', descricao: 'Nova tarefa', ator: sel?.ator ?? q.etapas.find((e) => e.ator)?.ator ?? 'Responsável' }, sel ? { depoisDe: sel.id } : {});
      novoId = r.id;
      return r.processo;
    });
    if (ok) selecionar(novoId);
  };

  return (
    <div className="app">
      <Topo acoes={acoes} />
      <main className="area">
        <section className="centro">
          <div className="quadro-diagrama">
            <div className="ferramentas-diagrama" role="toolbar" aria-label="Diagrama">
              <button onClick={adicionar} title="Acrescenta uma tarefa depois da etapa selecionada">+ Etapa</button>
              <span className="sep" />
              <button className="icone" onClick={() => diagrama.current?.ajustar()} title="Ajustar à tela" aria-label="Ajustar à tela">⤢</button>
              <button className="icone" onClick={() => diagrama.current?.zoom(1.2)} title="Aproximar" aria-label="Aproximar">+</button>
              <button className="icone" onClick={() => diagrama.current?.zoom(1 / 1.2)} title="Afastar" aria-label="Afastar">−</button>
            </div>
            <div className="indicadores" aria-label="Resumo">
              <span title="Complexidade">{analise.nivel}</span>
              <span>{analise.metricas.total} etapas</span>
              <button className={`chip ${erros ? 'erro' : problemas.length ? 'aviso' : 'ok'}`} onClick={() => setAba('problemas')}>
                {erros ? `${erros} erro(s)` : problemas.length ? `${problemas.length} sugestão(ões)` : 'Sem problemas'}
              </button>
            </div>
            <EditorDiagrama ref={diagrama} />
          </div>
          <section className={`gaveta ${gavetaAberta ? 'aberta' : ''}`} aria-label="Tabela de etapas">
            <button className="gaveta-cabeca" onClick={() => setGavetaAberta((v) => !v)} aria-expanded={gavetaAberta}>
              <span>{gavetaAberta ? '▾' : '▸'} Etapas ({p.etapas.length})</span>
              <span className="mudo">edite em lista: descrição, responsável, apoio e saídas</span>
            </button>
            {gavetaAberta && <TabelaEtapas problemas={problemas} />}
          </section>
        </section>
        <PainelLateral aba={aba} setAba={setAba} problemas={problemas} analise={analise} />
      </main>
      <Avisos />
      {biblioteca && <Biblioteca aoFechar={() => setBiblioteca(false)} />}
      {importacao && <ModalImportacao dados={importacao} aoFechar={() => setImportacao(null)} />}
      {conflito && <ModalConflito dados={conflito} aoFechar={() => setConflito(null)} />}
    </div>
  );
}
