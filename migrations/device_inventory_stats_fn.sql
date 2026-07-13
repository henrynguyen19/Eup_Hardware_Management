-- ===================================================
-- Indexes để tăng tốc query
-- ===================================================
CREATE INDEX IF NOT EXISTS idx_device_inv_code_product
  ON device_inventory(device_code, product_name);

CREATE INDEX IF NOT EXISTS idx_repair_items_imei
  ON repair_items(imei);

CREATE INDEX IF NOT EXISTS idx_repair_items_imei_dest
  ON repair_items(imei, destination);

CREATE INDEX IF NOT EXISTS idx_repair_items_status
  ON repair_items(status);

-- ===================================================
-- Function: tỉ lệ lỗi theo loại thiết bị
-- Dùng CTE riêng biệt để PostgreSQL optimize từng bước
-- Không dùng DISTINCT ON (chậm) → dùng GROUP BY + pre-computed sets
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
  WITH
  -- Step 1: unique device per product (GROUP BY thay vì DISTINCT ON)
  unique_inv AS (
    SELECT device_code, product_name
    FROM device_inventory
    WHERE device_code   IS NOT NULL
      AND device_code   <> ''
      AND product_name  IS NOT NULL
    GROUP BY device_code, product_name
  ),
  -- Step 2: tập IMEI đã từng sửa
  repaired AS (
    SELECT DISTINCT imei
    FROM repair_items
    WHERE imei IS NOT NULL AND imei <> ''
  ),
  -- Step 3: đếm thiết bị đang gửi hãng theo product_name (không qua IMEI join)
  -- Dùng status IN (cho_gui, da_gui) và group theo product_name
  -- → đồng bộ với danh sách "thiết bị chờ/sửa quá 7 ngày" (stale-devices API)
  sent_supplier_by_product AS (
    SELECT product_name, COUNT(DISTINCT imei) AS cnt
    FROM repair_items
    WHERE imei IS NOT NULL AND imei <> ''
      AND product_name IS NOT NULL AND product_name <> ''
      AND status IN ('cho_gui', 'da_gui')
    GROUP BY product_name
  ),
  -- Step 4: tập IMEI báo phế
  sent_scrap AS (
    SELECT DISTINCT imei
    FROM repair_items
    WHERE imei IS NOT NULL AND imei <> '' AND destination = 'scrap'
  )
  SELECT
    ui.product_name::TEXT,
    COUNT(DISTINCT ui.device_code)                                                              AS total_imported,
    COUNT(DISTINCT r.imei)                                                                      AS total_repaired,
    COALESCE(MAX(sp.cnt), 0)                                                                    AS total_supplier,
    COUNT(DISTINCT sc.imei)                                                                     AS total_scrap,
    ROUND(COUNT(DISTINCT r.imei)::NUMERIC   / NULLIF(COUNT(DISTINCT ui.device_code),0)*100, 1) AS repair_rate,
    ROUND(COALESCE(MAX(sp.cnt),0)::NUMERIC  / NULLIF(COUNT(DISTINCT ui.device_code),0)*100, 1) AS supplier_rate,
    ROUND(COUNT(DISTINCT sc.imei)::NUMERIC  / NULLIF(COUNT(DISTINCT ui.device_code),0)*100, 1) AS scrap_rate
  FROM unique_inv ui
  LEFT JOIN repaired                 r  ON r.imei         = ui.device_code
  LEFT JOIN sent_supplier_by_product sp ON sp.product_name = ui.product_name
  LEFT JOIN sent_scrap               sc ON sc.imei         = ui.device_code
  GROUP BY ui.product_name
  ORDER BY total_imported DESC;
$$;

-- ===================================================
-- Function: overview totals
-- ===================================================
CREATE OR REPLACE FUNCTION device_inventory_overview()
RETURNS TABLE (
  total_imported  BIGINT,
  total_uniq_imei BIGINT,
  total_repaired  BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH
  unique_inv AS (
    SELECT DIST