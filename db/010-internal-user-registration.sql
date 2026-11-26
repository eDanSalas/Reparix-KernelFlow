CREATE FUNCTION reparix.register_internal_user(
  p_id uuid, p_username text, p_name text, p_password_hash text, p_role text, p_actor_id uuid
)
RETURNS TABLE (id uuid, username text, name text, role text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  assigned_role reparix.internal_users.role%TYPE;
BEGIN
  PERFORM u.id FROM reparix.internal_users u
  WHERE u.id=p_actor_id AND u.active AND u.role='administrador'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Solo administración puede registrar cuentas internas.';
  END IF;

  assigned_role := p_role;
  RETURN QUERY
  INSERT INTO reparix.internal_users AS u (id, username, display_name, password_hash, role)
  VALUES (p_id, p_username, p_name, p_password_hash, assigned_role)
  ON CONFLICT DO NOTHING
  RETURNING u.id, u.username::text, u.display_name::text, u.role::text, u.active;
END;
$$;

REVOKE ALL ON FUNCTION reparix.register_internal_user(uuid,text,text,text,text,uuid) FROM PUBLIC;
