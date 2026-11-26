CREATE FUNCTION reparix.require_repair_authorization() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_assessment uuid;
BEGIN
  IF OLD.state <> 'Pendiente de autorización' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Solo se puede iniciar una reparación desde Pendiente de autorización.';
  END IF;

  SELECT latest.id INTO current_assessment
  FROM (
    SELECT a.id, a.assignment_id
    FROM reparix.order_assessments a
    WHERE a.order_id=OLD.id
    ORDER BY a.revision DESC
    LIMIT 1
  ) latest
  JOIN reparix.order_assignments assignment ON assignment.id=latest.assignment_id
  WHERE assignment.ended_at IS NULL;

  IF current_assessment IS NULL OR NOT reparix.has_budget_authorization(OLD.id, current_assessment) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Se requiere la autorización del presupuesto vigente para iniciar la reparación.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER require_repair_authorization
BEFORE UPDATE OF state ON reparix.orders
FOR EACH ROW WHEN (NEW.state = 'En reparación' AND OLD.state IS DISTINCT FROM NEW.state)
EXECUTE FUNCTION reparix.require_repair_authorization();

REVOKE ALL ON FUNCTION reparix.require_repair_authorization() FROM PUBLIC;
