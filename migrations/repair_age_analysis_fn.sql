-- Migration: Tạo function phân tích tuổi thiết bị
-- Join repair_items.imei với device_inventory.device_code để tính tuổi thiết bị
-- khi được đưa vào sửa chữa/RMA/báo phế.
--
-- Chạy trong Supabase SQL Editor (service_role).

-- Function 1: Tổng hợp theo destination (avg, median, p25, p75)
CREATE OR REPLACE FUNCTION repair_age_by_destination()
RETURNS TABLE (
  destination   TEXT,
  unit_count    BIGINT,
  avg_days      NUMERIC,
  median_days   NUMERIC,
  p25_days      NUMERIC,
  p75_days      NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ri.destination::TEXT AS destination,
      ROUND(
        EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::timestamptz)) / 86400
      ) AS age_days
    FROM repair_items ri
    JOIN device_inventory di ON di.device_code = ri.imei
    WHERE ri.imei IS NOT NULL AND ri.imei != ''
      AND di.imported_date IS NOT NULL
      AND ri.received_at IS NOT NULL
      AND ri.destination IN ('old_device', 'supplier', 'scrap')
  ),
  filtered AS (
    SELECT destination, age_days
    FROM base
    WHERE age_days BETWEEN 0 AND 3650
  )
  SELECT
    destination,
    COUNT(*)                                                         AS unit_count,
    ROUND(AVG(age_days))                                             AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days))    AS median_days,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY age_days))   AS p25_days,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY age_days))   AS p75_days
  FROM filtered
  GROUP BY destination
  ORDER BY avg_days
$$;

-- Function 2: Chi tiết theo product_name × destination
CREATE OR REPLACE FUNCTION repair_age_by_product()
RETURNS TABLE (
  product_name  TEXT,
  destination   TEXT,
  unit_count    BIGINT,
  avg_days      NUMERIC,
  median_days   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      di.product_name,
      ri.destination::TEXT AS destination,
      ROUND(
        EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::timestamptz)) / 86400
      ) AS age_days
    FROM repair_items ri
    JOIN device_inventory di ON di.device_code = ri.imei
    WHERE ri.imei IS NOT NULL AND ri.imei != ''
      AND di.imported_date IS NOT NULL
      AND ri.received_at IS NOT NULL
      AND ri.destination IN ('old_device', 'supplier', 'scrap')
  ),
  filtered AS (
    SELECT product_name, destination, age_days
    FROM base
    WHERE age_days BETWEEN 0 AND 3650
  )
  SELECT
    product_name,
    destination,
    COUNT(*)                                                         AS unit_count,
    ROUND(AVG(age_days))                                             AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days))    AS median_days
  FROM filtered
  GROUP BY product_name, destination
  HAVING COUNT(*) >= 5
  ORDER BY product_name, avg_days
$$;

-- Function 3: Phân bố theo nhóm tuổi
CREATE OR REPLACE FUNCTION repair_age_distribution()
RETURNS TABLE (
  bucket_label  TEXT,
  total_count   BIGINT,
  old_device    BIGINT,
  supplier      BIGINT,
  scrap         BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ri.destination::TEXT AS destination,
      ROUND(
        EXTRACT(EPOCH FROM (ri.received_at::timestamptz - di.imported_date::timestamptz)) / 86400
      ) AS age_days
    FROM repair_items ri
    JOIN device_inventory di ON di.device_code = ri.imei
    WHERE ri.imei IS NOT NULL AND ri.imei != ''
      AND di.imported_date IS NOT NULL
      AND ri.received_at IS NOT NULL
      AND ri.destination IN ('old_device', 'supplier', 'scrap')
  ),
  filtered AS (
    SELECT destination, age_days,
      CASE
        WHEN age_days <  180  THEN '< 6 tháng'
        WHEN age_days <  365  THEN '6-12 tháng'
        WHEN age_days <  730  THEN '1-2 năm'
        WHEN age_days <  1095 THEN '2-3 năm'
        ELSE '> 3 năm'
      END AS bucket,
      CASE
        WHEN age_days <  180  THEN 1
        WHEN age_days <  365  THEN 2
        WHEN age_days <  730  THEN 3
        WHEN age_days <  1095 THEN 4
        ELSE 5
      END AS bucket_order
    FROM base
    WHERE age_days BETWEEN 0 AND 3650
  )
  SELECT
    bucket                                                         AS bucket_label,
    COUNT(*)                                                       AS total_count,
    COUNT(*) FILTER (WHERE destination = 'old_device')            AS old_device,
    COUNT(*) FILTER (WHERE destination = 'supplier')              AS supplier,
    COUNT(*) FILTER (WHERE destination = 'scrap')                 AS scrap
  FROM filtered
  GROUP BY bucket, bucket_order
  ORDER BY bucket_order
$$;

-- Tổng số bản ghi khớp
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
GRANT EXECUTE ON FUNCTION repair_age_by_destination()  TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION repair_age_by_product()      TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION repair_age_distribution()    TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION repair_age_total_matched()   TO service_role, authenticated;

-- Test:
-- SELECT * FROM repair_age_by_destination();
-- SELECT * FROM repair_age_by_product() LIMIT 20;
-- SELECT * FROM repair_age_distribution();
-- SELECT repair_age_total_matched();
