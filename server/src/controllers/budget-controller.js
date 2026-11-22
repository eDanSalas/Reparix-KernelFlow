import { HttpError, uuidPattern } from '../validation.js';
import { canRecordBudget, recordAcceptance, recordCommunication } from '../models/budget-model.js';

export function budgetController(pool) {
  function assessmentId(req) {
    if (!canRecordBudget(req.user)) throw new HttpError(403, 'Tu rol no permite registrar comunicaciones ni aceptaciones de presupuestos.');
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
  };
}
