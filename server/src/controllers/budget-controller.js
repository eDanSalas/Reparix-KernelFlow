import { HttpError, uuidPattern } from '../validation.js';
import { canRecordBudget, recordAcceptance, recordCommunication, recordRejection } from '../models/budget-model.js';

export function budgetController(pool) {
  function assessmentId(req) {
    if (!canRecordBudget(req.user)) throw new HttpError(403, 'Tu rol no permite registrar comunicaciones ni decisiones de presupuestos.');
    if (!/^RPX-\d{12}$/.test(req.params.folio)) throw new HttpError(404, 'Orden no encontrada.');
    const id = req.body?.presupuestoId;
    if (typeof id !== 'string' || !uuidPattern.test(id)) {
      throw new HttpError(422, 'Selecciona una revisión válida del presupuesto.');
    }
    return id.toLowerCase();
  }

  return {
    communicate: async (req, res) => {
      const id = assessmentId(req);
      res.status(201).json(await recordCommunication(pool, req.params.folio, id, req.user));
    },
    accept: async (req, res) => {
      const presupuestoId = assessmentId(req);
      const { canal, evidencia, responsable } = req.body;
      const data = { presupuestoId, canal, evidencia, responsable };
      res.status(201).json(await recordAcceptance(pool, req.params.folio, data, req.user, req.requestId));
    },
    reject: async (req, res) => {
      const presupuestoId = assessmentId(req);
      const evidencia = typeof req.body.evidencia === 'string' ? req.body.evidencia.trim().normalize('NFC') : '';
      if (evidencia.length < 3 || evidencia.length > 500 || /[\u0000\uD800-\uDFFF]/u.test(evidencia)) {
        throw new HttpError(422, 'Captura de 3 a 500 caracteres de evidencia del rechazo.');
      }
      res.status(201).json(await recordRejection(pool, req.params.folio, { presupuestoId, evidencia }, req.user, req.requestId));
    },
  };
}
