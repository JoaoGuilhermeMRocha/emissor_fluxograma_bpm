import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adicionarEtapa, atualizarEtapa } from '@mapeador/core';
import { banco, listarProcessos, lerRegistro } from '../src/armazenamento/banco';
import { abrirDaBiblioteca, abrirNovoNaBiblioteca, inicializar, novoProcesso, useLoja } from '../src/estado/loja';

const loja = () => useLoja.getState();

beforeEach(async () => {
  await banco.processos.clear();
  await banco.preferencias.clear();
  useLoja.setState({ processo: null, passado: [], futuro: [], selecionada: null, avisos: [], registro: {}, salvamento: { estado: 'pronto' } });
});

describe('estado e armazenamento', () => {
  it('primeiro acesso cria o exemplo e grava na biblioteca', async () => {
    expect(await inicializar()).toBe('exemplo');
    expect(loja().processo!.nome).toBe('Aprovação de Solicitação');
    expect((await listarProcessos()).map((r) => r.nome)).toEqual(['Aprovação de Solicitação']);
  });

  it('aplicar, desfazer e refazer', async () => {
    await inicializar();
    const original = loja().processo!;
    expect(loja().aplicar((p) => atualizarEtapa(p, 'E02', { descricao: 'Receber pedido' }))).toBe(true);
    expect(loja().processo!.etapas[1]!.descricao).toBe('Receber pedido');
    loja().desfazer();
    expect(loja().processo).toEqual(original);
    loja().refazer();
    expect(loja().processo!.etapas[1]!.descricao).toBe('Receber pedido');
  });

  it('operação que não muda nada não entra no histórico', async () => {
    await inicializar();
    expect(loja().aplicar((p) => ({ ...p }))).toBe(false);
    expect(loja().passado).toHaveLength(0);
  });

  it('erro de edição vira aviso, sem quebrar', async () => {
    await inicializar();
    expect(loja().aplicar(() => { throw new Error('Etapa E77 não existe'); })).toBe(false);
    expect(loja().avisos.map((a) => a.texto)).toEqual(['Etapa E77 não existe']);
  });

  it('salvamento automático grava a alteração e incrementa a revisão', async () => {
    await inicializar();
    const rev = loja().processo!.revisao;
    loja().aplicar((p) => adicionarEtapa(p, { tipo: 'tarefa', descricao: 'Arquivar', ator: 'Atendimento' }).processo);
    expect(loja().salvamento.estado).toBe('pendente');
    await vi.waitFor(() => expect(loja().salvamento.estado).toBe('salvo'), { timeout: 3000, interval: 50 });
    const reg = await lerRegistro(loja().processo!.id);
    expect(reg!.processo.etapas.map((e) => e.descricao)).toContain('Arquivar');
    expect(reg!.processo.revisao).toBe(rev + 1);
    expect(loja().processo!.revisao).toBe(rev + 1);
  });

  it('continua de onde parou e troca entre processos sem perder nada', async () => {
    await inicializar();
    const exemplo = loja().processo!;
    loja().aplicar((p) => ({ ...p, nome: 'Exemplo editado' }));
    await novoProcesso('Segundo');
    expect(loja().processo!.nome).toBe('Segundo');
    expect((await lerRegistro(exemplo.id))!.nome).toBe('Exemplo editado'); // gravado antes de trocar

    // "recarregar a página": estado zerado, abre o último usado
    useLoja.setState({ processo: null });
    expect(await inicializar()).toBe('continuou');
    expect(loja().processo!.nome).toBe('Segundo');

    await abrirDaBiblioteca(exemplo.id);
    expect(loja().processo!.nome).toBe('Exemplo editado');
  });

  it('processo aberto de arquivo mantém a revisão do arquivo', async () => {
    await inicializar();
    const doArquivo = { ...loja().processo!, id: 'outro-id', linhagem: 'outro-id', nome: 'Do arquivo', revisao: 7 };
    await abrirNovoNaBiblioteca(doArquivo, { revisaoExportada: 7 });
    expect(loja().processo!.revisao).toBe(7);
    expect((await lerRegistro('outro-id'))!.revisaoExportada).toBe(7);
  });
});
