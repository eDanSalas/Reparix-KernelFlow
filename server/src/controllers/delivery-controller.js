import { HttpError, uuidPattern } from '../validation.js';
import { confirmDelivery, readDeliveries } from '../models/delivery-model.js';

function orderFolio(req) {
  const { folio } = req.params;
  if (!/^RPX-\d{12}$/.test(folio)) throw new HttpError(404, 'Orden no encontrada.');
  return folio;
}

function validateDelivery(body) {
  const fields = ['receptor', 'evidencia', 'expectedVersion'];
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(field => !fields.includes(field))) {
    throw new HttpError(422, 'Revisa los datos de la entrega.');
  }
  const { expectedVersion } = body;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion >= 2147483647) {
    throw new HttpError(422, 'Consulta una versión válida de la orden.');
  }
  const receptor = typeof body.receptor === 'string' ? body.receptor.trim().normalize('NFC') : '';
  const evidencia = typeof body.evidencia === 'string' ? body.evidencia.trim().normalize('NFC') : '';
  const invalidText = /[\u0000-\u001f\u007f\uD800-\uDFFF]/u;
  if (!receptor || receptor.length > 120 || invalidText.test(receptor)) {
    throw new HttpError(422, 'Captura un nombre de receptor válido de hasta 120 caracteres.');
  }
  if (!evidencia || evidencia.length > 500 || invalidText.test(evidencia)) {
    throw new HttpError(422, 'Captura evidencia válida de hasta 500 caracteres.');
  }
  return { expectedVersion, receptor, evidencia };
}

export function deliveryController(pool) {
  return {
    list: async (req, res) => {
      res.json({ deliveries: await readDeliveries(pool, orderFolio(req)) });
    },
    confirm: async (req, res) => {
      const folio = orderFolio(req);
      const key = req.get('Idempotency-Key');
      if (!key || !uuidPattern.test(key)) throw new HttpError(400, 'Falta una clave válida para reintentar la entrega.');
      const data = validateDelivery(req.body);
      const { delivery, replayed } = await confirmDelivery(pool, folio, data, req.user.id, key, req.requestId);
      res.status(replayed ? 200 : 201).json({ delivery });
    },
  };
}
