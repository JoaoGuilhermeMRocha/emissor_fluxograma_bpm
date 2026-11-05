import { useCallback, useMemo, useRef, useState } from 'react';
import {
  adicionarEtapa,
  analisar,
  criarProcesso,
  exportarBpmn,
  exportarCsv,
  exportarXlsx,
  nomeArquivoBpmn,
  lerProcesso,
  ligarEmSequencia,
  nomeDoArquivo,
  processoExemplo,
  serializarProcesso,
  validar,
  DEFINICOES,
  TIPOS_ETAPA,
  type Processo,
  type TipoEtapa,
} from '@mapeador/core';
import { Diagrama } from './Diagrama';
import { TabelaEtapas } from './TabelaEtapas';
import { PainelAnalises, PainelArquivo, PainelImportacao, PainelProblemas, PainelRaci, PainelRaias } from './Paineis';

interface Historico {
  passado: Processo[];
  atual: Processo;
  futuro: Processo[];
}

const ABAS = ['Problemas', 'Análises', 'RACI', 'Raias', 'Arquivo', 'Importação'] as const;
type Aba = (typeof ABAS)[number];

export function App() {
  const [hist, setHist] = useState<Historico>(() => ({ passado: [], atual: processoExemplo(), futuro: [] }));
  const [aba, setAba] = useState<Aba>('Problemas');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [tipoNovo, setTipoNovo] = useState<TipoEtapa>('tarefa');
  const timer = useRef<number | undefined>(undefined);

  const avisar = useCallback((tipo: 'erro' | 'ok', texto: string) => {
    setMensagem({ tipo, texto });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMensagem(null), 5000);
  }, []);

  /** Aplica uma operação do núcleo, com desfazer e exibindo erros de edição. */
  const aplicar = useCallback(
    (op: (p: Processo) => Processo) => {
      setHist((h) => {
        try {
          const novo = op(h.atual);
          if (novo === h.atual) return h;
          return { passado: [...h.passado.slice(-99), h.atual], atual: novo, futuro: [] };
        } catch (e) {
          queueMicrotask(() => avisar('erro', e instanceof Error ? e.message : String(e)));
          return h;
        }
      });
    },
    [avisar],
  );

  const desfazer = () =>
    setHist((h) => (h.passado.length ? { passado: h.passado.slice(0, -1), atual: h.passado.at(-1)!, futuro: [h.atual, ...h.futuro] } : h));
  const refazer = () =>
    setHist((h) => (h.futuro.length ? { passado: [...h.passado, h.atual], atual: h.futuro[0]!, futuro: h.futuro.slice(1) } : h));

  const p = hist.atual;
  const problemas = useMemo(() => validar(p), [p]);
  const analise = useMemo(() => analisar(p), [p]);
  const erros = problemas.filter((x) => x.severidade === 'erro').length;
  const avisos = problemas.filter((x) => x.severidade === 'aviso').length;

  const baixarTexto = (conteudo: string | Uint8Array, nome: string, tipo: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([typeof conteudo === 'string' ? conteudo : new Uint8Array(conteudo)], { type: tipo }));
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const baixar = () => baixarTexto(serializarProcesso(p, { geradoPor: 'Bancada de testes' }), nomeDoArquivo(p), 'application/json');
  const baixarBpmn = () => baixarTexto(exportarBpmn(p), nomeArquivoBpmn(p), 'application/xml');
  const baseNome = nomeDoArquivo(p).replace(/\.processo$/, '');
  const baixarCsv = () => baixarTexto(exportarCsv(p), `${baseNome}.csv`, 'text/csv');
  const baixarXlsx = () => baixarTexto(exportarXlsx(p), `${baseNome}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const abrirArquivo = async (arquivo: File) => {
    const r = lerProcesso(await arquivo.text());
    if (!r.ok) {
      avisar('erro', `${r.erro}${r.detalhes ? ': ' + r.detalhes.slice(0, 3).join('; ') : ''}`);
      return;
    }
    aplicar(() => r.processo);
    avisar('ok', [`Arquivo aberto${r.somenteLeitura ? ' (somente leitura)' : ''}`, ...r.avisos].join(' · '));
  };

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <strong>Bancada de testes</strong>
          <span>núcleo do Mapeador de Processos</span>
        </div>
        <div className="acoes">
          <button onClick={() => aplicar(() => processoExemplo())}>Carregar exemplo</button>
          <button onClick={() => aplicar(() => criarProcesso({ nome: 'Novo processo' }))}>Processo vazio</button>
          <span className="sep" />
          <button onClick={desfazer} disabled={!hist.passado.length} title="Desfazer">↶ Desfazer</button>
          <button onClick={refazer} disabled={!hist.futuro.length} title="Refazer">↷ Refazer</button>
        </div>
      </header>

      {mensagem && <div className={`mensagem ${mensagem.tipo}`} role="status">{mensagem.texto}</div>}

      <section className="resumo">
        <label className="nome">
          <span>Processo</span>
          <input
            key={p.id + p.nome}
            defaultValue={p.nome}
            onBlur={(e) => e.target.value !== p.nome && aplicar((q) => ({ ...q, nome: e.target.value.trim() }))}
          />
        </label>
        <Indicador rotulo="Etapas" valor={analise.metricas.total} />
        <Indicador rotulo="Gateways" valor={analise.metricas.gateways} />
        <Indicador rotulo="Handoffs" valor={analise.metricas.handoffs} />
        <Indicador rotulo="Complexidade" valor={`${analise.nivel} (${analise.score})`} />
        <Indicador rotulo="Automação" valor={`${analise.metricas.automacao}%`} />
        <Indicador rotulo="Problemas" valor={`${erros} erro(s) · ${avisos} aviso(s)`} destaque={erros > 0} />
      </section>

      <main className="corpo">
        <section className="coluna-etapas">
          <Diagrama processo={p} selecionada={selecionada} selecionar={setSelecionada} />
          <div className="barra">
            <h2>Etapas</h2>
            <div className="acoes">
              <select value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as TipoEtapa)} aria-label="Tipo da nova etapa">
                {TIPOS_ETAPA.map((t) => <option key={t} value={t}>{DEFINICOES[t].rotulo}</option>)}
              </select>
              <button
                className="primario"
                onClick={() =>
                  aplicar((q) => {
                    const r = adicionarEtapa(q, { tipo: tipoNovo, descricao: '' }, selecionada ? { depoisDe: selecionada } : {});
                    queueMicrotask(() => setSelecionada(r.id));
                    return r.processo;
                  })
                }
              >
                + Adicionar {selecionada ? `depois de ${selecionada}` : 'no fim'}
              </button>
              <button onClick={() => aplicar(ligarEmSequencia)} title="Liga quem está sem destino à próxima etapa">Ligar em sequência</button>
            </div>
          </div>
          <TabelaEtapas processo={p} aplicar={aplicar} selecionada={selecionada} selecionar={setSelecionada} problemas={problemas} />
        </section>

        <aside className="coluna-paineis">
          <nav className="abas" role="tablist">
            {ABAS.map((a) => (
              <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? 'ativa' : ''} onClick={() => setAba(a)}>
                {a}
                {a === 'Problemas' && problemas.length > 0 && <span className={`contador ${erros ? 'erro' : ''}`}>{problemas.length}</span>}
              </button>
            ))}
          </nav>
          <div className="painel">
            {aba === 'Problemas' && <PainelProblemas problemas={problemas} selecionar={setSelecionada} />}
            {aba === 'Análises' && <PainelAnalises analise={analise} processo={p} aplicar={aplicar} />}
            {aba === 'RACI' && <PainelRaci processo={p} aplicar={aplicar} />}
            {aba === 'Raias' && <PainelRaias processo={p} aplicar={aplicar} />}
            {aba === 'Arquivo' && <PainelArquivo processo={p} baixar={baixar} baixarBpmn={baixarBpmn} baixarCsv={baixarCsv} baixarXlsx={baixarXlsx} abrir={abrirArquivo} />}
            {aba === 'Importação' && (
              <PainelImportacao
                abrir={(novo) => {
                  aplicar(() => novo);
                  setAba('Problemas');
                  avisar('ok', 'Processo importado. Use Desfazer para voltar ao anterior.');
                }}
              />
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className={`indicador ${destaque ? 'destaque' : ''}`}>
      <span>{rotulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}
