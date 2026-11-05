import { criarProcesso, type OpcoesCriacao } from './modelo/fabrica';
import type { Processo } from './modelo/schema';

/**
 * Exemplo de referência "Aprovação de Solicitação" (ESPECIFICACAO §4.5).
 * Dados fictícios. Usado nos testes e na demonstração.
 */
export function processoExemplo(opcoes: OpcoesCriacao = {}): Processo {
  const p = criarProcesso({ nome: 'Aprovação de Solicitação', ...opcoes });
  p.metadados = { area: 'Qualidade', macro: 'Atendimento' };
  p.etapas = [
    { id: 'E01', tipo: 'inicio', descricao: 'Cliente envia solicitação', saidas: [{ destino: 'E02' }] },
    { id: 'E02', tipo: 'tarefa', descricao: 'Receber solicitação', ator: 'Atendimento', apoio: 'Formulário', saidas: [{ destino: 'E03' }] },
    { id: 'E03', tipo: 'tarefa', descricao: 'Analisar documentação', ator: 'Área Responsável', apoio: 'Checklist', saidas: [{ destino: 'E04' }] },
    {
      id: 'E04', tipo: 'gw_exclusivo', descricao: 'Documentação está correta?', ator: 'Área Responsável',
      saidas: [{ destino: 'E05', rotulo: 'SIM' }, { destino: 'E06', rotulo: 'NÃO' }],
    },
    { id: 'E05', tipo: 'tarefa', descricao: 'Aprovar solicitação', ator: 'Área Responsável', saidas: [{ destino: 'E08' }] },
    { id: 'E06', tipo: 'tarefa', descricao: 'Solicitar ajuste', ator: 'Atendimento', apoio: 'E-mail', saidas: [{ destino: 'E07' }] },
    {
      id: 'E07', tipo: 'gw_exclusivo', descricao: 'Ajuste foi recebido?', ator: 'Atendimento',
      saidas: [{ destino: 'E03', rotulo: 'SIM' }, { destino: 'E09', rotulo: 'NÃO' }],
    },
    { id: 'E08', tipo: 'fim', descricao: 'Solicitação aprovada', resultado: 'Aprovado', saidas: [] },
    { id: 'E09', tipo: 'fim', descricao: 'Processo encerrado', resultado: 'Encerrado', saidas: [] },
  ];
  return p;
}
