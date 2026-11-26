CREATE TABLE reparix.internal_user_role_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES reparix.internal_users(id),
  previous_role text NOT NULL,
  new_role text NOT NULL,
  actor_id uuid NOT NULL REFERENCES reparix.internal_users(id),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX internal_user_role_changes_history_idx
  ON reparix.internal_user_role_changes(user_id, changed_at, id);

CREATE FUNCTION reparix.change_internal_user_role(p_user_id uuid, p_new_role text, p_actor_id uuid)
RETURNS TABLE (previous_role text, new_role text, actor_id uuid, changed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  old_role text;
  assigned_role reparix.internal_users.role%TYPE;
BEGIN
  -- Lock both accounts in a stable order before checking the actor's current role.
  PERFORM u.id FROM reparix.internal_users u
  WHERE u.id IN (p_user_id, p_actor_id)
  ORDER BY u.id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM reparix.internal_users u
    WHERE u.id=p_actor_id AND u.active AND u.role='administrador'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Solo administración puede gestionar los roles de acceso.';
  END IF;

  IF p_new_role IS NULL OR p_new_role NOT IN ('recepcion', 'tecnico', 'administrador') THEN
    RAISE EXCEPTION USING ERRCODE='P5001', MESSAGE='Selecciona un rol válido para la cuenta interna.';
  END IF;

  SELECT u.role::text INTO old_role FROM reparix.internal_users u WHERE u.id=p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5002', MESSAGE='Cuenta interna no encontrada.';
  END IF;
  IF old_role=p_new_role THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='La cuenta ya tiene el rol indicado.';
  END IF;

  assigned_role := p_new_role;
  UPDATE reparix.internal_users SET role=assigned_role WHERE id=p_user_id;

  RETURN QUERY
  INSERT INTO reparix.internal_user_role_changes AS h (user_id, previous_role, new_role, actor_id)
  VALUES (p_user_id, old_role, p_new_role, p_actor_id)
  RETURNING h.previous_role, h.new_role, h.actor_id, h.changed_at;
END;
$$;

REVOKE ALL ON FUNCTION reparix.change_internal_user_role(uuid,text,uuid) FROM PUBLIC;
