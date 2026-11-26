CREATE TABLE reparix.internal_user_registrations (
  user_id uuid PRIMARY KEY REFERENCES reparix.internal_users(id),
  actor_id uuid NOT NULL REFERENCES reparix.internal_users(id),
  initial_role text NOT NULL CHECK (initial_role IN ('recepcion', 'tecnico', 'administrador')),
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION reparix.register_internal_user(
  p_id uuid, p_username text, p_name text, p_password_hash text, p_role text, p_actor_id uuid
)
RETURNS TABLE (id uuid, username text, name text, role text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM u.id FROM reparix.internal_users u
  WHERE u.id=p_actor_id AND u.active AND u.role='administrador'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Solo administración puede registrar cuentas internas.';
  END IF;

  RETURN QUERY
  WITH created AS (
    INSERT INTO reparix.internal_users AS u (id, username, display_name, password_hash, role)
    VALUES (p_id, p_username, p_name, p_password_hash, p_role)
    ON CONFLICT DO NOTHING
    RETURNING u.id, u.username, u.display_name, u.role, u.active
  ), recorded AS (
    INSERT INTO reparix.internal_user_registrations AS r (user_id, actor_id, initial_role)
    SELECT u.id, p_actor_id, u.role FROM created u
    RETURNING r.user_id
  )
  SELECT u.id, u.username::text, u.display_name::text, u.role, u.active
  FROM created u JOIN recorded r ON r.user_id=u.id;
END;
$$;
