-- ====================================================
-- 拆分 crud_cards 為細粒度編輯權限
-- 執行環境：Supabase Dashboard → SQL Editor
-- ====================================================

-- 1. 移除管理員角色的舊 crud_cards
DELETE FROM role_permissions
WHERE permission_key = 'crud_cards'
  AND role_id = (SELECT id FROM roles WHERE name = '管理員');

-- 2. 新增細粒度權限給管理員（新增/刪除 + 編輯總開關 + 12 個欄位權限）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'add_delete_cards',
  'edit_cards',
  'edit_field_id',
  'edit_field_name',
  'edit_field_category',
  'edit_field_status',
  'edit_field_vendor',
  'edit_field_tags',
  'edit_field_notes',
  'edit_field_net_weight',
  'edit_field_documents',
  'edit_field_is_new',
  'edit_field_main_photo',
  'edit_field_detail_photos'
]) FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
