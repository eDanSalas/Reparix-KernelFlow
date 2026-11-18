SET search_path TO reparix;
CREATE TABLE order_assignments (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders ON DELETE RESTRICT,
 technician_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 assigned_by uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ended_by uuid REFERENCES internal_users ON DELETE RESTRICT,
 ended_at timestamptz,
 CHECK ((ended_at IS NULL AND ended_by IS NULL) OR
        (ended_at IS NOT NULL AND ended_by IS NOT NULL AND ended_at>=assigned_at))
);
CREATE UNIQUE INDEX one_current_assignment ON order_assignments(order_id) WHERE ended_at IS NULL;
CREATE INDEX assignments_technician_current ON order_assignments(technician_id,order_id) WHERE ended_at IS NULL;

-- Row locking normally requires UPDATE permission on internal_users.
-- Expose only this fixed, read-only lock operation, never account modification.
CREATE FUNCTION lock_active_technician(candidate uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,reparix AS $$
BEGIN
 PERFORM 1 FROM reparix.internal_users WHERE id=candidate AND active AND role='tecnico' FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION lock_active_technician(uuid) FROM PUBLIC;
