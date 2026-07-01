-- ===================================================
-- Function: tính tỉ lệ lỗi thiết bị (inventory vs repair)
-- Logic:
--   1. De-duplicate inventory: mỗi device_code chỉ tính 1 lần
--      (lấy imported_date sớm nhất nếu thiết bị được chuyển kho nhiều lần)
--   2. Chỉ đếm repair nếu received_at >= imported_date của thiết bị đó
--   3. Thiết bị sửa nhiều lần chỉ tính là 1 (COUNT DISTINCT device_code)
-- ===================================================

CREATE OR REPLACE FUNCTION device_inventory_failure_stats()
RETURNS TABLE (
  product_name   TEXT,
  total_imported BIGINT,
  total_repaired BIGINT,
  total_supplier BIGINT,
  total_scrap    BIGINT,
  repair_rate    NUMERIC,
  supplier_rate  NUMERIC,
  scrap_rate     NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH unique_inv AS (
    -- 1 dòng duy nhất per device_code, lấy ngày nhập sớm nhất
    SELECT DISTINCT ON (device_code)
      device_code,
      product_name,
      imported_date
    FROM device_inventory
    WHERE device_code   IS NOT NULL
      AND device_code   <> ''
      AND product_name  IS NOT NULL
    ORDER BY device_code, imported_date ASC NULLS LAST
  )
  SELECT
    ui.product_name::TEXT,

    -- Tổng thiết bị nhập (unique device_code)
    COUNT(DISTINCT ui.device_code)                                                             AS total_imported,

    -- Thiết bị đã có ít nhất 1 lần sửa SAU ngày nhập
    COUNT(DISTINCT CASE WHEN ri.imei IS NOT NULL THEN ui.device_code END)                     AS total_repaired,

    -- Thiết bị bị gửi hãng (bất kỳ lần sửa nào có destination='supplier')
    COUNT(DISTINCT CASE WHEN ri.destination = 'supplier' THEN ui.device_code END)            AS total_supplier,

    -- Thiết bị báo phế
    COUNT(DISTINCT CASE WHEN ri.destination = 'scrap'    THEN ui.device_code END)            AS total_scrap,

    -- Tỉ lệ %
    ROUND(
      COUNT(DISTINCT CASE WHEN ri.imei IS NOT NULL THEN ui.device_code END)::NUMERIC
      / NULLIF(COUNT(DISTINCT ui.device_code), 0) * 100, 1
    )                                                                                          AS repair_rate,
    ROUND(
      COUNT(DISTINCT CASE WHEN ri.destination = 'supplier' THEN ui.device_code END)::NUMERIC
      / NULLIF(COUNT(DISTINCT ui.device_code), 0) * 100, 1
    )                                                                                          AS supplier_rate,
    ROUND(
      COUNT(DISTINCT CASE WHEN ri.destination = 'scrap' THEN ui.device_code END)::NUMERIC
      / NULLIF(COUNT(DISTINCT ui.device_code), 0) * 100, 1
    )                                                                                          AS scrap_rate

  FROM unique_inv ui
  LEFT JOIN repair_items ri
         ON ri.imei = ui.device_code
            -- Chỉ tính repair SAU ngày thiết bị được nhập vào kho
        AND (ui.imported_date IS NULL OR ri.received_at::date >= ui.imported_date)

  GROUP BY ui.product_name
  ORDER BY total_imported DESC;
$$;


-- ===================================================
-- Overview totals
-- ===================================================
CREATE OR REPLACE FUNCTION device_inventory_overview()
RETURNS TABLE (
  total_imported  BIGINT,   -- tổng dòng trong inventory (bao gồm transfers)
  total_uniq_imei BIGINT,   -- unique device_code
  total_repaired  BIGINT    -- unique device_code có ít nhất 1 repair sau ngày nhập
)
LANGUAGE sql
STABLE
AS $$
  WITH unique_inv AS (
    SELECT DISTINCT ON (device_code)
      device_code, imported_date
    FROM device_inventory
    WHERE device_code IS NOT NULL AND device_code <> ''
    ORDER BY device_code, imported_date ASC NULLS LAST
  )
  SELECT
    (SELECT COUNT(*) FROM device_inventory)                                   AS total_imported,
    COUNT(DISTINCT ui.device_code)                                            AS total_uniq_imei,
    COUNT(DISTINCT CASE WHEN ri.imei IS NOT NULL THEN ui.device_code END)     AS total_repaired
  FROM unique_inv ui
  LEFT JOIN repair_items ri
         ON ri.imei = ui.device_code
        AND (ui.imported_date IS NULL OR ri.received_at::date >= ui.imported_date);
$$;
