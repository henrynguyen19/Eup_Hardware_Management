-- Migration: status tracking + da_nhap status
-- Run after migrate-combo-recipient.sql

ALTER TABLE giao_hang_don_hang
  ADD COLUMN IF NOT EXISTS status_updated_by  TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at  TIMESTAMPTZ;

-- Backfill existing rows
UPDATE giao_hang_don_hang
SET status_updated_at = updated_at
WHERE status_updated_at IS NULL;
