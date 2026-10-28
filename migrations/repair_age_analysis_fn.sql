-- Migration: Tạo function phân tích tuổi thiết bị
-- Join repair_items.imei với device_inventory.device_code để tính tuổi thiết bị
-- khi được đưa vào sửa chữa/RMA/báo phế.
--
-- Chạy trong Supabase SQL Editor (service_role).

CREATE OR REPLACE FUNCTION repair_age_analysis()
RETURNS TABLE (
  destination     TEXT,
  product_name    TEXT,
  age_days        INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ri.destination::TEXT,
    di.product_name,
    ROUND(
      EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::date::timestamptz)) / 86400
    )::INTEGER AS age_days
  FROM repair_items ri
  JOIN device_inventory di ON di.device_code = ri.imei
  WHERE ri.imei IS NOT NULL
    AND ri.imei != ''
    AND di.imported_date IS NOT NULL
    AND ri.received_at IS NOT NULL
    AND ri.destination IN ('old_device', 'supplier', 'scrap')
    AND ROUND(
          EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::date::timestamptz)) / 86400
        ) BETWEEN 0 AND 3650
$$;

-- Grant quyền truy cập
GRANT EXECUTE ON FUNCTION repair_age_analysis() TO service_role;
GRANT EXECUTE ON FUNCTION repair_age_analysis() TO authenticated;

-- Test: SELECT destination, product_name, age_days FROM repair_age_analysis() LIMIT 10;
