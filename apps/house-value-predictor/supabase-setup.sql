-- ── House Value Predictor — Supabase Setup ────────────────────────────────────
-- Run this in the Supabase SQL Editor for your permit-suite project.
-- This creates the app_data schema (shared with future apps) and the
-- property_lookups table for caching address lookups.

-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS app_data;

-- Property lookups cache
-- Stores every address that has been looked up, the last known sale price,
-- and who looked it up (email if logged in, 'anonymous' otherwise).
CREATE TABLE IF NOT EXISTS app_data.property_lookups (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  address_key      text NOT NULL,          -- normalized lowercase for dedup
  address_display  text NOT NULL,          -- original display format
  last_sale_price  numeric,
  last_sale_month  text,                   -- 3-letter e.g. "Jan"
  last_sale_year   integer,
  sale_source      text,                   -- "Zillow", "Redfin", "web search" etc.
  looked_up_by     text DEFAULT 'anonymous', -- user email or 'anonymous'
  looked_up_at     timestamptz DEFAULT now(),
  UNIQUE (address_key)                     -- one cached row per address
);

-- Index for fast address lookups
CREATE INDEX IF NOT EXISTS idx_property_lookups_address
  ON app_data.property_lookups (address_key);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_property_lookups_user
  ON app_data.property_lookups (looked_up_by);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE app_data.property_lookups ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anonymous) to read cached lookups
CREATE POLICY "Anyone can read property lookups"
  ON app_data.property_lookups FOR SELECT
  USING (true);

-- Allow anyone to insert new lookups (anon key used from browser)
CREATE POLICY "Anyone can insert property lookups"
  ON app_data.property_lookups FOR INSERT
  WITH CHECK (true);

-- Allow upsert (merge-duplicates via Prefer header)
CREATE POLICY "Anyone can update property lookups"
  ON app_data.property_lookups FOR UPDATE
  USING (true);

-- ── Verify ────────────────────────────────────────────────────────────────────
-- After running, check the table exists:
-- SELECT * FROM app_data.property_lookups LIMIT 5;
