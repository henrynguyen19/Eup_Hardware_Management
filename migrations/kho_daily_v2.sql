-- Add device-detail columns (safe to run on existing table)
ALTER TABLE kho_daily_records
  ADD COLUMN IF NOT EXISTS thanh_pham_devices JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hang_gui_vp_devices JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS xuat_kho_devices JSONB DEFAULT '[]'::jsonb;
