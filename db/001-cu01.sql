CREATE SCHEMA IF NOT EXISTS reparix;
SET search_path TO reparix;
CREATE TABLE internal_users (
 id uuid PRIMARY KEY, username varchar(80) UNIQUE NOT NULL,
 display_name varchar(120) NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('recepcion','tecnico','administrador')),
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE clients (
 id uuid PRIMARY KEY, name varchar(120) NOT NULL CHECK(length(trim(name))>=2),
 phone varchar(30) NOT NULL, email varchar(254)
);
CREATE TABLE devices (
 id uuid PRIMARY KEY, type varchar(80) NOT NULL, brand varchar(80) NOT NULL,
 model varchar(120) NOT NULL, serial_number varchar(120), serial_unavailable_reason varchar(200),
 CHECK ((serial_number IS NOT NULL AND serial_unavailable_reason IS NULL) OR
        (serial_number IS NULL AND serial_unavailable_reason IS NOT NULL))
);
CREATE SEQUENCE order_folio_seq AS bigint NO CYCLE MAXVALUE 999999999999;
CREATE TABLE orders (
 id uuid PRIMARY KEY,
 folio text UNIQUE NOT NULL DEFAULT ('RPX-' || lpad(nextval('reparix.order_folio_seq')::text,12,'0')),
 client_id uuid NOT NULL REFERENCES clients ON DELETE RESTRICT,
 device_id uuid NOT NULL REFERENCES devices ON DELETE RESTRICT,
 reported_fault varchar(2000) NOT NULL, physical_condition varchar(2000) NOT NULL,
 accessories_confirmed boolean NOT NULL CHECK(accessories_confirmed),
 physical_check_confirmed boolean NOT NULL CHECK(physical_check_confirmed),
 state text NOT NULL DEFAULT 'Recibido' CHECK(state='Recibido'),
 received_at timestamptz NOT NULL DEFAULT now(), version_lock integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT
);
CREATE TABLE received_accessories (
 order_id uuid NOT NULL REFERENCES orders ON DELETE RESTRICT,
 position integer NOT NULL CHECK(position>=0), description varchar(120) NOT NULL,
 PRIMARY KEY(order_id,position)
);
CREATE TABLE order_history (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 changed_at timestamptz NOT NULL DEFAULT now(), field text NOT NULL,
 previous_value text, new_value text NOT NULL, note text NOT NULL, request_id uuid NOT NULL
);
CREATE TABLE order_requests (
 user_id uuid NOT NULL REFERENCES internal_users ON DELETE RESTRICT,
 request_key uuid NOT NULL, request_hash text NOT NULL,
 order_id uuid UNIQUE NOT NULL REFERENCES orders ON DELETE RESTRICT,
 PRIMARY KEY(user_id,request_key)
);
CREATE INDEX history_order_idx ON order_history(order_id,changed_at);