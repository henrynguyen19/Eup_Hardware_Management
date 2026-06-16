# Step 23 規格：角色群組擴充

> 來源：2026-06-07 需求討論。
> 前置條件：Step 19（角色權限系統）已執行完畢。
> 目標：在現有 roles / role_permissions 架構上擴充部門群組、細粒度編輯權限、追蹤板群組隔離。

---

## 設計決策摘要

| 項目 | 決策 |
|------|------|
| 群組來源 | 角色內建（指派角色即決定群組），不另外指派 |
| 群組清單 | admin / tech / purchasing / supply_chain / engineering / sales / null（一般使用者） |
| 角色層級 | super_admin / dept_admin / member / viewer |
| 追蹤板範圍 | 永遠只看自己 dept_group，包含管理員，無例外 |
| 編輯欄位粒度 | 新增 12 個 `edit_card_*` permission key，各別勾選 |
| 權限 UI 結構 | 按頁面分組（料卡列表 / 料卡細節 / 料卡管理 / 帳號管理 / 追蹤板） |
| 指派角色限制 | dept_admin 只能指派同 dept_group 且 level ≠ dept_admin/super_admin 的角色 |
| 移除項目 | 角色管理 UI 移除「群組功能」勾選項（use_groups 保留給個人群組功能，不顯示在角色管理） |
| 個人群組（Step 18） | 不受影響，仍為個人私有，與部門群組是不同概念 |

---

## 角色清單（12 個系統角色）

| 角色名稱 | dept_group | level |
|---------|-----------|-------|
| 管理員 | admin | super_admin |
| 管理員(技師) | tech | dept_admin |
| 管理員(採購) | purchasing | dept_admin |
| 管理員(供應鏈) | supply_chain | dept_admin |
| 管理員(工程) | engineering | dept_admin |
| 管理員(業務) | sales | dept_admin |
| 採購 | purchasing | member |
| 供應鏈 | supply_chain | member |
| 工程 | engineering | member |
| 業務 | sales | member |
| 技師 | tech | member |
| 一般使用者 | null | viewer |

---

## 完整 Permission Keys 清單

> ⚠️ `read_all_cards` 與 `read_active_only` 互斥（Radio），不可同時存在。

### 保留（Step 19 已有）

| permission_key | 說明 |
|---------------|------|
| `read_all_cards` | 看全部料卡（含非現役） |
| `read_active_only` | 只看現役料卡 |
| `read_documents` | 看文件/規格書 |
| `read_notes` | 看備註 |
| `read_vendor` | 看廠商 |
| `read_updated_by` | 看更新人員 |
| `read_updated_content` | 看更新內容 |
| `use_bookmarks` | 我的關注（書籤） |
| `manage_users` | 帳號管理/指派角色 |
| `manage_roles` | 角色與權限設定 |

> `crud_cards` 拆分為下方項目，原 `crud_cards` key 廢棄。

### 新增（Step 23）

| permission_key | 分組 | 說明 |
|---------------|------|------|
| `create_delete_cards` | 料卡管理 | 新增/刪除料卡 |
| `edit_card_equipment_id` | 料卡管理 > 編輯欄位 | 編輯料號 |
| `edit_card_name` | 料卡管理 > 編輯欄位 | 編輯品名 |
| `edit_card_category` | 料卡管理 > 編輯欄位 | 編輯分類 |
| `edit_card_status` | 料卡管理 > 編輯欄位 | 編輯狀態 |
| `edit_card_vendor` | 料卡管理 > 編輯欄位 | 編輯廠商 |
| `edit_card_tags` | 料卡管理 > 編輯欄位 | 編輯標籤 |
| `edit_card_notes` | 料卡管理 > 編輯欄位 | 編輯備註 |
| `edit_card_weight` | 料卡管理 > 編輯欄位 | 編輯淨重／淨重照片 |
| `edit_card_documents` | 料卡管理 > 編輯欄位 | 編輯文件連結 |
| `edit_card_is_new` | 料卡管理 > 編輯欄位 | 編輯新品標記 |
| `edit_card_main_photo` | 料卡管理 > 編輯欄位 | 編輯主照片 |
| `edit_card_detail_photos` | 料卡管理 > 編輯欄位 | 編輯細節照片 |
| `view_tracker` | 追蹤板 | 可看追蹤板 |
| `tracker_my_tasks` | 追蹤板 | 我的任務 + badge |
| `tracker_create_issue` | 追蹤板 | 可新增議題 |
| `tracker_edit_issue` | 追蹤板 | 可編輯議題 |

---

## Schema 異動

```sql
-- 1. roles 表擴充欄位
ALTER TABLE roles
  ADD COLUMN dept_group TEXT,
  ADD COLUMN level      TEXT DEFAULT 'viewer'
    CHECK (level IN ('super_admin', 'dept_admin', 'member', 'viewer'));

-- 2. 更新現有兩個系統角色
UPDATE roles SET dept_group = 'admin', level = 'super_admin' WHERE name = '管理員';
UPDATE roles SET dept_group = null,    level = 'viewer'      WHERE name = '一般使用者';

-- 3. 新增 10 個系統角色
INSERT INTO roles (name, is_system, dept_group, level) VALUES
  ('管理員(技師)',   true, 'tech',         'dept_admin'),
  ('管理員(採購)',   true, 'purchasing',   'dept_admin'),
  ('管理員(供應鏈)', true, 'supply_chain', 'dept_admin'),
  ('管理員(工程)',   true, 'engineering',  'dept_admin'),
  ('管理員(業務)',   true, 'sales',        'dept_admin'),
  ('採購',          true, 'purchasing',   'member'),
  ('供應鏈',        true, 'supply_chain', 'member'),
  ('工程',          true, 'engineering',  'member'),
  ('業務',          true, 'sales',        'member'),
  ('技師',          true, 'tech',         'member');

-- 4. 舊 crud_cards → 新 create_delete_cards + 全部 edit_card_*（管理員）
-- 找出現有有 crud_cards 的角色，補新 keys
INSERT INTO role_permissions (role_id, permission_key)
SELECT rp.role_id, new_key
FROM role_permissions rp
CROSS JOIN unnest(ARRAY[
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos'
]) AS new_key
WHERE rp.permission_key = 'crud_cards'
ON CONFLICT DO NOTHING;

-- 刪除舊 crud_cards
DELETE FROM role_permissions WHERE permission_key = 'crud_cards';

-- 5. 新系統角色的 permissions 種子
-- 管理員(技師) / 管理員(採購) / 管理員(供應鏈) / 管理員(工程) / 管理員(業務)
-- 與管理員相同，但 manage_users 限本組（邏輯層控制，permission key 仍給）
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY[
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor', 'read_updated_by', 'read_updated_content',
  'use_bookmarks',
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
  'manage_users',
  'view_tracker', 'tracker_my_tasks', 'tracker_create_issue', 'tracker_edit_issue'
]) AS key
WHERE r.name IN ('管理員(技師)', '管理員(採購)', '管理員(供應鏈)', '管理員(工程)', '管理員(業務)')
ON CONFLICT DO NOTHING;

-- 管理員（super_admin）補追蹤板 keys
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY[
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
  'view_tracker', 'tracker_my_tasks', 'tracker_create_issue', 'tracker_edit_issue'
]) AS key
WHERE r.name = '管理員'
ON CONFLICT DO NOTHING;

-- member 角色（採購/供應鏈/工程/業務/技師）
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY[
  'read_active_only',
  'read_documents', 'read_notes', 'read_vendor',
  'use_bookmarks',
  'view_tracker', 'tracker_my_tasks'
]) AS key
WHERE r.name IN ('採購', '供應鏈', '工程', '業務', '技師')
ON CONFLICT DO NOTHING;

-- 6. 追蹤板 RLS：group-scoped（依 profiles.role → roles.dept_group 判斷）
-- 需配合 tracker_issues 表的 dept_group 欄位
-- 假設 tracker_issues 表有 dept_group TEXT 欄位（若無需 ALTER TABLE 加入）
ALTER TABLE tracker_issues ADD COLUMN IF NOT EXISTS dept_group TEXT;

-- 用 dept_group 更新現有議題（依建立者的群組）
UPDATE tracker_issues ti
SET dept_group = r.dept_group
FROM profiles p
JOIN roles r ON r.name = p.role
WHERE ti.created_by = p.id;

-- RLS Policy（tracker_issues）
DROP POLICY IF EXISTS "group scoped tracker" ON tracker_issues;
CREATE POLICY "group scoped tracker"
  ON tracker_issues FOR ALL
  USING (
    dept_group = (
      SELECT r.dept_group
      FROM profiles p
      JOIN roles r ON r.name = p.role
      WHERE p.id = auth.uid()
    )
  );
```

SQL 存放：`_開發檔案/sql/step23-role-group-expansion.sql`

---

## API Routes 異動

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/roles` | 回傳包含 dept_group / level / permissions |
| GET | `/api/roles/assignable` | 依目前使用者層級，回傳可指派的角色清單 |

### GET /api/roles/assignable 邏輯

```typescript
// super_admin → 所有角色
// dept_admin  → 同 dept_group 且 level = 'member' | 'viewer' 的角色
// 其他        → 空陣列（無帳號管理權限）
```

帳號管理頁的角色下拉改呼叫 `/api/roles/assignable`，不再呼叫 `/api/roles`。

---

## 前端異動

### 1. `/admin/roles` 角色管理頁

**Permission UI 改為按頁面分組**：

```
可見性
  ● 看全部料卡（含非現役）
  ○ 只看現役料卡

料卡列表
  ☑ 我的關注（書籤）

料卡細節
  ☑ 看文件/規格書
  ☑ 看備註
  ☑ 看廠商
  ☑ 看更新人員
  ☑ 看更新內容

料卡管理
  ☑ 新增/刪除料卡
  ☑ 編輯料卡（展開子選項）
    ☑ 料號　☑ 品名　☑ 分類　☑ 狀態
    ☑ 廠商　☑ 標籤　☑ 備註　☑ 淨重／淨重照片
    ☑ 文件連結　☑ 新品標記　☑ 主照片　☑ 細節照片

帳號管理
  ☑ 帳號管理/指派角色
  ☑ 角色與權限設定

追蹤板
  ☑ 可看追蹤板
  ☑ 我的任務 + badge
  ☑ 可新增議題
  ☑ 可編輯議題
```

> 移除「群組功能」勾選項（use_groups 由系統內部管理，不對外顯示）

**「編輯料卡」父子連動規則**：
- 子選項任一勾選 → 父選項自動勾選（半選狀態）
- 子選項全取消 → 父選項取消
- 父選項勾選 → 全部子選項勾選
- 父選項取消 → 全部子選項取消

**角色卡片新增顯示**：
- 角色名稱旁標示群組 badge（`採購`、`工程` 等），`is_system=true` 顯示 `[系統]`
- `super_admin` 顯示 `[全域]`，無群組的顯示 `[無群組]`

### 2. `/admin/users` 帳號管理頁

- 角色下拉改呼叫 `/api/roles/assignable`
- 指派欄位旁顯示該角色的群組 badge

### 3. `CardFormDialog.tsx`（允許最小侵入）

依 `edit_card_*` permissions 顯示/隱藏各欄位，無相應 permission 的欄位：
- 以灰色 disabled 顯示（保持 layout 完整），或
- 直接隱藏（由 spec 執行時確認，建議 disabled 方式）

### 4. 追蹤板（`/tracker`）

`tracker_issues` 查詢加入 `dept_group` 過濾：
- 前端呼叫 API 時自動套用（後端 RLS 已限制，前端無需額外過濾）
- 新增議題時，`dept_group` 由 Server 從目前使用者角色推導，前端不傳

---

## 角色指派限制邏輯（API 層強制）

```typescript
// PATCH /api/admin/users/[id] 或帳號管理 API
// 執行指派前驗證：

const assignerRole = await getRoleByUserId(assignerUserId)
const targetRoleName = body.role
const targetRole = await getRoleByName(targetRoleName)

if (assignerRole.level === 'super_admin') {
  // 可指派任何角色，pass
} else if (assignerRole.level === 'dept_admin') {
  if (
    targetRole.dept_group !== assignerRole.dept_group ||
    targetRole.level === 'dept_admin' ||
    targetRole.level === 'super_admin'
  ) {
    return 403 // 只能指派同組 member/viewer
  }
} else {
  return 403
}
```

---

## 驗收標準

- [ ] `roles` 表有 `dept_group` / `level` 欄位，12 個系統角色建立正確
- [ ] `crud_cards` permission key 已移除，替換為 `create_delete_cards` + `edit_card_*`
- [ ] 角色管理頁 permission UI 按頁面分組顯示
- [ ] 移除「群組功能」勾選項
- [ ] 追蹤板新增「可編輯議題」勾選項
- [ ] 編輯料卡父子 checkbox 連動正確
- [ ] 帳號管理頁角色下拉只顯示可指派的角色（`/api/roles/assignable`）
- [ ] dept_admin 無法指派其他部門或更高層級的角色（API 回 403）
- [ ] `tracker_issues` 加入 `dept_group` 欄位，RLS 正確隔離
- [ ] 同群組使用者互看追蹤板正常，不同群組看不到
- [ ] `CardFormDialog` 依 `edit_card_*` permissions 控制欄位
- [ ] `npm run build` 通過

---

## 委派指示

```
委派給：
  data — roles schema 擴充、role_permissions 遷移、tracker_issues 加欄 + RLS、
          /api/roles/assignable API、帳號指派 API 加限制邏輯
  frontend — 角色管理頁 UI 重構（按頁面分組、移除群組功能、加編輯料卡父子連動）、
              帳號管理頁下拉改 assignable API、CardFormDialog edit_card_* 控制

執行順序：data 先執行 SQL + API，frontend 並行執行 UI，tester 驗收，reviewer 審查

【允許新建】
  _開發檔案/sql/step23-role-group-expansion.sql
  src/app/api/roles/assignable/route.ts

【禁止觸碰】
  src/components/PhotoWall.tsx
  src/components/EquipmentCardItem.tsx
  src/components/CardDetailDialog.tsx
  src/components/BatchImportDialog.tsx
  src/app/page.tsx
  _開發檔案/sql/add-roles-permissions.sql（Step 19 產出，不可修改）

規格文件：_管理/01_equipment-cards/specs/step23-role-group-expansion.md
SQL 執行：需使用者在 Supabase Dashboard 執行 step23-role-group-expansion.sql
完成後：tester 驗收 → reviewer 審查
```
