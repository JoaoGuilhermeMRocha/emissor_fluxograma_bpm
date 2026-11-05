import { useState } from 'react';
import {
  adicionarEtapa,
  atoresConhecidos,
  atualizarEtapa,
  excluirEtapa,
  montarMatrizRaci,
  ordemDasRaias,
  resolverRaias,
  DEFINICOES,
  TIPOS_ETAPA,
  type Analise,
  type Problema,
  type TipoEtapa,
} from '@mapeador/core';
import { useLoja } from '../estado/loja';
import { CampoTexto, DetalheEtapa, EditorSaidas, SeletorTipo } from './campos';

export type AbaLateral = 'etapa' | 'problemas' | 'analises' | 'raci' | 'processo';

export function PainelLateral({ aba, setAba, problemas, analise }: { aba: AbaLateral; setAba: (a: AbaLateral) => void; problemas: Problema[]; analise: Analise }) {
  const erros = problemas.filter((x) => x.severidade === 'erro').length;
  const abas: [AbaLateral, string][] = [['etapa', 'Etapa'], ['problemas', 'Problemas'], ['analises', 'Análises'], ['raci', 'RACI'], ['processo', 'Processo']];
  return (
    <aside className="lateral" aria-label="Painel lateral">
      <div className="abas" role="tablist">
        {abas.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>
            {rotulo}
            {id === 'problemas' && problemas.length > 0 && <span className={`contador ${erros ? 'erro' : ''}`}>{erros || problemas.length}</span>}
          </button>
        ))}
      </div>
      <div className="lateral-corpo" role="tabpanel">
        {aba === 'etapa' && <AbaEtapa problemas={problemas} />}
        {aba === 'problemas' && <AbaProblemas problemas={problemas} irPara={() => setAba('etapa')} />}
        {aba === 'analises' && <AbaAnalises analise={analise} />}
        {aba === 'raci' && <AbaRaci />}
        {aba === 'processo' && <AbaProcesso />}
      </div>
    </aside>
  );
}

function AbaEtapa({ problemas }: { problemas: Problema[] }) {
  const p = useLoja((s) => s.processo)!;
  const id = useLoja((s) => s.selecionada);
  const aplicar = useLoja((s) => s.aplicar);
  const selecionar = useLoja((s) => s.selecionar);
  const [tipoNovo, setTipoNovo] = useState<TipoEtapa>('tarefa');
  const e = p.etapas.find((x) => x.id === id);

  if (!e) {
    return (
      <div className="vazio-lateral">
        <p>Selecione uma etapa no diagrama ou na tabela para editar os detalhes.</p>
        <p className="mudo">No diagrama: clique numa caixa para ver as ações (acrescentar, ligar, trocar tipo, excluir). Clique duas vezes para renomear. Arraste para outra raia para trocar o responsável.</p>
      </div>
    );
  }
  const def = DEFINICOES[e.tipo];
  const raia = resolverRaias(p).get(e.id);
  const atualizar = (campos: Parameters<typeof atualizarEtapa>[2]) => aplicar((q) => atualizarEtapa(q, e.id, campos));
  const dela = problemas.filter((x) => x.etapa === e.id);

  return (
    <div className="inspetor">
      <div className="inspetor-cabeca">
        <span className="etiqueta">{e.id}</span>
        <strong>{def.rotulo}</strong>
      </div>
      {dela.length > 0 && (
        <ul className="problemas compacta">
          {dela.map((x, i) => <li key={i} className={x.severidade}><span className="codigo">{x.codigo}</span> {x.mensagem}</li>)}
        </ul>
      )}
      <label className="campo">
        <span>Tipo</span>
        <SeletorTipo etapa={e} />
      </label>
      <label className="campo">
        <span>Descrição</span>
        <CampoTexto valor={e.descricao} aoConfirmar={(v) => atualizar({ descricao: v })} placeholder="O que acontece nesta etapa" />
      </label>
      {def.ator !== 'nenhum' ? (
        <label className="campo">
          <span>Responsável {def.ator === 'obrigatorio' && <em>obrigatório</em>}</span>
          <CampoTexto valor={e.ator ?? ''} list="lista-atores-lateral" aoConfirmar={(v) => atualizar({ ator: v })} placeholder={def.ator === 'opcional' ? `Herda: ${raia ?? ''}` : 'Pessoa ou área'} />
          <datalist id="lista-atores-lateral">{atoresConhecidos(p).map((a) => <option key={a} value={a} />)}</datalist>
        </label>
      ) : (
        <div className="campo"><span>Raia</span><p className="herdado">↳ {raia ?? '—'} (herdada)</p></div>
      )}
      {(def.familia === 'atividade' || def.familia === 'gateway') && (
        <label className="campo">
          <span>Apoio</span>
          <CampoTexto valor={e.apoio ?? ''} aoConfirmar={(v) => atualizar({ apoio: v })} placeholder="Sistema, documento ou observação" />
        </label>
      )}
      {def.saidasMax > 0 || e.saidas.length > 0 ? (
        <div className="campo">
          <span>Saídas</span>
          <EditorSaidas etapa={e} processo={p} aoMudar={(saidas) => atualizar({ saidas })} />
        </div>
      ) : null}
      {['fim', 'gw_complexo', 'intermediario', 'anotacao'].includes(e.tipo) && (
        <div className="campo">
          <span>{e.tipo === 'fim' ? 'Resultado' : e.tipo === 'gw_complexo' ? 'Regra' : e.tipo === 'anotacao' ? 'Ligada a' : 'Evento'}</span>
          <DetalheEtapa etapa={e} processo={p} atualizar={atualizar} />
        </div>
      )}
      <div className="inspetor-acoes">
        <div className="linha">
          <select value={tipoNovo} onChange={(ev) => setTipoNovo(ev.target.value as TipoEtapa)} aria-label="Tipo da nova etapa">
            {TIPOS_ETAPA.map((t) => <option key={t} value={t}>{DEFINICOES[t].rotulo}</option>)}
          </select>
          <button
            onClick={() => {
              let novoId = '';
              const ok = aplicar((q) => {
                const r = adicionarEtapa(q, { tipo: tipoNovo, descricao: '', ator: DEFINICOES[tipoNovo].ator !== 'nenhum' ? e.ator : undefined }, { depoisDe: e.id });
                novoId = r.id;
                return r.processo;
              });
              if (ok) selecionar(novoId);
            }}
          >Inserir depois</button>
        </div>
        <button className="perigo-texto" onClick={() => { aplicar((q) => excluirEtapa(q, e.id)); selecionar(null); }}>Excluir etapa</button>
      </div>
    </div>
  );
}

function AbaProblemas({ problemas, irPara }: { problemas: Problema[]; irPara: () => void }) {
  const selecionar = useLoja((s) => s.selecionar);
  if (!problemas.length) return <p className="vazio-lateral ok">Nenhum problema encontrado. ✓</p>;
  return (
    <ul className="problemas">
      {problemas.map((x, i) => (
        <li key={i} className={x.severidade}>
          <button disabled={!x.etapa} onClick={() => { if (x.etapa) { selecionar(x.etapa); irPara(); } }}>
            <span className="codigo">{x.codigo}</span>
            <span>{x.mensagem}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Dado({ r, v }: { r: string; v: string | number }) {
  return <div className="dado"><span>{r}</span><strong>{v}</strong></div>;
}

function AbaAnalises({ analise: a }: { analise: Analise }) {
  const m = a.metricas;
  return (
    <div className="analises">
      <div className="grade">
        <Dado r="Complexidade" v={`${a.nivel} · ${a.score}`} />
        <Dado r="Qualidade" v={`${a.qualidade}%`} />
        <Dado r="Etapas" v={m.total} />
        <Dado r="Gateways" v={m.gateways} />
        <Dado r="Raias" v={m.raias} />
        <Dado r="Handoffs" v={m.handoffs} />
        <Dado r="Retornos" v={m.retornos} />
        <Dado r="Automação" v={`${m.automacao}%`} />
        <Dado r="Caminhos" v={a.caminhos.total ? `${a.caminhos.total}` : '—'} />
      </div>
      {a.caminhos.total > 0 && <p className="nota">Do início ao fim: de {a.caminhos.menor} a {a.caminhos.maior} etapas.</p>}
      <h3>Trocas entre áreas</h3>
      {a.handoffs.length ? <ul className="lista">{a.handoffs.map((h) => <li key={h.de + h.para}>{h.de} → {h.para} <b>×{h.vezes}</b></li>)}</ul> : <p className="mudo">Nenhuma.</p>}
      {a.concentracao && <p className="nota">{a.concentracao.raia} concentra {a.concentracao.percentual}% das atividades.</p>}
      <h3>Checklist</h3>
      <ul className="checklist">{a.checklist.map((c) => <li key={c.chave} className={c.ok ? 'ok' : 'falta'}>{c.ok ? '✓' : '○'} {c.rotulo}</li>)}</ul>
      <h3>Recomendações</h3>
      {a.recomendacoes.length ? <ul className="lista">{a.recomendacoes.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mudo">Nenhuma.</p>}
    </div>
  );
}

const LETRAS = ['R', 'A', 'C', 'I'] as const;

function AbaRaci() {
  const p = useLoja((s) => s.processo)!;
  const aplicar = useLoja((s) => s.aplicar);
  const m = montarMatrizRaci(p);
  const [novoAtor, setNovoAtor] = useState('');
  const alternar = (etapa: string, ator: string, letra: 'A' | 'C' | 'I') =>
    aplicar((q) => {
      const chave = ({ A: 'aprovadores', C: 'consultados', I: 'informados' } as const)[letra];
      const atual = q.raci.porEtapa[etapa] ?? { aprovadores: [], consultados: [], informados: [] };
      const lista = atual[chave];
      const nova = lista.includes(ator) ? lista.filter((x) => x !== ator) : [...lista, ator];
      return { ...q, raci: { ...q.raci, porEtapa: { ...q.raci.porEtapa, [etapa]: { ...atual, [chave]: nova } } } };
    });

  if (!m.linhas.length) return <p className="vazio-lateral">A RACI aparece quando houver atividades ou decisões.</p>;
  return (
    <div>
      <p className="nota">R vem do responsável (A nas decisões). Clique em A, C ou I para atribuir.</p>
      <div className="tabela-rolagem raci-rolagem">
        <table className="raci">
          <thead><tr><th scope="col">Atividade</th>{m.atores.map((a) => <th key={a} scope="col">{a}</th>)}</tr></thead>
          <tbody>
            {m.linhas.map((l) => (
              <tr key={l.etapa}>
                <td><b>{l.etapa}</b> {l.descricao}</td>
                {m.atores.map((a, i) => (
                  <td key={a} className="celula">
                    {LETRAS.map((letra) => {
                      const ativo = l.celulas[i]!.includes(letra);
                      return letra === 'R'
                        ? ativo ? <span key={letra} className="letra R">R</span> : null
                        : <button key={letra} className={`letra ${letra} ${ativo ? 'ativa' : ''}`} aria-pressed={ativo} aria-label={`${letra} para ${a} em ${l.etapa}`} onClick={() => alternar(l.etapa, a, letra)}>{letra}</button>;
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="linha" onSubmit={(e) => { e.preventDefault(); const n = novoAtor.trim(); if (!n) return; aplicar((q) => ({ ...q, raci: { ...q.raci, atoresExtras: [...q.raci.atoresExtras, n] } })); setNovoAtor(''); }}>
        <input value={novoAtor} onChange={(e) => setNovoAtor(e.target.value)} placeholder="Outra pessoa ou área (ex.: Jurídico)" aria-label="Ator adicional" />
        <button type="submit">Adicionar</button>
      </form>
      <label className="marcador">
        <input type="checkbox" checked={p.raci.revisada} onChange={(e) => aplicar((q) => ({ ...q, raci: { ...q.raci, revisada: e.target.checked } }))} />
        RACI revisada
      </label>
    </div>
  );
}

function AbaProcesso() {
  const p = useLoja((s) => s.processo)!;
  const aplicar = useLoja((s) => s.aplicar);
  const raias = ordemDasRaias(p);
  const mover = (i: number, d: -1 | 1) =>
    aplicar((q) => {
      const nova = [...raias];
      [nova[i], nova[i + d]] = [nova[i + d]!, nova[i]!];
      return { ...q, layout: { ...q.layout, ordemRaias: nova } };
    });
  const meta = (chave: string, rotulo: string) => (
    <label className="campo">
      <span>{rotulo}</span>
      <CampoTexto valor={p.metadados[chave] ?? ''} aoConfirmar={(v) => aplicar((q) => ({ ...q, metadados: { ...q.metadados, [chave]: v.trim() } }))} />
    </label>
  );
  return (
    <div className="inspetor">
      <label className="campo">
        <span>Nome do processo</span>
        <CampoTexto valor={p.nome} aoConfirmar={(v) => aplicar((q) => ({ ...q, nome: v.trim() }))} />
      </label>
      <div className="linha">
        <label className="campo">
          <span>Versão</span>
          <CampoTexto valor={p.versao} aoConfirmar={(v) => /^v\d+\.\d+$/.test(v.trim()) ? aplicar((q) => ({ ...q, versao: v.trim() })) : useLoja.getState().avisar('erro', 'Versão deve seguir o padrão v1.0')} />
        </label>
        <label className="campo">
          <span>Data</span>
          <input type="date" value={p.data} onChange={(e) => e.target.value && aplicar((q) => ({ ...q, data: e.target.value }))} />
        </label>
      </div>
      {meta('area', 'Área responsável')}
      {meta('macro', 'Macroprocesso')}
      <h3>Ordem das raias</h3>
      <ol className="raias">
        {raias.map((r, i) => (
          <li key={r}>
            <span>{r}</span>
            <span className="acoes">
              <button className="icone" disabled={i === 0} aria-label={`Subir ${r}`} onClick={() => mover(i, -1)}>▲</button>
              <button className="icone" disabled={i === raias.length - 1} aria-label={`Descer ${r}`} onClick={() => mover(i, 1)}>▼</button>
            </span>
          </li>
        ))}
      </ol>
      {p.layout.ordemRaias && <button className="mini" onClick={() => aplicar((q) => ({ ...q, layout: { ...q.layout, ordemRaias: null } }))}>Ordem automática</button>}
      {Object.keys(p.layout.posicoes).length > 0 && (
        <>
          <h3>Layout</h3>
          <p className="nota">{Object.keys(p.layout.posicoes).length} etapa(s) com posição definida à mão.</p>
          <button className="mini" onClick={() => aplicar((q) => ({ ...q, layout: { ...q.layout, posicoes: {} } }))}>Reorganizar automaticamente</button>
        </>
      )}
    </div>
  );
}
