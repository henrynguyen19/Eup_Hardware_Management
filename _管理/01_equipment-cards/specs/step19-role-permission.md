# Step 19 規格：角色與權限系統

> 來源：2026-05-27 需求討論。
> 前置條件：Step 18 完成後執行（群組功能需要 use_groups 權限控制）。

---

## 設計決策摘要

| 項目 | 決策 |
|------|------|
| 角色系統 | 完全自訂（方向 B），建立 roles 資料表 |
| 權限設計 | role_permissions 關聯表，12 個 permission_key |
| 可見性控制 | ①②互斥 Radio，預設 ②（read_active_only） |
| 後端過濾 | read_active_only 在 Server Component 查詢層過濾，非 client 端 |
| 現有角色遷移 | 保留 admin/viewer 名稱，對應到新的「管理員」/「一般使用者」系統角色 |
| 系統角色 | is_system=true，不可刪除，但權限可調整 |
| 需手動執行 SQL | `_開發檔案/sql/add-roles-permissions.sql` |

---

## 12 個 Permission Keys

| permission_key | 說明 | 預設管理員 | 預設一般使用者 |
|---------------|------|-----------|------------|
| `read_all_cards` | ① 看全部料卡（含非現役） | ✅ | ❌ |
| `read_active_only` | ② 只看現役料卡（Radio，預設） | ❌ | ✅ |
| `read_documents` | 看文件/規格書 | ✅ | ✅ |
| `read_notes` | 看備註 | ✅ | ✅ |
| `read_vendor` | 看廠商 | ✅ | ✅ |
| `read_updated_by` | 看更新人員 | ✅ | ❌ |
| `read_updated_content` | 看更新內容（updated_fields） | ✅ | ❌ |
| `use_bookmarks` | 我的關注（書籤星號） | ✅ | ✅ |
| `crud_cards` | 新增/編輯/刪除料卡 | ✅ | ❌ |
| `manage_users` | 帳號管理/指派角色 | ✅ | ❌ |
| `manage_roles` | 角色與權限設定 | ✅ | ❌ |
| `use_groups` | 群組功能 | ✅ | ✅ |

> ⚠️ `read_all_cards` 和 `read_active_only` 互斥（二選一 Radio），不能同時勾選。
> 建立角色時，若兩者都沒選 → 後端預設視為 `read_active_only`（保守策略）。

---

## Schema 異動

```sql
-- 1. 角色表
CREATE TABLE roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  is_system   BOOLEAN DEFAULT false,  -- true = 不可刪除
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 角色權限關聯表
CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

-- 3. 種子資料：系統預設角色
INSERT INTO roles (name, is_system) VALUES
  ('管理員', true),
  ('一般使用者', true);

-- 管理員：12 項全開（除 read_active_only，因與 read_all_cards 互斥）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content',
  'use_bookmarks', 'crud_cards',
  'manage_users', 'manage_roles', 'use_groups'
]) FROM roles WHERE name = '管理員';

-- 一般使用者：預設 6 項
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'read_active_only',
  'read_documents', 'read_notes', 'read_vendor',
  'use_bookmarks', 'use_groups'
]) FROM roles WHERE name = '一般使用者';

-- 4. 移除 profiles 表的舊 CHECK 約束
-- （profiles.role 原本是 CHECK (role IN ('admin', 'viewer'))）
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 5. allowed_emails.role 更新：把舊值對應到新角色名稱
UPDATE allowed_emails SET role = '管理員' WHERE role = 'admin';
UPDATE allowed_emails SET role = '一般使用者' WHERE role = 'viewer';
```

SQL 存放：`_開發檔案/sql/add-roles-permissions.sql`

---

## API Routes

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/roles` | 列出所有角色（含各角色的 permissions） |
| POST | `/api/roles` | 新增角色 |
| PATCH | `/api/roles/[id]` | 更新角色名稱 |
| DELETE | `/api/roles/[id]` | 刪除角色（is_system=true 不允許） |
| GET | `/api/roles/[id]/permissions` | 取得角色的權限清單 |
| PUT | `/api/roles/[id]/permissions` | 覆寫角色的權限清單（body: `{permissions: string[]}` ） |

---

## 資料流設計

### Server Component（page.tsx）異動

```typescript
// 原本只查 role（admin/viewer）
const role = await getUserRole(userId)

// 改為查 role + permissions
const { roleName, permissions } = await getUserRoleWithPermissions(userId)
// getUserRoleWithPermissions：
//   1. 從 allowed_emails 查 role name
//   2. 從 roles + role_permissions 查對應 permission keys
//   3. 若找不到角色，預設 ['read_active_only']

// 套用 read_active_only 過濾（伺服器端）
const cards = permissions.includes('read_all_cards')
  ? await getAllEquipmentCards()
  : await getActiveEquipmentCards()  // WHERE status = activeStatus

// 傳給 Client Component
<PhotoWall
  ...
  permissions={permissions}
  isAdmin={permissions.includes('crud_cards')}
/>
```

### Client Component（PhotoWall.tsx + 子元件）

```typescript
// PhotoWall 接收 permissions prop
interface Props {
  ...
  permissions: string[]
}

// 使用方式
const canCRUD     = permissions.includes('crud_cards')
const canManage   = permissions.includes('manage_users')
const canRoles    = permissions.includes('manage_roles')
const canGroups   = permissions.includes('use_groups')
const canBookmark = permissions.includes('use_bookmarks')

// 傳給 CardDetailDialog 的 CardDetailProps 也加 permissions
```

### CardDetailDialog 欄位控制

```typescript
// 各欄位條件顯示
{permissions.includes('read_vendor') && <p>{card.vendor}</p>}
{permissions.includes('read_notes') && <p>{card.notes}</p>}
{permissions.includes('read_documents') && <DocumentsSection />}
{permissions.includes('read_updated_by') && <p>更新人員：{card.updated_by}</p>}
{permissions.includes('read_updated_content') && <p>更新欄位：{card.updated_fields}</p>}
```

---

## 前端頁面異動

### 1. 帳號管理頁（`/admin/users`）

**現況**：固定顯示「一般使用者」/「管理員」下拉。

**改動**：下拉選單改為從 `/api/roles` 動態載入角色清單，選項就是 roles 表中的所有角色名稱。

### 2. 新增角色管理頁（`/admin/roles`）

路徑：`src/app/admin/roles/page.tsx`

UI 設計：
```
← 角色管理

╔══════════════════════════════════════╗
║ 角色清單              [＋ 新增角色]  ║
╠══════════════════════════════════════╣
║ ● 管理員  [系統]                     ║  ← is_system，無刪除按鈕
║   可見性：看全部料卡                  ║
║   [展開權限清單 ▼]                   ║
╠══════════════════════════════════════╣
║ ● 一般使用者  [系統]                 ║
║   可見性：只看現役                    ║
║   [展開權限清單 ▼]                   ║
╠══════════════════════════════════════╣
║ ○ 倉管人員            [重命名] [刪除]║  ← 自訂角色
║   可見性：只看現役                    ║
║   [展開權限清單 ▼]                   ║
╚══════════════════════════════════════╝
```

展開後的權限清單（以 Radio + Checkbox 呈現）：

```
可見性（二選一）
  ○ ① 看全部料卡（含非現役）
  ● ② 只看現役              ← 預設

料卡細節
  ☑ 看文件/規格書
  ☑ 看備註
  ☑ 看廠商
  ☐ 看更新人員
  ☐ 看更新內容

功能權限
  ☑ 我的關注（書籤）
  ☑ 群組功能
  ☐ 新增/編輯/刪除料卡
  ☐ 帳號管理/指派角色
  ☐ 角色與權限設定
```

勾選後即時呼叫 PUT `/api/roles/[id]/permissions`。

### 3. 帳號管理頁入口

在帳號管理頁（`/admin/users`）的 Header 加入「角色管理」連結，前往 `/admin/roles`。

---

## 驗收標準

- [ ] `roles` 和 `role_permissions` 表建立成功，種子資料正確
- [ ] 帳號管理頁的角色下拉動態顯示 DB 中所有角色
- [ ] 角色管理頁可新增、刪除（非系統）角色
- [ ] 系統角色（管理員/一般使用者）不顯示刪除按鈕
- [ ] 勾選/取消權限後即時儲存
- [ ] `read_active_only` 角色的使用者，進入首頁只看到現役料卡（伺服器過濾，非 client）
- [ ] `read_all_cards` 角色的使用者，可看到全部料卡（含非現役）
- [ ] CardDetailDialog 依照權限顯示/隱藏廠商、備註、文件、更新人員等欄位
- [ ] 沒有 `crud_cards` 的使用者，管理員按鈕和浮動新增按鈕不顯示
- [ ] 沒有 `use_groups` 的使用者，群組 Panel 入口不顯示
- [ ] `npm run build` 通過

## 委派指示

```
委派給：data（roles + role_permissions + API + SQL + 修改 page.tsx 查詢邏輯）
        + frontend（角色管理頁 + 帳號管理頁下拉更新 + 各元件 permissions prop）並行
告知：Step 19，需修改 allowed_emails role 值遷移、移除 profiles CHECK 約束、
      新增 /admin/roles 頁面、修改 page.tsx 傳入 permissions、
      CardDetailDialog 和 PhotoWall 依 permissions 條件渲染
規格文件：_管理/01_equipment-cards/specs/step19-role-permission.md
SQL 執行：需提醒使用者在 Supabase Dashboard 執行 add-roles-permissions.sql
完成後：tester 驗收 → reviewer 審查
```
