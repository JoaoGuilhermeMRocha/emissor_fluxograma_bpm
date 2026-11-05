import { useState } from 'react';
import {
  abrirArquivo,
  EXTENSOES_ACEITAS,
  montarMatrizRaci,
  normalizarGrafo,
  ordemDasRaias,
  relatorioEmTexto,
  resolverRaias,
  serializarProcesso,
  DEFINICOES,
  type Analise,
  type GrafoImportado,
  type Problema,
  type Processo,
  type RelatorioImportacao,
  type TipoEtapa,
} from '@mapeador/core';
import { AMOSTRAS_IMPORTACAO } from './amostras';

type Aplicar = (op: (p: Processo) => Processo) => void;

export function PainelProblemas({ problemas, selecionar }: { problemas: Problema[]; selecionar: (id: string) => void }) {
  if (!problemas.length) return <p className="vazio ok">Nenhum problema encontrado.</p>;
  return (
    <ul className="problemas">
      {problemas.map((x, i) => (
        <li key={i} className={x.severidade}>
          <button onClick={() => x.etapa && selecionar(x.etapa)} disabled={!x.etapa}>
            <span className="codigo">{x.codigo}</span>
            <span className="sev">{x.severidade}</span>
            <span>{x.mensagem}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PainelAnalises({ analise: a, processo: p, aplicar }: { analise: Analise; processo: Processo; aplicar: Aplicar }) {
  const m = a.metricas;
  return (
    <div className="analises">
      <div className="grade">
        <Dado r="Total de etapas" v={m.total} />
        <Dado r="Tarefas" v={m.tarefas} />
        <Dado r="Sistêmicas" v={m.sistemicas} />
        <Dado r="Subprocessos" v={m.subprocessos} />
        <Dado r="Gateways" v={m.gateways} />
        <Dado r="Raias" v={m.raias} />
        <Dado r="Retornos (loops)" v={m.retornos} />
        <Dado r="Handoffs" v={m.handoffs} />
        <Dado r="Automação" v={`${m.automacao}%`} />
        <Dado r="Score" v={`${a.score} · ${a.nivel}`} />
        <Dado r="Qualidade" v={`${a.qualidade}%`} />
        <Dado r="Caminhos" v={a.caminhos.total ? `${a.caminhos.total} (${a.caminhos.menor}–${a.caminhos.maior} etapas)` : '—'} />
      </div>

      {Object.keys(m.gatewaysPorTipo).length > 0 && (
        <p className="nota">
          Gateways por tipo:{' '}
          {Object.entries(m.gatewaysPorTipo).map(([t, n]) => `${DEFINICOES[t as TipoEtapa].rotulo}: ${n}`).join(' · ')}
        </p>
      )}

      <h3>Handoffs</h3>
      {a.handoffs.length ? (
        <ul className="lista">{a.handoffs.map((h) => <li key={h.de + h.para}>{h.de} → {h.para} <b>×{h.vezes}</b></li>)}</ul>
      ) : <p className="mudo">Nenhuma troca entre raias.</p>}

      {a.concentracao && (
        <p className="nota">Concentração: <b>{a.concentracao.raia}</b> tem {a.concentracao.atividades} atividade(s), {a.concentracao.percentual}% do total.</p>
      )}

      <h3>Checklist</h3>
      <ul className="checklist">
        {a.checklist.map((c) => <li key={c.chave} className={c.ok ? 'ok' : 'falta'}>{c.ok ? '✔' : '✖'} {c.rotulo}</li>)}
      </ul>
      <div className="controles">
        <label>
          <input type="checkbox" checked={p.raci.revisada} onChange={(e) => aplicar((q) => ({ ...q, raci: { ...q.raci, revisada: e.target.checked } }))} />
          Marcar RACI como revisada
        </label>
        <label className="bloco">
          Parecer (para testar o checklist)
          <textarea
            key={p.id + p.parecer.texto}
            defaultValue={p.parecer.texto}
            rows={2}
            onBlur={(e) => e.target.value !== p.parecer.texto && aplicar((q) => ({ ...q, parecer: { ...q.parecer, texto: e.target.value } }))}
          />
        </label>
      </div>

      <h3>Recomendações</h3>
      {a.recomendacoes.length ? <ul className="lista">{a.recomendacoes.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mudo">Nenhuma.</p>}
    </div>
  );
}

function Dado({ r, v }: { r: string; v: string | number }) {
  return <div className="dado"><span>{r}</span><strong>{v}</strong></div>;
}

const LETRAS = ['R', 'A', 'C', 'I'] as const;

export function PainelRaci({ processo: p, aplicar }: { processo: Processo; aplicar: Aplicar }) {
  const m = montarMatrizRaci(p);
  const [novoAtor, setNovoAtor] = useState('');

  /** Alterna uma letra manual (A, C ou I) de um ator numa etapa. R segue automático nesta bancada. */
  const alternar = (etapa: string, ator: string, letra: 'A' | 'C' | 'I') =>
    aplicar((q) => {
      const chave = ({ A: 'aprovadores', C: 'consultados', I: 'informados' } as const)[letra];
      const atual = q.raci.porEtapa[etapa] ?? { aprovadores: [], consultados: [], informados: [] };
      const lista = atual[chave];
      const nova = lista.includes(ator) ? lista.filter((x) => x !== ator) : [...lista, ator];
      return { ...q, raci: { ...q.raci, porEtapa: { ...q.raci.porEtapa, [etapa]: { ...atual, [chave]: nova } } } };
    });

  if (!m.linhas.length) return <p className="vazio">Nenhuma atividade ou gateway para montar a RACI.</p>;

  return (
    <div>
      <p className="nota">R automático pelo responsável (A nos gateways). Clique em A, C ou I para alternar.</p>
      <div className="tabela-rolagem">
        <table className="raci">
          <thead>
            <tr>
              <th>Atividade</th>
              {m.atores.map((a) => <th key={a}>{a}</th>)}
              <th>Condicional</th>
            </tr>
          </thead>
          <tbody>
            {m.linhas.map((l) => (
              <tr key={l.etapa}>
                <td><b>{l.etapa}</b> {l.descricao}</td>
                {m.atores.map((a, i) => (
                  <td key={a} className="celula">
                    {LETRAS.map((letra) => {
                      const ativo = l.celulas[i]!.includes(letra);
                      return letra === 'R' ? (
                        ativo ? <span key={letra} className="letra R">R</span> : null
                      ) : (
                        <button key={letra} className={`letra ${letra} ${ativo ? 'ativa' : ''}`} onClick={() => alternar(l.etapa, a, letra)}>{letra}</button>
                      );
                    })}
                  </td>
                ))}
                <td className="mudo">{l.condicional}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="linha-form"
        onSubmit={(e) => {
          e.preventDefault();
          const nome = novoAtor.trim();
          if (!nome) return;
          aplicar((q) => ({ ...q, raci: { ...q.raci, atoresExtras: [...q.raci.atoresExtras, nome] } }));
          setNovoAtor('');
        }}
      >
        <input value={novoAtor} onChange={(e) => setNovoAtor(e.target.value)} placeholder="Ator adicional (ex.: Jurídico)" />
        <button type="submit">Adicionar coluna</button>
      </form>
    </div>
  );
}

export function PainelRaias({ processo: p, aplicar }: { processo: Processo; aplicar: Aplicar }) {
  const raias = resolverRaias(p);
  const ordem = ordemDasRaias(p, raias);
  const mover = (i: number, d: -1 | 1) =>
    aplicar((q) => {
      const nova = [...ordem];
      [nova[i], nova[i + d]] = [nova[i + d]!, nova[i]!];
      return { ...q, layout: { ...q.layout, ordemRaias: nova } };
    });

  return (
    <div>
      <p className="nota">Ordem {p.layout.ordemRaias ? 'manual' : 'automática (primeira aparição)'}.</p>
      <ol className="raias">
        {ordem.map((r, i) => (
          <li key={r}>
            <span className="nome-raia">{r}</span>
            <span className="mudo">{[...raias.entries()].filter(([, v]) => v === r).map(([k]) => k).join(', ')}</span>
            <span className="acoes">
              <button className="icone" disabled={i === 0} onClick={() => mover(i, -1)}>▲</button>
              <button className="icone" disabled={i === ordem.length - 1} onClick={() => mover(i, 1)}>▼</button>
            </span>
          </li>
        ))}
      </ol>
      {p.layout.ordemRaias && (
        <button onClick={() => aplicar((q) => ({ ...q, layout: { ...q.layout, ordemRaias: null } }))}>Restaurar ordem automática</button>
      )}
    </div>
  );
}

export function PainelArquivo({ processo: p, baixar, baixarBpmn, baixarCsv, baixarXlsx, abrir }: { processo: Processo; baixar: () => void; baixarBpmn: () => void; baixarCsv: () => void; baixarXlsx: () => void; abrir: (f: File) => void }) {
  return (
    <div>
      <div className="linha-form">
        <button className="primario" onClick={baixar}>Baixar .processo</button>
        <button onClick={baixarBpmn} title="Abra em demo.bpmn.io ou no Camunda Modeler para conferir">Baixar .bpmn</button>
        <button onClick={baixarXlsx}>Baixar Excel</button>
        <button onClick={baixarCsv}>Baixar CSV</button>
        <label className="botao">
          Abrir .processo
          <input type="file" accept=".processo,.json" hidden onChange={(e) => e.target.files?.[0] && abrir(e.target.files[0])} />
        </label>
      </div>
      <p className="nota">O <b>.bpmn</b> pode ser aberto em demo.bpmn.io (arraste o arquivo para a página) ou no Camunda Modeler, para conferir que é BPMN de verdade.</p>
      <p className="nota">A planilha (Excel ou CSV) segue o modelo de etapas: edite no Excel e importe de volta pela aba Importação.</p>
      <p className="nota">Dica: baixe, edite o JSON à mão (por exemplo, troque um tipo por “xyz” ou mude “versaoFormato” para 99) e abra de novo para ver as mensagens.</p>
      <pre className="json">{serializarProcesso(p, { geradoPor: 'Bancada de testes' })}</pre>
    </div>
  );
}

export function PainelImportacao({ abrir }: { abrir: (p: Processo) => void }) {
  const [grafos, setGrafos] = useState<{ nomeArquivo: string; formato: string; nomeFormato: string; grafos: GrafoImportado[] } | null>(null);
  const [indicePool, setIndicePool] = useState(0);
  const [manterLayout, setManterLayout] = useState(false);
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState(() => JSON.stringify(AMOSTRAS_IMPORTACAO.bpmn!.grafo, null, 2));
  const [carregando, setCarregando] = useState(false);

  const grafoAtual = grafos?.grafos[indicePool];
  const resultado: { processo: Processo; relatorio: RelatorioImportacao } | null = grafoAtual
    ? normalizarGrafo(grafoAtual, { formato: grafos!.formato, manterLayout })
    : null;

  const escolherArquivo = async (arquivo: File) => {
    setErro('');
    setGrafos(null);
    setCarregando(true);
    try {
      const r = await abrirArquivo(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
      if (r.tipo === 'erro') setErro(r.erro);
      else if (r.tipo === 'processo') {
        if (r.leitura.ok) abrir(r.leitura.processo);
        else setErro(r.leitura.erro);
      } else {
        setIndicePool(0);
        setGrafos({ nomeArquivo: arquivo.name, formato: r.importador.formato, nomeFormato: r.importador.nome, grafos: r.grafos });
      }
    } finally {
      setCarregando(false);
    }
  };

  const normalizarSimulacao = () => {
    setErro('');
    try {
      const g = JSON.parse(texto) as Partial<GrafoImportado>;
      setIndicePool(0);
      setGrafos({ nomeArquivo: 'simulação', formato: 'simulacao', nomeFormato: 'Grafo intermediário', grafos: [{ raias: [], nos: [], arestas: [], associacoes: [], avisos: [], perdas: [], ...g }] });
    } catch (e) {
      setErro(`JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="importacao">
      <h3>Abrir arquivo de outra ferramenta</h3>
      <p className="nota">BPMN 2.0 (Camunda, Bizagi, bpmn.io…), planilha CSV ou Excel no modelo de etapas, ou um .processo.</p>
      <div className="linha-form">
        <label className="botao primario-borda">
          {carregando ? 'Lendo…' : 'Escolher arquivo'}
          <input type="file" accept={EXTENSOES_ACEITAS.join(',')} hidden onChange={(e) => { if (e.target.files?.[0]) escolherArquivo(e.target.files[0]); e.target.value = ''; }} />
        </label>
        <label><input type="checkbox" checked={manterLayout} onChange={(e) => setManterLayout(e.target.checked)} /> Manter desenho original</label>
      </div>

      <details className="simulacoes">
        <summary>Simulações (grafo intermediário à mão)</summary>
        <div className="linha-form">
          {Object.entries(AMOSTRAS_IMPORTACAO).map(([k, a]) => (
            <button key={k} onClick={() => { setTexto(JSON.stringify(a.grafo, null, 2)); setGrafos(null); }}>{a.rotulo}</button>
          ))}
        </div>
        <textarea className="json" value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} spellCheck={false} />
        <button onClick={normalizarSimulacao}>Normalizar simulação</button>
      </details>

      {erro && <p className="mensagem erro">{erro}</p>}

      {grafos && resultado && (
        <div className="resultado-importacao">
          <h3>{grafos.nomeArquivo} · {grafos.nomeFormato}</h3>
          {grafos.grafos.length > 1 && (
            <label className="bloco">
              O arquivo tem {grafos.grafos.length} pools. Qual importar?
              <select value={indicePool} onChange={(e) => setIndicePool(Number(e.target.value))}>
                {grafos.grafos.map((g, i) => <option key={i} value={i}>{g.titulo ?? `Pool ${i + 1}`}</option>)}
              </select>
            </label>
          )}
          <pre className="relatorio">{relatorioEmTexto(resultado.relatorio)}</pre>
          <button className="primario" onClick={() => abrir(resultado.processo)}>Abrir como processo na bancada</button>
        </div>
      )}
    </div>
  );
}
