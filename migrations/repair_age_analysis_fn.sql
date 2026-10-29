-- Migration: Phân tích tuổi thiết bị với phân loại theo category
-- Lưu ý: imported_date từ CRM (Device_Date) có thể trễ hơn ngày sửa thực tế
--   → một số thiết bị có age_days âm (được nhập CRM sau khi đã sửa)
--   → chúng ta vẫn ĐẾM những record này, nhưng dùng GREATEST(0, age_days)
--     để tính trung bình (không để âm kéo xuống)
--
-- Chạy trong Supabase SQL Editor (service_role).
-- DROP trước nếu bị lỗi "cannot change return type":
--   DROP FUNCTION IF EXISTS repair_age_by_dest_category();
--   DROP FUNCTION IF EXISTS repair_age_by_product();
--   DROP FUNCTION IF EXISTS repair_age_distribution();
--   DROP FUNCTION IF EXISTS repair_age_total_matched();

-- ── Function 1: Tổng hợp theo product_name × destination ─────────────────
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
      COALESCE(di.product_name, 'Unknown')::TEXT AS device_category,
      ri.destination::TEXT                        AS destination,
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
  -- Loại bỏ chỉ các outlier > 10 năm (thiết bị không hợp lệ)
  -- Vẫn GIỮ age_days âm (nhập CRM sau khi sửa) — tính như 0 trong avg
  filtered AS (
    SELECT device_category, destination, age_days,
           GREATEST(0, age_days) AS age_clamped
    FROM base
    WHERE age_days <= 3650
  )
  SELECT
    device_category,
    destination,
    COUNT(*)                                                                  AS unit_count,
    ROUND(AVG(age_clamped))                                                   AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_clamped))          AS median_days,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY age_clamped))         AS p25_days,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY age_clamped))         AS p75_days
  FROM filtered
  GROUP BY device_category, destination
  HAVING COUNT(*) >= 3
  ORDER BY device_category, destination
$$;

-- ── Function 2: Chi tiết theo product_name × destination ──────────────────
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
      COALESCE(di.product_name, 'Unknown')::TEXT AS pname,
      ri.destination::TEXT                        AS destination,
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
    SELECT pname, destination,
           GREATEST(0, age_days) AS age_clamped
    FROM base
    WHERE age_days <= 3650
  )
  SELECT
    pname                                                                     AS device_category,
    pname                                                                     AS product_name,
    destination,
    COUNT(*)                                                                  AS unit_count,
    ROUND(AVG(age_clamped))                                                   AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_clamped))          AS median_days
  FROM filtered
  GROUP BY pname, destination
  HAVING COUNT(*) >= 3
  ORDER BY pname, destination
$$;

-- ── Function 3: Phân bố nhóm tuổi theo product_name ──────────────────────
-- Thêm bucket "Không rõ" cho thiết bị có age_days < 0
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
      COALESCE(di.product_name, 'Unknown')::TEXT AS device_category,
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
  classified AS (
    SELECT
      device_category,
      destination,
      CASE
        WHEN age_days <    0  THEN 'Không rõ ngày nhập'
        WHEN age_days <  180  THEN '< 6 tháng'
        WHEN age_days <  365  THEN '6-12 tháng'
        WHEN age_days <  730  THEN '1-2 năm'
        WHEN age_days <  1095 THEN '2-3 năm'
        WHEN age_days <= 3650 THEN '> 3 năm'
        ELSE NULL  -- bỏ outlier > 10 năm
      END AS bucket_label,
      CASE
        WHEN age_days <    0  THEN 0
        WHEN age_days <  180  THEN 1
        WHEN age_days <  365  THEN 2
        WHEN age_days <  730  THEN 3
        WHEN age_days <  1095 THEN 4
        WHEN age_days <= 3650 THEN 5
        ELSE NULL
      END AS bucket_ord
    FROM base
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
  WHERE bucket_label IS NOT NULL
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
-- SELECT * FROM repair_age_by_dest_category() WHERE device_category LIKE '%GO-168%';
-- SELECT * FROM repair_age_by_product() LIMIT 20;
-- SELECT * FROM repair_age_distribution() WHERE device_category LIKE '%GO-168%';
-- SELECT repair_age_total_matched();
