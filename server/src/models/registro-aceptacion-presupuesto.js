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

    const evidencia = typeof solicitud?.evidencia === 'string' ? solicitud.evidencia.trim() : '';
    if (!evidencia) {
      throw new HttpError(422, 'La evidencia de confirmación es obligatoria.');
    }

    const responsable = typeof solicitud?.responsable === 'string' ? solicitud.responsable.trim() : '';
    if (!responsable) {
      throw new HttpError(422, 'El responsable del registro es obligatorio.');
    }

    for (const [campo, valor, max] of [['canal', canal, 80], ['evidencia', evidencia, 2000], ['responsable', responsable, 120]]) {
      if (valor.length > max || /[\0\uD800-\uDFFF]/u.test(valor)) {
        throw new HttpError(422, `Captura un ${campo} válido de hasta ${max} caracteres.`);
      }
    }

    const autorizado = await this.controlAcceso.tienePermiso(solicitud?.usuario);
    if (!solicitud?.usuario || !autorizado) {
      throw new HttpError(403, 'El usuario no tiene permisos para registrar la aceptación del presupuesto.');
    }
    const orden = await this.ordenReparacion.obtenerPorFolio(solicitud.folio);
    if (!orden) throw new HttpError(404, 'Orden no encontrada.');
    const presupuestoVigente = await this.presupuesto.obtenerVigenteComunicado(orden.id);
    if (!presupuestoVigente || !presupuestoVigente.vigente || !presupuestoVigente.comunicado ||
        (solicitud.presupuestoId && solicitud.presupuestoId !== presupuestoVigente.id)) {
      throw new HttpError(409, 'El presupuesto debe estar vigente y haber sido comunicado al cliente.');
    }

    const fechaHora = new Date().toISOString();
    const decision = await this.decisionPresupuesto.guardar({
      ordenId: orden.id,
      presupuestoId: presupuestoVigente.id,
      presupuestoRevision: presupuestoVigente.revision,
      canal,
      evidencia,
      responsable,
      autor: solicitud.usuario.id,
      fechaHora,
    });

    await this.historial.registrar({
      ordenId: orden.id,
      autor: solicitud.usuario.id,
      fechaHora,
      decisionId: decision.id,
      revision: presupuestoVigente.revision,
    });

    // Registrar la aceptación conserva el estado de la orden.
    return { decision, orden };
  }
}

