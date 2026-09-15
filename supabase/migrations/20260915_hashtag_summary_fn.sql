-- ============================================================
-- Hàm tổng hợp hashtag từ repair_items.notes
-- Chạy hoàn toàn trên PostgreSQL → không cần load rows vào Node.js
-- ============================================================

CREATE OR REPLACE FUNCTION hashtag_summary()
RETURNS TABLE (
  tag          text,
  count        bigint,
  device_count bigint,
  statuses     jsonb,
  top_products jsonb
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH raw AS (
    -- Tách từng hashtag ra khỏi notes
    SELECT
      lower((regexp_matches(notes, '#([^\s#,;.!?()\[\]{}"'']+)', 'g'))[1]) AS tag,
      product_name,
      status,
      imei
    FROM repair_items
    WHERE notes IS NOT NULL
      AND notes <> ''
      AND length(notes) < 5000   -- bỏ qua notes quá dài (tránh regex chậm)
  ),
  tag_agg AS (
    SELECT
      tag,
      count(*)             AS count,
      count(DISTINCT imei) AS device_count,
      -- statuses: { "da_sua_xong": 5, "cho_gui": 2 }
      jsonb_object_agg(DISTINCT status, status_cnt) AS statuses,
      -- top 5 products
      (
        SELECT jsonb_agg(p ORDER BY p->>'count' DESC)
        FROM (
          SELECT jsonb_build_object('product_name', product_name, 'count', count(*)) AS p
          FROM raw r2
          WHERE r2.tag = raw.tag
          GROUP BY product_name
          ORDER BY count(*) DESC
          LIMIT 5
        ) sub
      ) AS top_products
    FROM (
      SELECT tag, product_name, status, imei,
             count(*) OVER (PARTITION BY tag, status) AS status_cnt
      FROM raw
    ) x
    WHERE tag IS NOT NULL AND tag <> ''
    GROUP BY tag
  )
  SELECT tag, count, device_count,
         COALESCE(statuses, '{}'::jsonb),
         COALESCE(top_products, '[]'::jsonb)
  FROM tag_agg
  ORDER BY count DESC;
$$;

-- Cấp quyền cho service_role
GRANT EXECUTE ON FUNCTION hashtag_summary() TO service_role;

-- ============================================================
-- Indexes cho các bảng hay được query
-- ============================================================

-- ho_tro_tickets
CREATE INDEX IF NOT EXISTS idx_htt_date     ON ho_tro_tickets (ticket_date);
CREATE INDEX IF NOT EXISTS idx_htt_key      ON ho_tro_tickets (sheet_row_key);
CREATE INDEX IF NOT EXISTS idx_htt_staff    ON ho_tro_tickets (staff_name);
CREATE INDEX IF NOT EXISTS idx_htt_unread   ON ho_tro_tickets (has_unread_update)
  WHERE has_unread_update = true;
CREATE INDEX IF NOT EXISTS idx_htt_date_staff ON ho_tro_tickets (ticket_date, staff_name);

-- repair_items
CREATE INDEX IF NOT EXISTS idx_ri_received  ON repair_items (received_at);
CREATE INDEX IF NOT EXISTS idx_ri_product   ON repair_items (product_name);
CREATE INDEX IF NOT EXISTS idx_ri_status    ON repair_items (status);
-- Index partial cho notes (chỉ rows có notes — hashtag analysis)
CREATE INDEX IF NOT EXISTS idx_ri_notes_partial ON repair_items (id, received_at, product_name)
  WHERE notes IS NOT NULL AND notes <> '';

-- giao_hang_don_items (nếu tồn tại)
CREATE INDEX IF NOT EXISTS idx_ghdi_don ON giao_hang_don_items (don_hang_id);
