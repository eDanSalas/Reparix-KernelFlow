CREATE FUNCTION reparix.complete_order_repair(
  p_folio text, p_actor_id uuid, p_expected_version integer, p_note text, p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  target_order reparix.orders%ROWTYPE;
  actor_role text;
  completed_at timestamptz;
BEGIN
  IF p_expected_version IS NULL OR p_expected_version < 1 OR p_expected_version >= 2147483647
    OR p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 3 AND 500
    OR p_note ~ '[[:cntrl:]]' OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P5001', MESSAGE='Datos de finalización de reparación no válidos.';
  END IF;

  SELECT o.* INTO target_order FROM reparix.orders o WHERE o.folio=p_folio FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5002', MESSAGE='Orden no encontrada.';
  END IF;

  SELECT u.role INTO actor_role FROM reparix.internal_users u
  WHERE u.id=p_actor_id AND u.active FOR SHARE;
  IF NOT FOUND OR actor_role NOT IN ('tecnico', 'administrador') THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Tu rol no permite marcar la reparación como terminada.';
  END IF;
  IF actor_role='tecnico' AND NOT EXISTS (
    SELECT 1 FROM reparix.order_assignments a
    WHERE a.order_id=target_order.id AND a.technician_id=p_actor_id AND a.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P5002', MESSAGE='Orden no encontrada.';
  END IF;

  IF target_order.version_lock IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='La orden cambió. Consulta su versión vigente.',
      DETAIL=target_order.version_lock::text;
  END IF;
  IF target_order.state <> 'En reparación' THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='Solo una orden en reparación puede pasar a Listo para recoger.';
  END IF;

  completed_at := clock_timestamp();
  UPDATE reparix.orders o
  SET state='Listo para recoger', version_lock=o.version_lock+1,
    state_changed_by=p_actor_id, state_changed_at=completed_at
  WHERE o.id=target_order.id;

  INSERT INTO reparix.order_history(id,order_id,actor_id,changed_at,field,previous_value,new_value,note,request_id)
  VALUES (gen_random_uuid(),target_order.id,p_actor_id,completed_at,'estado',target_order.state,
    'Listo para recoger',btrim(p_note),p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION reparix.complete_order_repair(text,uuid,integer,text,uuid) FROM PUBLIC;
