CREATE TABLE reparix.internal_user_deactivations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES reparix.internal_users(id),
  actor_id uuid NOT NULL REFERENCES reparix.internal_users(id),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX internal_user_deactivations_history_idx
  ON reparix.internal_user_deactivations(user_id, changed_at, id);

CREATE FUNCTION reparix.deactivate_internal_user(p_user_id uuid, p_actor_id uuid)
RETURNS TABLE (actor_id uuid, changed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Match the lock order used for role changes before rechecking authorization.
  PERFORM u.id FROM reparix.internal_users u
  WHERE u.id IN (p_user_id, p_actor_id)
  ORDER BY u.id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM reparix.internal_users u
    WHERE u.id=p_actor_id AND u.active AND u.role='administrador'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Solo administración puede desactivar cuentas internas.';
  END IF;

  UPDATE reparix.internal_users u SET active=false WHERE u.id=p_user_id AND u.active;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM reparix.internal_users u WHERE u.id=p_user_id) THEN
      RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='La cuenta ya está desactivada.';
    END IF;
    RAISE EXCEPTION USING ERRCODE='P5002', MESSAGE='Cuenta interna no encontrada.';
  END IF;

  DELETE FROM reparix.sessions WHERE user_id=p_user_id;

  RETURN QUERY
  INSERT INTO reparix.internal_user_deactivations AS h (user_id, actor_id)
  VALUES (p_user_id, p_actor_id)
  RETURNING h.actor_id, h.changed_at;
END;
$$;

REVOKE ALL ON FUNCTION reparix.deactivate_internal_user(uuid,uuid) FROM PUBLIC;
