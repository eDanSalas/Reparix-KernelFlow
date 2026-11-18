SET search_path TO reparix;
CREATE FUNCTION enforce_initial_order_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,reparix AS $$
BEGIN
 IF NEW.state<>'Recibido' OR NEW.version_lock<>1 OR NEW.state_changed_at IS NOT NULL OR NEW.state_changed_by IS NOT NULL THEN
  RAISE EXCEPTION 'Toda alta comienza en Recibido sin metadatos de transición.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER initial_order_state BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION enforce_initial_order_state();
REVOKE ALL ON FUNCTION enforce_initial_order_state() FROM PUBLIC;
