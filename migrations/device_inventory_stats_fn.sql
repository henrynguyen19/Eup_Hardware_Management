-- ===================================================
-- Function: tính tỉ lệ lỗi thiết bị (inventory vs repair)
-- Dùng LEFT JOIN ở DB thay vì JS để tránh timeout
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
  SELECT
    di.product_name::TEXT,
    COUNT(DISTINCT di.device_code)                                                          AS total_imported,
    COUNT(DISTINCT ri.imei)                                                                 AS total_repaired,
    COUNT(DISTINCT CASE WHEN ri.destination = 'supplier' THEN ri.imei END)                 AS total_supplier,
    COUNT(DISTINCT CASE WHEN ri.destination = 'scrap'    THEN ri.imei END)                 AS total_scrap,
    ROUND(
      COUNT(DISTINCT ri.imei)::NUMERIC
      / NULLIF(COUNT(DISTINCT di.device_code), 0) * 100, 1
    )                                                                                       AS repair_rate,
    ROUND(
      COUNT(DISTINCT CASE WHEN ri.destination = 'supplier' THEN ri.imei END)::NUMERIC
      / NULLIF(COUNT(DISTINCT di.device_code), 0) * 100, 1
    )                                                                                       AS supplier_rate,
    ROUND(
      COUNT(DISTINCT CASE WHEN ri.destination = 'scrap' THEN ri.imei END)::NUMERIC
      / NULLIF(COUNT(DISTINCT di.device_code), 0) * 100, 1
    )                                                                                       AS scrap_rate
  FROM device_inventory di
  LEFT JOIN repair_items ri
         ON ri.imei = di.device_code
        AND di.device_code IS NOT NULL
        AND di.device_code <> ''
  WHERE di.product_name IS NOT NULL
  GROUP BY di.product_name
  ORDER BY total_imported DESC;
$$;

-- Overview totals function
CREATE OR REPLACE FUNCTION device_inventory_overview()
RETURNS TABLE (
  total_imported BIGINT,
  total_uniq_imei BIGINT,
  total_repaired  BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*)                                                       AS total_imported,
    COUNT(DISTINCT di.device_code)                                AS total_uniq_imei,
    COUNT(DISTINCT CASE WHEN ri.imei IS NOT NULL THEN di.device_code END) AS total_repaired
  FROM device_inventory di
  LEFT JOIN repair_items ri
         ON ri.imei = di.device_code
        AND di.device_code IS NOT NULL
        AND di.device_code <> '';
$$;
