-- Second Key policy v2 (ADR-0019): evidence is optional. A payer may share the conversation after a
-- payment was paused (a second opinion), and may say a finding is wrong. Neither can unpause a payment:
-- shared context is analysed into 'CONTEXT' checks that can only add concerns; feedback is a note the
-- reviewer and the Desk see.
ALTER TABLE checks DROP CONSTRAINT IF EXISTS checks_phase_check;
ALTER TABLE checks ADD CONSTRAINT checks_phase_check CHECK (phase IN ('SCREEN', 'VERIFY', 'RECHECK', 'CONTEXT'));

CREATE TABLE shared_context (
  purchase_id   text PRIMARY KEY REFERENCES purchases(id),
  conversation  jsonb NOT NULL,
  shared_by     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence_feedback (
  id           bigserial PRIMARY KEY,
  purchase_id  text NOT NULL REFERENCES purchases(id),
  quote        text NOT NULL,
  note         text NOT NULL,
  given_by     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_feedback_purchase ON evidence_feedback (purchase_id);
