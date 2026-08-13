/**
 * Comando exato ####$#!$#recomeçar-atendimento zera histórico do chat.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CMD_RECOMECAR_ATENDIMENTO,
  mensagemEhComandoRecomecar,
  loteTemComandoRecomecar,
} from './comando-recomecar-atendimento.js';

describe('comando recomeçar-atendimento', () => {
  test('match exato', () => {
    assert.equal(CMD_RECOMECAR_ATENDIMENTO, '####$#!$#recomeçar-atendimento');
    assert.equal(mensagemEhComandoRecomecar(CMD_RECOMECAR_ATENDIMENTO), true);
    assert.equal(mensagemEhComandoRecomecar(`  ${CMD_RECOMECAR_ATENDIMENTO}  `), true);
  });

  test('não casa com variantes', () => {
    assert.equal(mensagemEhComandoRecomecar('recomeçar-atendimento'), false);
    assert.equal(mensagemEhComandoRecomecar(CMD_RECOMECAR_ATENDIMENTO + '!'), false);
    assert.equal(mensagemEhComandoRecomecar('Oi ' + CMD_RECOMECAR_ATENDIMENTO), false);
    assert.equal(mensagemEhComandoRecomecar(''), false);
  });

  test('lote', () => {
    assert.equal(loteTemComandoRecomecar([CMD_RECOMECAR_ATENDIMENTO]), true);
    assert.equal(loteTemComandoRecomecar(['oi', CMD_RECOMECAR_ATENDIMENTO]), true);
    assert.equal(loteTemComandoRecomecar(['oi', 'tudo bem']), false);
  });
});
