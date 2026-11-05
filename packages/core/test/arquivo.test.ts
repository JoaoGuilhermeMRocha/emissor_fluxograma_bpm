import { describe, expect, it } from 'vitest';
import { lerProcesso, nomeDoArquivo, processoExemplo, serializarProcesso, slug, type Migracao } from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };

describe('slug e nome do arquivo', () => {
  it('normaliza acentos, pontos e símbolos', () => {
    expect(slug('Concessão de Crédito')).toBe('concessao_de_credito');
    expect(slug('v1.2')).toBe('v1_2');
    expect(slug('  --Olá, Mundo!-- ')).toBe('ola_mundo');
  });

  it('nome = slug(nome)_slug(versão).processo', () => {
    expect(nomeDoArquivo({ nome: 'Aprovação de Solicitação', versao: 'v1.0' })).toBe('aprovacao_de_solicitacao_v1_0.processo');
    expect(nomeDoArquivo({ nome: '', versao: 'v2.3' })).toBe('processo_v2_3.processo');
  });
});

describe('ler e gravar .processo', () => {
  const p = processoExemplo(fixo);

  it('ida e volta sem perdas', () => {
    const r = lerProcesso(serializarProcesso(p, fixo));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.processo).toEqual(p);
      expect(r.somenteLeitura).toBe(false);
      expect(r.avisos).toEqual([]);
    }
  });

  it('aceita BOM no início', () => {
    expect(lerProcesso('﻿' + serializarProcesso(p)).ok).toBe(true);
  });

  it('recusa JSON inválido, outro formato e versão ausente', () => {
    expect(lerProcesso('{oi')).toMatchObject({ ok: false, erro: 'O arquivo não é um JSON válido' });
    expect(lerProcesso('{"formato":"outro"}')).toMatchObject({ ok: false });
    expect(lerProcesso('{"formato":"mapeador-processo","processo":{}}')).toMatchObject({ ok: false, erro: 'Versão de formato ausente ou inválida' });
  });

  it('aponta campos corrompidos', () => {
    const env = JSON.parse(serializarProcesso(p));
    env.processo.etapas[0].tipo = 'xyz';
    const r = lerProcesso(JSON.stringify(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detalhes?.[0]).toMatch(/^etapas\.0\.tipo/);
  });

  it('arquivo de versão mais nova abre somente leitura', () => {
    const env = JSON.parse(serializarProcesso(p));
    env.versaoFormato = 99;
    env.processo.campoFuturo = true;
    const r = lerProcesso(JSON.stringify(env));
    expect(r).toMatchObject({ ok: true, somenteLeitura: true });
  });

  it('aplica migrações em sequência', () => {
    // Simula: no formato 1 a descrição se chamava "texto"; o 2 renomeou.
    const migracoes: Migracao[] = [
      {
        de: 1,
        descricao: 'campo "texto" das etapas renomeado para "descricao"',
        aplicar: (proc) => ({
          ...proc,
          etapas: (proc.etapas as Record<string, unknown>[]).map(({ texto, ...resto }) => ({ ...resto, descricao: texto })),
        }),
      },
    ];
    const env = JSON.parse(serializarProcesso(p));
    env.processo.etapas = env.processo.etapas.map(({ descricao, ...resto }: Record<string, unknown>) => ({ ...resto, texto: descricao }));
    const r = lerProcesso(JSON.stringify(env), { migracoes, versaoAtual: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.processo.etapas[0]!.descricao).toBe('Cliente envia solicitação');
      expect(r.avisos).toHaveLength(1);
      expect(r.versaoOriginal).toBe(1);
    }
  });

  it('falha se faltar uma migração', () => {
    const r = lerProcesso(serializarProcesso(p), { migracoes: [], versaoAtual: 3 });
    expect(r).toMatchObject({ ok: false, erro: 'Não há conversão do formato 1 para 2' });
  });
});
