import { HttpError } from '../validation.js';

export class RegistroAceptacionPresupuesto {
  constructor({ controlAcceso, presupuesto, ordenReparacion, decisionPresupuesto, historial } = {}) {
    this.controlAcceso = controlAcceso;
    this.presupuesto = presupuesto;
    this.ordenReparacion = ordenReparacion;
    this.decisionPresupuesto = decisionPresupuesto;
    this.historial = historial;
  }

  async registrar(solicitud) {
    const canal = typeof solicitud?.canal === 'string' ? solicitud.canal.trim() : '';
    if (!canal) {
      throw new HttpError(422, 'El canal de comunicación es obligatorio.');
    }

    await this.controlAcceso.tienePermiso(solicitud.usuario);
    const orden = await this.ordenReparacion.obtenerPorFolio(solicitud.folio);
    const presupuestoVigente = await this.presupuesto.obtenerVigenteComunicado(orden.id);

    const evidencia = typeof solicitud.evidencia === 'string' ? solicitud.evidencia.trim() : solicitud.evidencia;
    const responsable = typeof solicitud.responsable === 'string' ? solicitud.responsable.trim() : solicitud.responsable;

    const decision = await this.decisionPresupuesto.guardar({
      ordenId: orden.id,
      presupuestoId: presupuestoVigente.id,
      presupuestoRevision: presupuestoVigente.revision,
      canal,
      evidencia,
      responsable,
    });

    await this.historial.registrar({
      ordenId: orden.id,
      autor: solicitud.usuario.id,
      fechaHora: new Date().toISOString(),
    });

    // HU01-U02 (CA-3): registrar la aceptación no inicia la reparación ni modifica el estado de la orden automáticamente.
    return { decision, orden };
  }
}

