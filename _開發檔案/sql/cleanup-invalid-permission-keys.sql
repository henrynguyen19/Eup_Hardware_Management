-- 清除退版後殘留的無效 permission_key
-- 執行時機：code 退版至 c38aa84 後，DB 仍殘留 Step 20 新增的 key
-- 執行位置：Supabase Dashboard > SQL Editor

DELETE FROM role_permissions
WHERE permission_key IN (
  'crud_cards',
  'view_tracker',
  'view_my_tasks',
  'show_login_banner',
  'create_issues'
);
