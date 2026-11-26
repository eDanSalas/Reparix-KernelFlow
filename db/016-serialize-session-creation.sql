CREATE FUNCTION reparix.start_internal_user_session(
  p_user_id uuid, p_password_hash text, p_token_hash text, p_csrf_token text
)
RETURNS TABLE (name text, username text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  account reparix.internal_users%ROWTYPE;
BEGIN
  -- Deactivation takes an exclusive lock on the same account before deleting sessions.
  SELECT u.* INTO account FROM reparix.internal_users u
  WHERE u.id=p_user_id AND u.active AND u.password_hash=p_password_hash
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO reparix.sessions(token_hash,user_id,csrf_token,expires_at)
  VALUES(p_token_hash,account.id,p_csrf_token,now()+interval '8 hours');

  RETURN QUERY SELECT account.display_name::text,account.username::text,account.role;
END;
$$;

REVOKE ALL ON FUNCTION reparix.start_internal_user_session(uuid,text,text,text) FROM PUBLIC;
