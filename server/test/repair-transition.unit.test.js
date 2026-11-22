import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStateTransition } from '../src/validation.js';

test('HU03-U01 En reparación es un destino válido para evaluar la transición', () => {
  assert.deepEqual(validateStateTransition({
    state: 'En reparación',
    expectedVersion: 5,
    note: '  Inicio confirmado  ',
  }), {
    state: 'En reparación',
    expectedVersion: 5,
    note: 'Inicio confirmado',
  });
});
