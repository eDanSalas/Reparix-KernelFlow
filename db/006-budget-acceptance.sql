SET search_path TO reparix;

ALTER TABLE order_assessments ADD CONSTRAINT assessment_order_key UNIQUE (order_id, id);

CREATE TABLE budget_communications (
 order_id uuid NOT NULL,
 assessment_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 communicated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (order_id, assessment_id),
 FOREIGN KEY (order_id, assessment_id) REFERENCES order_assessments (order_id, id) ON DELETE RESTRICT
);

CREATE TABLE budget_acceptances (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL,
 assessment_id uuid NOT NULL,
 channel varchar(80) NOT NULL CHECK (channel ~ '[^[:space:]]'),
 evidence varchar(2000) NOT NULL CHECK (evidence ~ '[^[:space:]]'),
 responsible varchar(120) NOT NULL CHECK (responsible ~ '[^[:space:]]'),
 actor_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 recorded_at timestamptz NOT NULL,
 UNIQUE (order_id, assessment_id),
 FOREIGN KEY (order_id, assessment_id) REFERENCES budget_communications (order_id, assessment_id) ON DELETE RESTRICT
);
