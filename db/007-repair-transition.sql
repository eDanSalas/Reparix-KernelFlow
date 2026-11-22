SET search_path TO reparix;

ALTER TABLE orders DROP CONSTRAINT orders_state_check;
ALTER TABLE orders ADD CONSTRAINT orders_state_check
 CHECK(state IN ('Recibido','En diagnóstico','Pendiente de autorización','En reparación'));

CREATE FUNCTION has_budget_authorization(p_order uuid,p_assessment uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,reparix AS $$
 SELECT EXISTS (
  SELECT 1 FROM reparix.budget_acceptances b
  WHERE b.order_id=p_order AND b.assessment_id=p_assessment
    AND NOT EXISTS (
     SELECT 1 FROM reparix.order_history h
     WHERE h.order_id=b.order_id AND h.field='rechazo_presupuesto'
       AND h.new_value=b.assessment_id::text AND h.changed_at>=b.recorded_at
    )
 );
$$;
REVOKE ALL ON FUNCTION has_budget_authorization(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION transition_order(p_folio text,p_actor uuid,p_version integer,p_state text,p_note text,p_request uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,reparix AS $$
DECLARE
 o reparix.orders%ROWTYPE;
 actor_role text;
 a reparix.order_assignments%ROWTYPE;
 assessment_id uuid;
 assessment_assignment uuid;
 changed timestamptz;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('En diagnóstico','Pendiente de autorización','En reparación') OR p_version IS NULL OR p_version<1 OR p_version>=2147483647 OR p_note IS NULL OR length(trim(p_note))<3 OR length(p_note)>500 OR p_note ~ '[[:cntrl:]]' OR p_request IS NULL THEN
  RAISE EXCEPTION 'Datos de transición no válidos.' USING ERRCODE='P5001';
 END IF;
 SELECT * INTO o FROM reparix.orders WHERE folio=p_folio FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE='P5002'; END IF;
 SELECT role INTO actor_role FROM reparix.internal_users WHERE id=p_actor AND active FOR SHARE;
 IF NOT FOUND OR actor_role NOT IN ('recepcion','administrador','tecnico') THEN RAISE EXCEPTION 'Se requiere una cuenta activa autorizada.' USING ERRCODE='P5003'; END IF;
 SELECT * INTO a FROM reparix.order_assignments WHERE order_id=o.id AND ended_at IS NULL;
 IF actor_role='tecnico' AND (a.id IS NULL OR a.technician_id<>p_actor) THEN RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE='P5002'; END IF;
 IF o.version_lock<>p_version THEN RAISE EXCEPTION 'La orden cambió. Consulta el estado y confirma de nuevo.' USING ERRCODE='P5004',DETAIL=o.version_lock::text; END IF;
 IF NOT ((o.state='Recibido' AND p_state='En diagnóstico')
      OR (o.state='En diagnóstico' AND p_state='Pendiente de autorización')
      OR (o.state='Pendiente de autorización' AND p_state='En reparación')) THEN
  RAISE EXCEPTION 'Transición no permitida desde el estado vigente.' USING ERRCODE='P5004';
 END IF;
 IF p_state='En reparación' AND actor_role<>'administrador' THEN
  RAISE EXCEPTION 'Tu rol no permite iniciar la reparación.' USING ERRCODE='P5003';
 END IF;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Asigna un técnico activo antes de cambiar el estado.' USING ERRCODE='P5004'; END IF;
 PERFORM 1 FROM reparix.internal_users WHERE id=a.technician_id AND active AND role='tecnico' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'La asignación requiere un técnico activo autorizado.' USING ERRCODE='P5004'; END IF;
 IF p_state IN ('Pendiente de autorización','En reparación') THEN
  SELECT id,assignment_id INTO assessment_id,assessment_assignment
  FROM reparix.order_assessments WHERE order_id=o.id ORDER BY revision DESC LIMIT 1;
  IF assessment_assignment IS NULL OR assessment_assignment<>a.id THEN
   RAISE EXCEPTION 'Registra diagnóstico y presupuesto vigentes para la asignación actual.' USING ERRCODE='P5004';
  END IF;
 END IF;
 IF p_state='En reparación' AND NOT reparix.has_budget_authorization(o.id,assessment_id) THEN
  RAISE EXCEPTION 'Se requiere la autorización del presupuesto vigente para iniciar la reparación.' USING ERRCODE='P5004';
 END IF;
 changed:=clock_timestamp();
 UPDATE reparix.orders SET state=p_state,version_lock=version_lock+1,state_changed_at=changed,state_changed_by=p_actor WHERE id=o.id;
 INSERT INTO reparix.order_history(id,order_id,actor_id,changed_at,field,previous_value,new_value,note,request_id)
 VALUES(gen_random_uuid(),o.id,p_actor,changed,'estado',o.state,p_state,trim(p_note),p_request);
 RETURN o.id;
END $$;
