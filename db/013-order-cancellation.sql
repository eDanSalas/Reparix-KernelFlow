-- Allow cancellation while preserving the existing checks on order states.
DO $$
DECLARE
  state_check record;
BEGIN
  FOR state_check IN
    SELECT c.conname, pg_get_expr(c.conbin,c.conrelid) AS predicate
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='state'
    WHERE c.conrelid='reparix.orders'::regclass AND c.contype='c' AND c.conkey=ARRAY[a.attnum]
  LOOP
    EXECUTE format('ALTER TABLE reparix.orders DROP CONSTRAINT %I', state_check.conname);
    EXECUTE format(
      'ALTER TABLE reparix.orders ADD CONSTRAINT %I CHECK ((%s) OR state = %L)',
      state_check.conname, state_check.predicate, 'Cancelado'
    );
  END LOOP;
END;
$$;

CREATE FUNCTION reparix.cancel_order(
  p_folio text, p_actor_id uuid, p_expected_version integer, p_reason text, p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  target_order reparix.orders%ROWTYPE;
  changed_at timestamptz;
BEGIN
  SELECT o.* INTO target_order FROM reparix.orders o WHERE o.folio=p_folio FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5002', MESSAGE='Orden no encontrada.';
  END IF;

  PERFORM u.id FROM reparix.internal_users u
  WHERE u.id=p_actor_id AND u.active AND u.role IN ('recepcion', 'administrador') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Tu rol no permite cancelar órdenes.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 500 OR p_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE='P5001', MESSAGE='Captura un motivo de cancelación válido de hasta 500 caracteres.';
  END IF;
  IF target_order.state <> 'En diagnóstico' THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='Solo se puede cancelar una orden en En diagnóstico.';
  END IF;
  IF target_order.version_lock IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='La orden cambió. Consulta su versión vigente.',
      DETAIL=target_order.version_lock::text;
  END IF;

  changed_at := clock_timestamp();
  UPDATE reparix.orders o
  SET state='Cancelado', version_lock=o.version_lock+1,
    state_changed_by=p_actor_id, state_changed_at=changed_at
  WHERE o.id=target_order.id;

  INSERT INTO reparix.order_history(id,order_id,actor_id,changed_at,field,previous_value,new_value,note,request_id)
  VALUES (gen_random_uuid(),target_order.id,p_actor_id,changed_at,'estado',target_order.state,
    'Cancelado',p_reason,p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION reparix.cancel_order(text,uuid,integer,text,uuid) FROM PUBLIC;
