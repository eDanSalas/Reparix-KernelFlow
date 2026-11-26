import { randomUUID } from 'node:crypto';
import { hashPassword } from '../security.js';
import { HttpError } from '../validation.js';

export async function registerInternalUser(pool, { username, name, password, role }, actorId) {
  const id = randomUUID();
  const passwordHash = hashPassword(password);
  try {
    const { rows: [user] } = await pool.query(`
      SELECT id, username, name, role, active
      FROM reparix.register_internal_user($1,$2,$3,$4,$5,$6)`,
    [id, username, name, passwordHash, role, actorId]);
    if (!user) {
      const message = 'El nombre de usuario ya existe.';
      throw new HttpError(409, message, { username: message });
    }
    return user;
  } catch (error) {
    if (error.code === 'P5003') throw new HttpError(403, error.message);
    throw error;
  }
}

export async function readDeactivations(pool, userId) {
  const { rows: [account] } = await pool.query(`
    SELECT ARRAY(
      SELECT jsonb_build_object('id', h.id::text, 'actorId', h.actor_id,
        'actorName', actor.display_name, 'changedAt', h.changed_at)
      FROM reparix.internal_user_deactivations h
      JOIN reparix.internal_users actor ON actor.id=h.actor_id
      WHERE h.user_id=u.id
      ORDER BY h.changed_at,h.id
    ) AS history
    FROM reparix.internal_users u WHERE u.id=$1`, [userId]);
  if (!account) throw new HttpError(404, 'Cuenta interna no encontrada.');
  return account.history;
}

export async function deactivateInternalUser(pool, userId, actorId) {
  try {
    const { rows: [event] } = await pool.query(`
      SELECT actor_id AS "actorId", changed_at AS "changedAt"
      FROM reparix.deactivate_internal_user($1,$2)`, [userId, actorId]);
    return event;
  } catch (error) {
    const status = { P5002: 404, P5003: 403, P5004: 409 }[error.code];
    if (status) throw new HttpError(status, error.message);
    throw error;
  }
}
