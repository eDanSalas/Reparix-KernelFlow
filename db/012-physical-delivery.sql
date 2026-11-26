-- Extend the checks on the state column while retaining their existing conditions.
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
      'ALTER TABLE reparix.orders ADD CONSTRAINT %I CHECK ((%s) OR state IN (%L, %L))',
      state_check.conname, state_check.predicate, 'Listo para recoger', 'Entregado'
    );
  END LOOP;
END;
$$;

CREATE TABLE reparix.order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES reparix.orders(id),
  receptor varchar(120) NOT NULL CHECK (btrim(receptor) <> ''),
  evidencia varchar(500) NOT NULL CHECK (btrim(evidencia) <> ''),
  actor_id uuid NOT NULL REFERENCES reparix.internal_users(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL
);

CREATE FUNCTION reparix.require_order_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.state <> 'Listo para recoger' OR NOT EXISTS (
    SELECT 1 FROM reparix.order_deliveries d
    WHERE d.order_id=NEW.id AND d.actor_id=NEW.state_changed_by AND d.recorded_at=NEW.state_changed_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='El estado Entregado requiere una confirmación de entrega física.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER require_order_delivery
BEFORE UPDATE OF state ON reparix.orders
FOR EACH ROW WHEN (NEW.state = 'Entregado' AND OLD.state IS DISTINCT FROM NEW.state)
EXECUTE FUNCTION reparix.require_order_delivery();

CREATE FUNCTION reparix.confirm_order_delivery(
  p_folio text, p_actor_id uuid, p_expected_version integer, p_receptor text,
  p_evidencia text, p_key uuid, p_request_hash text, p_request_id uuid
)
RETURNS TABLE (id uuid, receptor text, evidencia text, actor_id uuid, recorded_at timestamptz, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  target_order reparix.orders%ROWTYPE;
  delivery reparix.order_deliveries%ROWTYPE;
BEGIN
  -- The order lock serializes retries with other confirmations and state changes.
  SELECT o.* INTO target_order FROM reparix.orders o WHERE o.folio=p_folio FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5002', MESSAGE='Orden no encontrada.';
  END IF;

  PERFORM u.id FROM reparix.internal_users u
  WHERE u.id=p_actor_id AND u.active AND u.role IN ('recepcion', 'administrador') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P5003', MESSAGE='Tu rol no permite confirmar entregas físicas.';
  END IF;

  SELECT d.* INTO delivery FROM reparix.order_deliveries d WHERE d.order_id=target_order.id;
  IF FOUND THEN
    IF delivery.actor_id=p_actor_id AND delivery.idempotency_key=p_key AND delivery.request_hash=p_request_hash THEN
      RETURN QUERY SELECT delivery.id, delivery.receptor::text, delivery.evidencia::text,
        delivery.actor_id, delivery.recorded_at, true;
      RETURN;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='La orden ya tiene una entrega confirmada.';
  END IF;

  IF target_order.version_lock IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='La orden cambió. Consulta su versión vigente.',
      DETAIL=target_order.version_lock::text;
  END IF;
  IF target_order.state <> 'Listo para recoger' THEN
    RAISE EXCEPTION USING ERRCODE='P5004', MESSAGE='Solo se puede entregar una orden en Listo para recoger.';
  END IF;

  INSERT INTO reparix.order_deliveries (order_id,receptor,evidencia,actor_id,idempotency_key,request_hash)
  VALUES (target_order.id,p_receptor,p_evidencia,p_actor_id,p_key,p_request_hash)
  RETURNING * INTO delivery;

  UPDATE reparix.orders o
  SET state='Entregado', version_lock=o.version_lock+1,
    state_changed_by=p_actor_id, state_changed_at=delivery.recorded_at
  WHERE o.id=target_order.id;

  INSERT INTO reparix.order_history(id,order_id,actor_id,changed_at,field,previous_value,new_value,note,request_id)
  VALUES (gen_random_uuid(),target_order.id,p_actor_id,delivery.recorded_at,'estado',target_order.state,
    'Entregado','Entrega física confirmada',p_request_id);

  RETURN QUERY SELECT delivery.id, delivery.receptor::text, delivery.evidencia::text,
    delivery.actor_id, delivery.recorded_at, false;
END;
$$;

REVOKE ALL ON FUNCTION reparix.confirm_order_delivery(text,uuid,integer,text,text,uuid,text,uuid) FROM PUBLIC;
