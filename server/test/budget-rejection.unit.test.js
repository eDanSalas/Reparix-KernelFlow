import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetController } from '../src/controllers/budget-controller.js';

for (const { id, label, channelField } of [
  { id: 'HU02-02', label: 'omitido', channelField: {} },
  { id: 'HU02-03', label: 'vacío', channelField: { canal: '' } },
  { id: 'HU02-04', label: 'con solo espacios', channelField: { canal: ' \t\u00a0 ' } },
]) {
  test(`${id} Un canal ${label} impide guardar el rechazo`, async t => {
    const connect = t.mock.fn(async () => {
      throw new Error('La solicitud llegó a persistencia sin un canal válido.');
    });
    const req = {
      params: { folio: 'RPX-000000000001' },
      user: { id: '99999999-8888-4777-8666-555555555555', role: 'recepcion' },
      body: {
        presupuestoId: '11111111-2222-4333-8444-555555555555',
        evidencia: 'El cliente rechazó el importe por escrito.',
        ...channelField,
      },
    };
    const res = { status: () => ({ json() {} }) };

    await assert.rejects(
      () => budgetController({ connect }).reject(req, res),
      { status: 422 },
      `Un canal ${label} debe generar HTTP 422 antes de guardar el rechazo.`,
    );
    assert.equal(connect.mock.callCount(), 0, 'Una solicitud inválida no debe iniciar la persistencia.');
  });
}
