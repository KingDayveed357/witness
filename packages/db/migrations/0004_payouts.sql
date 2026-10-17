-- Second Key: pay the recipient after a verified capture (executor only). One payout per purchase
-- (primary key), a deterministic sender_batch_id and PayPal-Request-Id, so a retry can never pay twice.
-- The purchase stays CAPTURED; the payout has its own lifecycle here, read back from PayPal.
CREATE TABLE payouts (
  purchase_id      text PRIMARY KEY REFERENCES purchases(id),
  tenant_id        text NOT NULL,
  receiver         text NOT NULL,              -- the recipient email the payer confirmed in the intent
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  currency         text NOT NULL,
  sender_batch_id  text NOT NULL UNIQUE,
  request_id       text NOT NULL,
  batch_id         text,                       -- PayPal payout_batch_id
  item_id          text,                       -- PayPal payout_item_id
  status           text NOT NULL CHECK (status IN ('SENDING', 'UNKNOWN', 'PENDING', 'SUCCESS', 'UNCLAIMED', 'ONHOLD', 'FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'DENIED')),
  checks           integer NOT NULL DEFAULT 0,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paypal_calls DROP CONSTRAINT IF EXISTS paypal_calls_op_check;
ALTER TABLE paypal_calls ADD CONSTRAINT paypal_calls_op_check CHECK (op IN ('create-order', 'capture', 'void', 'payout'));
