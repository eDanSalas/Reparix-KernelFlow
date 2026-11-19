import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/validation.js';
import { RegistroAceptacionPresupuesto } from '../src/models/registro-aceptacion-presupuesto.js';

const ORDEN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const FOLIO = 'RPX-000000000001';
const PRESUPUESTO_ID = '11111111-2222-4333-8444-555555555555';

const crearUsuarioAutorizado = () => ({
  id: '99999999-8888-4777-8666-555555555555',
  username: 'recepcion.demo',
  displayName: 'Ana Recepción',
  role: 'recepcion',
  active: true,
});

const crearUsuarioSinPermiso = () => ({
  id: '77777777-6666-4555-8444-333333333333',
  username: 'tecnico.demo',
  displayName: 'Luis Técnico',
  role: 'tecnico',
  active: true,
});

const crearOrdenPendiente = () => ({
  id: ORDEN_ID,
  folio: FOLIO,
  estado: 'Pendiente de autorización',
  version: 5,
});

const crearPresupuestoVigente = () => ({
  id: PRESUPUESTO_ID,
  ordenId: ORDEN_ID,
  revision: 2,
  monto: '1500.00',
  moneda: 'MXN',
  comunicado: true,
  vigente: true,
});

const crearSolicitudValida = (overrides = {}) => ({
  folio: FOLIO,
  usuario: crearUsuarioAutorizado(),
  canal: 'WhatsApp',
  evidencia: 'Captura de confirmación del cliente recibida a las 10:15',
  responsable: 'Ana Recepción',
  ...overrides,
});

function crearColaboradores({
  tienePermiso = true,
  orden = crearOrdenPendiente(),
  presupuestoVigente = crearPresupuestoVigente(),
} = {}) {
  const controlAcceso = {
    tienePermiso: mock.fn(async () => tienePermiso),
  };

  const ordenReparacion = {
    obtenerPorFolio: mock.fn(async () => (orden ? { ...orden } : null)),
    iniciarReparacion: mock.fn(async () => {
      throw new Error('No debe iniciarse la reparación automáticamente');
    }),
    actualizarEstado: mock.fn(async () => (orden ? { ...orden } : null)),
  };

  const presupuesto = {
    obtenerVigenteComunicado: mock.fn(async () =>
      presupuestoVigente ? { ...presupuestoVigente } : null
    ),
  };

  const decisionPresupuesto = {
    guardar: mock.fn(async (decision) => ({
      id: '22222222-3333-4444-8555-666666666666',
      ...decision,
    })),
  };

  const historial = {
    registrar: mock.fn(async (evento) => ({
      id: '33333333-4444-4555-8666-777777777777',
      ...evento,
    })),
  };

  return {
    controlAcceso,
    presupuesto,
    ordenReparacion,
    decisionPresupuesto,
    historial,
  };
}

describe('HU-01 Registrar aceptación del presupuesto - RegistroAceptacionPresupuesto', () => {
  describe('Camino feliz (CA-1 y CA-3)', () => {
    test('HU01-U01 registra aceptación vinculada a orden y presupuesto vigente, y escribe en Historial con fecha/hora y autor', async () => {
      const colaboradores = crearColaboradores();
      const sut = new RegistroAceptacionPresupuesto(colaboradores);
      const solicitud = crearSolicitudValida({
        canal: '  WhatsApp  ',
        evidencia: '  Captura firmada por el cliente  ',
        responsable: '  Ana Recepción  ',
      });

      const antes = Date.now();
      const resultado = await sut.registrar(solicitud);
      const despues = Date.now();

      // 1. Verifica permiso del usuario mediante ControlAcceso
      assert.equal(colaboradores.controlAcceso.tienePermiso.mock.callCount(), 1);
      assert.deepEqual(
        colaboradores.controlAcceso.tienePermiso.mock.calls[0].arguments[0],
        solicitud.usuario
      );

      // 2. Consulta la orden y el presupuesto vigente comunicado
      assert.equal(colaboradores.ordenReparacion.obtenerPorFolio.mock.callCount(), 1);
      assert.equal(
        colaboradores.ordenReparacion.obtenerPorFolio.mock.calls[0].arguments[0],
        FOLIO
      );
      assert.equal(colaboradores.presupuesto.obtenerVigenteComunicado.mock.callCount(), 1);
      assert.equal(
        colaboradores.presupuesto.obtenerVigenteComunicado.mock.calls[0].arguments[0],
        ORDEN_ID
      );

      // 3. Conserva la decisión asociada a la orden y versión vigente del presupuesto
      assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 1);
      const decisionGuardada = colaboradores.decisionPresupuesto.guardar.mock.calls[0].arguments[0];
      assert.equal(decisionGuardada.ordenId, ORDEN_ID);
      assert.equal(decisionGuardada.presupuestoId, PRESUPUESTO_ID);
      assert.equal(decisionGuardada.presupuestoRevision, 2);
      assert.equal(decisionGuardada.canal, 'WhatsApp');
      assert.equal(decisionGuardada.evidencia, 'Captura firmada por el cliente');
      assert.equal(decisionGuardada.responsable, 'Ana Recepción');

      // 4. Registra la decisión en Historial con fecha/hora y autor
      assert.equal(colaboradores.historial.registrar.mock.callCount(), 1);
      const eventoHistorial = colaboradores.historial.registrar.mock.calls[0].arguments[0];
      assert.equal(eventoHistorial.ordenId, ORDEN_ID);
      assert.equal(eventoHistorial.autor, solicitud.usuario.id);
      assert.ok(eventoHistorial.fechaHora, 'El historial debe registrar fecha y hora');
      const timestamp = new Date(eventoHistorial.fechaHora).getTime();
      assert.ok(!Number.isNaN(timestamp), 'fechaHora debe ser una fecha/hora válida');
      assert.ok(
        timestamp >= antes && timestamp <= despues,
        'fechaHora debe corresponder al momento del registro'
      );

      // 5. Retorna evidencia del registro exitoso vinculado a la orden y presupuesto vigente
      assert.ok(resultado);
      assert.equal(resultado.decision.ordenId, ORDEN_ID);
      assert.equal(resultado.decision.presupuestoId, PRESUPUESTO_ID);
      assert.equal(resultado.decision.presupuestoRevision, 2);
    });

    test('HU01-U02 NO inicia la reparación automáticamente en OrdenReparacion al registrar la aceptación (CA-3)', async () => {
      const colaboradores = crearColaboradores();
      const sut = new RegistroAceptacionPresupuesto(colaboradores);

      const resultado = await sut.registrar(crearSolicitudValida());

      assert.equal(
        colaboradores.ordenReparacion.iniciarReparacion.mock.callCount(),
        0,
        'No debe invocar el inicio automático de reparación'
      );
      assert.equal(
        colaboradores.ordenReparacion.actualizarEstado.mock.callCount(),
        0,
        'No debe transicionar el estado de la orden automáticamente'
      );
      assert.notEqual(resultado.orden?.estado, 'En reparación');
      assert.equal(resultado.orden?.estado, 'Pendiente de autorización');
    });
  });

  describe('Rechazo por datos obligatorios faltantes o ausencia de presupuesto vigente (CA-1)', () => {
    test('HU01-U03 rechaza cuando falta o viene vacío el canal sin guardar decisión ni alterar historial', async () => {
      for (const canal of [undefined, null, '', '   ']) {
        const colaboradores = crearColaboradores();
        const sut = new RegistroAceptacionPresupuesto(colaboradores);

        await assert.rejects(
          () => sut.registrar(crearSolicitudValida({ canal })),
          (error) => error instanceof HttpError && error.status === 422
        );

        assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
        assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.iniciarReparacion.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.actualizarEstado.mock.callCount(), 0);
      }
    });

    test('HU01-U04 rechaza cuando falta o viene vacía la evidencia sin guardar decisión ni alterar historial', async () => {
      for (const evidencia of [undefined, null, '', '   ']) {
        const colaboradores = crearColaboradores();
        const sut = new RegistroAceptacionPresupuesto(colaboradores);

        await assert.rejects(
          () => sut.registrar(crearSolicitudValida({ evidencia })),
          (error) => error instanceof HttpError && error.status === 422
        );

        assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
        assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.iniciarReparacion.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.actualizarEstado.mock.callCount(), 0);
      }
    });

    test('HU01-U05 rechaza cuando falta o viene vacío el responsable sin guardar decisión ni alterar historial', async () => {
      for (const responsable of [undefined, null, '', '   ']) {
        const colaboradores = crearColaboradores();
        const sut = new RegistroAceptacionPresupuesto(colaboradores);

        await assert.rejects(
          () => sut.registrar(crearSolicitudValida({ responsable })),
          (error) => error instanceof HttpError && error.status === 422
        );

        assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
        assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.iniciarReparacion.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.actualizarEstado.mock.callCount(), 0);
      }
    });

    test('HU01-U06 rechaza cuando no existe un presupuesto vigente para la orden sin guardar decisión ni alterar historial', async () => {
      for (const presupuestoVigente of [null, undefined]) {
        const colaboradores = crearColaboradores({ presupuestoVigente });
        const sut = new RegistroAceptacionPresupuesto(colaboradores);

        await assert.rejects(
          () => sut.registrar(crearSolicitudValida()),
          (error) => error instanceof HttpError && [409, 422].includes(error.status)
        );

        assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
        assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
        assert.equal(colaboradores.ordenReparacion.iniciarReparacion.mock.callCount(), 0);
      }
    });

    test('HU01-U07 rechaza cuando el presupuesto no está vigente o no fue comunicado al cliente', async () => {
      const casosNoValidos = [
        { ...crearPresupuestoVigente(), vigente: false },
        { ...crearPresupuestoVigente(), comunicado: false },
      ];

      for (const presupuestoNoValido of casosNoValidos) {
        const colaboradores = crearColaboradores({ presupuestoVigente: presupuestoNoValido });
        const sut = new RegistroAceptacionPresupuesto(colaboradores);

        await assert.rejects(
          () => sut.registrar(crearSolicitudValida()),
          (error) => error instanceof HttpError && [409, 422].includes(error.status)
        );

        assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
        assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
      }
    });
  });

  describe('Denegación por falta de permisos (CA-2)', () => {
    test('HU01-U08 deniega el registro cuando ControlAcceso rechaza al usuario sin guardar decisión ni escribir en Historial', async () => {
      const colaboradores = crearColaboradores({ tienePermiso: false });
      const sut = new RegistroAceptacionPresupuesto(colaboradores);
      const usuarioSinPermiso = crearUsuarioSinPermiso();

      await assert.rejects(
        () => sut.registrar(crearSolicitudValida({ usuario: usuarioSinPermiso })),
        (error) => error instanceof HttpError && error.status === 403
      );

      assert.equal(colaboradores.controlAcceso.tienePermiso.mock.callCount(), 1);
      assert.deepEqual(
        colaboradores.controlAcceso.tienePermiso.mock.calls[0].arguments[0],
        usuarioSinPermiso
      );
      assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
      assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
      assert.equal(colaboradores.ordenReparacion.iniciarReparacion.mock.callCount(), 0);
      assert.equal(colaboradores.ordenReparacion.actualizarEstado.mock.callCount(), 0);
    });

    test('HU01-U09 deniega el registro cuando no hay usuario autenticado o es rechazado por ControlAcceso', async () => {
      const colaboradores = crearColaboradores({ tienePermiso: false });
      const sut = new RegistroAceptacionPresupuesto(colaboradores);

      await assert.rejects(
        () => sut.registrar(crearSolicitudValida({ usuario: null })),
        (error) => error instanceof HttpError && error.status === 403
      );

      assert.equal(colaboradores.decisionPresupuesto.guardar.mock.callCount(), 0);
      assert.equal(colaboradores.historial.registrar.mock.callCount(), 0);
    });
  });
});
