-- Migration: Phân tích tuổi thiết bị với phân loại theo category
-- JOIN device_inventory.product_name = device_type_mapping.crm_name
--   để lấy order_name (GPS Tracker / MDVR / Camera / ...) làm device_category
--
-- Chạy trong Supabase SQL Editor (service_role).
-- Nếu đã tạo trước đó, CREATE OR REPLACE sẽ thay thế tự động.

-- ── Function 1: Tổng hợp theo category × destination ─────────────────────
-- Trả về ~15 rows (5 categories × 3 destinations)
CREATE OR REPLACE FUNCTION repair_age_by_dest_category()
RETURNS TABLE (
  device_category TEXT,
  destination     TEXT,
  unit_count      BIGINT,
  avg_days        NUMERIC,
  median_days     NUMERIC,
  p25_days        NUMERIC,
  p75_days        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(dtm.order_name, 'Khác')::TEXT AS device_category,
      ri.destination::TEXT                    AS destination,
      ROUND(
        EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::timestamptz)) / 86400
      ) AS age_days
    FROM repair_items ri
    JOIN device_inventory di ON di.device_code = ri.imei
    LEFT JOIN device_type_mapping dtm ON dtm.crm_name = di.product_name
    WHERE ri.imei IS NOT NULL AND ri.imei != ''
      AND di.imported_date IS NOT NULL
      AND ri.received_at IS NOT NULL
      AND ri.destination IN ('old_device', 'supplier', 'scrap')
  ),
  filtered AS (
    SELECT device_category, destination, age_days
    FROM base
    WHERE age_days BETWEEN 0 AND 3650
  )
  SELECT
    device_category,
    destination,
    COUNT(*)                                                         AS unit_count,
    ROUND(AVG(age_days))                                             AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days))    AS median_days,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY age_days))   AS p25_days,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY age_days))   AS p75_days
  FROM filtered
  GROUP BY device_category, destination
  ORDER BY device_category, destination
$$;

-- ── Function 2: Chi tiết theo product_name × destination (kèm category) ──
CREATE OR REPLACE FUNCTION repair_age_by_product()
RETURNS TABLE (
  device_category TEXT,
  product_name    TEXT,
  destination     TEXT,
  unit_count      BIGINT,
  avg_days        NUMERIC,
  median_days     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(dtm.order_name, 'Khác')::TEXT AS device_category,
      di.product_name,
      ri.destination::TEXT                    AS destination,
      ROUND(
        EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::timestamptz)) / 86400
      ) AS age_days
    FROM repair_items ri
    JOIN device_inventory di ON di.device_code = ri.imei
    LEFT JOIN device_type_mapping dtm ON dtm.crm_name = di.product_name
    WHERE ri.imei IS NOT NULL AND ri.imei != ''
      AND di.imported_date IS NOT NULL
      AND ri.received_at IS NOT NULL
      AND ri.destination IN ('old_device', 'supplier', 'scrap')
  ),
  filtered AS (
    SELECT device_category, product_name, destination, age_days
    FROM base
    WHERE age_days BETWEEN 0 AND 3650
  )
  SELECT
    device_category,
    product_name,
    destination,
    COUNT(*)                                                         AS unit_count,
    ROUND(AVG(age_days))                                             AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days))    AS median_days
  FROM filtered
  GROUP BY device_category, product_name, destination
  HAVING COUNT(*) >= 3
  ORDER BY device_category, product_name, destination
$$;

-- ── Function 3: Phân bố nhóm tuổi theo category ──────────────────────────
CREATE OR REPLACE FUNCTION repair_age_distribution()
RETURNS TABLE (
  device_category TEXT,
  bucket_label    TEXT,
  bucket_order    INT,
  total_count     BIGINT,
  old_device      BIGINT,
  supplier        BIGINT,
  scrap           BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(dtm.order_name, 'Khác')::TEXT AS device_category,
      ri.destination::TEXT AS destination,
      ROUND(
        EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::timestamptz)) / 86400
      ) AS age_days
    FROM repair_items ri
    JOIN device_inventory di ON di.device_code = ri.imei
    LEFT JOIN device_type_mapping dtm ON dtm.crm_name = di.product_name
    WHERE ri.imei IS NOT NULL AND ri.imei != ''
      AND di.imported_date IS NOT NULL
      AND ri.received_at IS NOT NULL
      AND ri.destination IN ('old_device', 'supplier', 'scrap')
  ),
  classified AS (
    SELECT
      device_category,
      destination,
      CASE
        WHEN age_days <  180  THEN '< 6 tháng'
        WHEN age_days <  365  THEN '6-12 tháng'
        WHEN age_days <  730  THEN '1-2 năm'
        WHEN age_days <  1095 THEN '2-3 năm'
        ELSE '> 3 năm'
      END AS bucket_label,
      CASE
        WHEN age_days <  180  THEN 1
        WHEN age_days <  365  THEN 2
        WHEN age_days <  730  THEN 3
        WHEN age_days <  1095 THEN 4
        ELSE 5
      END AS bucket_ord
    FROM base
    WHERE age_days BETWEEN 0 AND 3650
  )
  SELECT
    device_category,
    bucket_label,
    bucket_ord                                                       AS bucket_order,
    COUNT(*)                                                         AS total_count,
    COUNT(*) FILTER (WHERE destination = 'old_device')              AS old_device,
    COUNT(*) FILTER (WHERE destination = 'supplier')                AS supplier,
    COUNT(*) FILTER (WHERE destination = 'scrap')                   AS scrap
  FROM classified
  GROUP BY device_category, bucket_label, bucket_ord
  ORDER BY device_category, bucket_ord
$$;

-- ── Function 4: Tổng số bản ghi khớp ──────────────────────────────────────
CREATE OR REPLACE FUNCTION repair_age_total_matched()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM repair_items ri
  JOIN device_inventory di ON di.device_code = ri.imei
  WHERE ri.imei IS NOT NULL AND ri.imei != ''
    AND di.imported_date IS NOT NULL
    AND ri.received_at IS NOT NULL
    AND ri.destination IN ('old_device', 'supplier', 'scrap')
$$;

-- Grant
GRANT EXECUTE ON FUNCTION repair_age_by_dest_category() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION repair_age_by_product()        TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION repair_age_distribution()      TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION repair_age_total_matched()     TO service_role, authenticated;

-- Dọn function cũ nếu có
DROP FUNCTION IF EXISTS repair_age_by_destination();
DROP FUNCTION IF EXISTS repair_age_analysis();

-- Test:
-- SELECT * FROM repair_age_by_dest_category();
-- SELECT * FROM repair_age_by_product() LIMIT 20;
-- SELECT * FROM repair_age_distribution();
-- SELECT repair_age_total_matched();
