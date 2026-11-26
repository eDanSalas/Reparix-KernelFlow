import { HttpError } from '../validation.js';

export async function listInternalAccounts(pool) {
  const { rows } = await pool.query(`
    SELECT id, username, display_name AS name, role, active
    FROM reparix.internal_users ORDER BY display_name,username`);
  return rows;
}

export async function readRoleChanges(pool, userId) {
  const { rows: [result] } = await pool.query(`
    SELECT u.id, u.username, u.display_name AS name, u.role, u.active, ARRAY(
      SELECT jsonb_build_object(
        'id', h.id::text, 'previousRole', h.previous_role, 'newRole', h.new_role,
        'actorId', h.actor_id, 'actorName', actor.display_name, 'changedAt', h.changed_at
      )
      FROM reparix.internal_user_role_changes h
      JOIN reparix.internal_users actor ON actor.id=h.actor_id
      WHERE h.user_id=u.id
      ORDER BY h.changed_at,h.id
    ) AS history,
    CASE WHEN r.user_id IS NOT NULL THEN jsonb_build_object(
      'actorId', r.actor_id, 'actorName', registrar.display_name,
      'initialRole', r.initial_role, 'registeredAt', r.registered_at
    ) END AS registration
    FROM reparix.internal_users u
    LEFT JOIN reparix.internal_user_registrations r ON r.user_id=u.id
    LEFT JOIN reparix.internal_users registrar ON registrar.id=r.actor_id
    WHERE u.id=$1`, [userId]);
  if (!result) throw new HttpError(404, 'Cuenta interna no encontrada.');
  const { history, registration, ...account } = result;
  return registration ? { account, history, registration } : { account, history };
}

export async function changeUserRole(pool, userId, role, actorId) {
  try {
    const { rows: [change] } = await pool.query(`
      SELECT previous_role AS "previousRole", new_role AS "newRole",
        actor_id AS "actorId", changed_at AS "changedAt"
      FROM reparix.change_internal_user_role($1,$2,$3)`, [userId, role, actorId]);
    return change;
  } catch (error) {
    const status = { P5001: 422, P5002: 404, P5003: 403, P5004: 409 }[error.code];
    if (status) throw new HttpError(status, error.message);
    throw error;
  }
}
