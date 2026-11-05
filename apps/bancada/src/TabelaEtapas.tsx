import { useEffect, useRef, useState } from 'react';
import {
  atoresConhecidos,
  atualizarEtapa,
  excluirEtapa,
  resolverRaias,
  trocarTipo,
  DEFINICOES,
  RESULTADOS_FIM,
  TIPOS_ETAPA,
  type Etapa,
  type Problema,
  type Processo,
  type Saida,
} from '@mapeador/core';

interface Props {
  processo: Processo;
  aplicar: (op: (p: Processo) => Processo) => void;
  selecionada: string | null;
  selecionar: (id: string | null) => void;
  problemas: Problema[];
}

export function TabelaEtapas({ processo: p, aplicar, selecionada, selecionar, problemas }: Props) {
  const raias = resolverRaias(p);
  const atores = atoresConhecidos(p);
  const linhaSel = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    linhaSel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selecionada]);

  const atualizar = (id: string, campos: Partial<Omit<Etapa, 'id' | 'tipo'>>) => aplicar((q) => atualizarEtapa(q, id, campos));

  if (!p.etapas.length) {
    return <p className="vazio">Nenhuma etapa. Escolha um tipo acima e clique em “Adicionar”.</p>;
  }

  return (
    <div className="tabela-rolagem">
      <datalist id="lista-atores">
        {atores.map((a) => <option key={a} value={a} />)}
      </datalist>
      <table className="etapas">
        <thead>
          <tr>
            <th>Id</th>
            <th>Tipo</th>
            <th>Descrição</th>
            <th>Responsável</th>
            <th>Apoio</th>
            <th>Saídas</th>
            <th>Detalhe</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {p.etapas.map((e) => {
            const def = DEFINICOES[e.tipo];
            const probs = problemas.filter((x) => x.etapa === e.id);
            const pior = probs.find((x) => x.severidade === 'erro') ? 'erro' : probs.find((x) => x.severidade === 'aviso') ? 'aviso' : probs.length ? 'info' : '';
            return (
              <tr
                key={e.id}
                ref={selecionada === e.id ? linhaSel : undefined}
                className={selecionada === e.id ? 'selecionada' : ''}
                onClick={() => selecionar(e.id)}
              >
                <td className="id">
                  <span className={`ponto ${pior}`} title={probs.map((x) => x.mensagem).join('\n')} />
                  {e.id}
                </td>
                <td>
                  <select
                    value={e.tipo}
                    onChange={(ev) => aplicar((q) => trocarTipo(q, e.id, ev.target.value as Etapa['tipo']))}
                    title="Só aparecem tipos da mesma família (RF-05)"
                  >
                    {TIPOS_ETAPA.filter((t) => DEFINICOES[t].familia === def.familia).map((t) => (
                      <option key={t} value={t}>{DEFINICOES[t].rotulo}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <CampoTexto valor={e.descricao} aoConfirmar={(v) => atualizar(e.id, { descricao: v })} placeholder="Descrição" />
                </td>
                <td>
                  {def.ator === 'nenhum' ? (
                    <span className="herdado" title="Raia herdada pelas regras do §4.4">↳ {raias.get(e.id) ?? '—'}</span>
                  ) : (
                    <CampoTexto
                      valor={e.ator ?? ''}
                      aoConfirmar={(v) => atualizar(e.id, { ator: v })}
                      lista="lista-atores"
                      placeholder={def.ator === 'obrigatorio' ? 'Obrigatório' : `Herda: ${raias.get(e.id) ?? ''}`}
                    />
                  )}
                </td>
                <td>
                  {def.familia === 'atividade' || def.familia === 'gateway' ? (
                    <CampoTexto valor={e.apoio ?? ''} aoConfirmar={(v) => atualizar(e.id, { apoio: v })} placeholder="Sistema, documento…" />
                  ) : (
                    <span className="mudo">—</span>
                  )}
                </td>
                <td>
                  <EditorSaidas etapa={e} processo={p} aoMudar={(saidas) => atualizar(e.id, { saidas })} />
                </td>
                <td>
                  <Detalhe etapa={e} processo={p} atualizar={(c) => atualizar(e.id, c)} />
                </td>
                <td>
                  <button
                    className="icone perigo"
                    title={`Excluir ${e.id}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      aplicar((q) => excluirEtapa(q, e.id));
                      selecionar(null);
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Campo que só grava ao sair ou apertar Enter (a limpeza de texto apagaria espaços durante a digitação). */
function CampoTexto({ valor, aoConfirmar, placeholder, lista }: { valor: string; aoConfirmar: (v: string) => void; placeholder?: string; lista?: string }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const confirmar = () => texto !== valor && aoConfirmar(texto);
  return (
    <input
      value={texto}
      list={lista}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setTexto(valor);
      }}
    />
  );
}

function EditorSaidas({ etapa, processo, aoMudar }: { etapa: Etapa; processo: Processo; aoMudar: (s: Saida[]) => void }) {
  const def = DEFINICOES[etapa.tipo];
  if (def.saidasMax === 0 && etapa.saidas.length === 0) return <span className="mudo">sem saída</span>;
  const opcoes = processo.etapas.filter((x) => x.id !== etapa.id && x.tipo !== 'anotacao');
  const mudar = (i: number, s: Saida) => aoMudar(etapa.saidas.map((x, k) => (k === i ? s : x)));
  const podeRotular = def.familia === 'gateway';

  return (
    <div className="saidas">
      {etapa.saidas.map((s, i) => (
        <div key={i} className="saida">
          {podeRotular && (
            <CampoTexto
              valor={s.rotulo ?? ''}
              placeholder={def.saidasRotuladas ? 'Rótulo' : 'Rótulo (opcional)'}
              aoConfirmar={(v) => mudar(i, v ? { ...s, rotulo: v } : { destino: s.destino })}
            />
          )}
          <select value={s.destino} onChange={(e) => mudar(i, { ...s, destino: e.target.value })} className={s.destino ? '' : 'pendente'}>
            <option value="">→ sem destino</option>
            {opcoes.map((x) => (
              <option key={x.id} value={x.id}>→ {x.id} {x.descricao.slice(0, 28)}</option>
            ))}
            {s.destino && !opcoes.some((x) => x.id === s.destino) && <option value={s.destino}>→ {s.destino} (inexistente)</option>}
          </select>
          {(etapa.saidas.length > def.saidasMin || etapa.saidas.length > def.saidasMax) && (
            <button className="icone" title="Remover saída" onClick={() => aoMudar(etapa.saidas.filter((_, k) => k !== i))}>−</button>
          )}
        </div>
      ))}
      {etapa.saidas.length < def.saidasMax && (
        <button className="mini" onClick={() => aoMudar([...etapa.saidas, { destino: '' }])}>+ saída</button>
      )}
    </div>
  );
}

function Detalhe({ etapa: e, processo, atualizar }: { etapa: Etapa; processo: Processo; atualizar: (c: Partial<Etapa>) => void }) {
  if (e.tipo === 'fim') {
    return (
      <select value={e.resultado ?? 'Finalizado'} onChange={(ev) => atualizar({ resultado: ev.target.value as Etapa['resultado'] })}>
        {RESULTADOS_FIM.map((r) => <option key={r}>{r}</option>)}
      </select>
    );
  }
  if (e.tipo === 'gw_complexo') return <CampoTexto valor={e.regra ?? ''} placeholder="Regra" aoConfirmar={(v) => atualizar({ regra: v })} />;
  if (e.tipo === 'intermediario') {
    return (
      <select value={e.evento ?? 'captura'} onChange={(ev) => atualizar({ evento: ev.target.value as 'captura' | 'disparo' })}>
        <option value="captura">Captura (espera)</option>
        <option value="disparo">Disparo (sinaliza)</option>
      </select>
    );
  }
  if (e.tipo === 'anotacao') {
    return (
      <select value={e.anotaEtapa ?? ''} onChange={(ev) => atualizar({ anotaEtapa: ev.target.value || undefined })}>
        <option value="">Ligada a…</option>
        {processo.etapas.filter((x) => x.tipo !== 'anotacao').map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
      </select>
    );
  }
  if (e.origem) return <span className="mudo" title="Id no arquivo de origem">de {e.origem.formato}: {e.origem.idOriginal}</span>;
  return <span className="mudo">—</span>;
}
