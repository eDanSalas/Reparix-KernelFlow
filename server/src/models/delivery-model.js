import { digest } from '../security.js';
import { HttpError } from '../validation.js';

export async function readDeliveries(pool, folio) {
  const { rows } = await pool.query(`
    SELECT d.id, d.receptor, d.evidencia, d.actor_id AS "actorId", u.display_name AS "actorName",
      d.recorded_at AS "recordedAt"
    FROM reparix.orders o LEFT JOIN reparix.order_deliveries d ON d.order_id=o.id
    LEFT JOIN reparix.internal_users u ON u.id=d.actor_id
    WHERE o.folio=$1`, [folio]);
  if (!rows.length) throw new HttpError(404, 'Orden no encontrada.');
  return rows[0].id ? rows : [];
}

export async function confirmDelivery(pool, folio, data, actorId, key, requestId) {
  const { expectedVersion, receptor, evidencia } = data;
  try {
    const { rows: [result] } = await pool.query(`
      SELECT d.id, d.receptor, d.evidencia, d.actor_id AS "actorId", u.display_name AS "actorName",
        d.recorded_at AS "recordedAt", d.replayed
      FROM reparix.confirm_order_delivery($1,$2,$3,$4,$5,$6,$7,$8) d
      JOIN reparix.internal_users u ON u.id=d.actor_id`, [
      folio, actorId, expectedVersion, receptor, evidencia, key, digest(JSON.stringify(data)), requestId,
    ]);
    const { replayed, ...delivery } = result;
    return { delivery, replayed };
  } catch (error) {
    const status = { P5002: 404, P5003: 403, P5004: 409 }[error.code];
    if (!status) throw error;
    const httpError = new HttpError(status, error.message);
    if (status === 409 && /^\d+$/.test(error.detail || '')) {
      httpError.conflict = { currentVersion: Number(error.detail) };
    }
    throw httpError;
  }
}
