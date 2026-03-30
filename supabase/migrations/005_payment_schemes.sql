-- Add payment_schemes column to agents table
-- Stores x402 and MPP payment scheme configurations as JSONB array

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS payment_schemes JSONB NOT NULL DEFAULT '[]';
