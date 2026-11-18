SET search_path TO reparix;
ALTER TABLE order_assignments ADD CONSTRAINT assignment_order_author_key UNIQUE(id,order_id,technician_id);
CREATE TABLE order_assessments (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders ON DELETE RESTRICT,
 assignment_id uuid NOT NULL,
 author_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0),
 diagnosis varchar(4000) NOT NULL CHECK(length(trim(diagnosis))>=5),
 proposed_work varchar(4000) NOT NULL CHECK(length(trim(proposed_work))>=5),
 amount numeric(12,2) NOT NULL CHECK(amount>0 AND amount<=9999999999.99),
 currency text NOT NULL CHECK(currency='MXN'),
 note varchar(500) NOT NULL CHECK(length(trim(note))>=3),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(assignment_id,order_id,author_id) REFERENCES order_assignments(id,order_id,technician_id) ON DELETE RESTRICT,
 UNIQUE(order_id,revision)
);
