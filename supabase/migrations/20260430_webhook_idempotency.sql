-- Track processed webhooks to prevent replay attacks
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_txn ON processed_webhooks(transaction_id);

-- RLS: only service_role can access
ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
