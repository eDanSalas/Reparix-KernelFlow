CREATE TABLE reparix.budget_rejection_channels (
  history_id uuid PRIMARY KEY REFERENCES reparix.order_history(id),
  channel varchar(80) NOT NULL
);
