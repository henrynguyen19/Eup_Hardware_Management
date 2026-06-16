# Step 20 規格：追蹤板（議題追蹤系統）

> 來源：2026-06-05 需求討論
> 前置條件：Step 19 的 SQL（`add-roles-permissions.sql`）必須已在 Supabase 執行完畢（roles / role_permissions 資料表須存在）

---

## ⛔ Step 20 實作範圍限制（最高優先，覆蓋所有其他指示）

**本 Step 只做「新增」，不做「修改既有體驗」。**
現有的所有功能、版面、風格在本 Step 實作期間一律不得改動（往後有新需求時可在對應 Step 規格中明確指定修改範圍）。

### 【禁止觸碰】以下檔案不得有任何修改

| 檔案 | 原因 |
|------|------|
| `src/components/PhotoWall.tsx` | 主頁照片牆，版面與互動已定案 |
| `src/components/EquipmentCardItem.tsx` | 卡片縮圖，版面已定案 |
| `src/components/CardDetailDialog.tsx` | Lightbox，已定案 |
| `src/components/CardFormDialog.tsx` | 料卡編輯，已定案 |
| `src/components/BatchImportDialog.tsx` | CSV 匯入，已定案 |
| `src/components/GroupsPanel.tsx` | 群組面板，已定案 |
| `src/hooks/usePhotoUpload.ts` | 上傳 hook，不涉及本 Step |
| `src/lib/supabase-server.ts` | 不動 |
| `src/lib/supabase-browser.ts` | 不動 |
| `src/lib/utils.ts` | 不動 |

### 【允許修改的既有檔案】僅以下 4 個，且只能做指定範圍的修改

| 檔案 | 允許的修改範圍 |
|------|-------------|
| `src/app/page.tsx` | 只加：追蹤板 Header 連結 + badge、登入後待處理 Banner。**不得改動任何現有元素** |
| `src/app/api/roles/[id]/permissions/route.ts` | 只加：`VALID_PERMISSION_KEYS` 陣列補上 4 個新 key |
| `src/components/RolesManager.tsx` | 只加：4 個新 permission key 的 label 與勾選顯示 |
| `src/components/UserMenu.tsx` | 只加：追蹤板導覽連結（如有 `view_tracker` 才顯示）。**不得改動任何現有選單項目** |

### 【允許新建的檔案】

- `src/app/tracker/page.tsx`
- `src/app/api/issues/route.ts`
- `src/app/api/issues/[id]/route.ts`
- `src/app/api/issues/[id]/updates/route.ts`
- `src/components/IssueDetailDialog.tsx`
- `src/components/NewIssueDialog.tsx`
- `_開發檔案/sql/add-tracker.sql`

### 風格規範（必須遵守）

沿用現有設計語言，不得引入新的 CSS 變數或修改 `globals.css`：
- 主色 `#7a5230`、背景 `#faf6f0`、強調 `#c49a72`
- 字體、圓角、陰影與現有元件一致

---

## 設計決策摘要

| 項目 | 決策 |
|------|------|
| 功能定位 | 補充 Line（定位 B），不取代即時通訊，負責正式記錄與查詢 |
| 通知機制 | 不做外部推播，靠 Header badge 數字角標 |
| 議題與料卡關聯 | 無正式連結欄位，說明欄自由填寫設備名稱即可 |
| 標籤管理 | 透過 app_settings（admin 統一管理清單），建立議題時多選 |
| 優先度顯示 | 彩色圓點：🔴 high / 🟡 medium / 🟢 low |
| 負責人顯示 | email 前綴（homejay@eup.com.tw → homejay） |
| 更新紀錄 | 每條含時間戳 + 發文者 email 前綴 + 內容，新到舊排列 |
| 刪除確認 | 使用 ConfirmDialog，不用原生 confirm() |

---

## 新增 Permission Keys（接續 Step 19 的 12 項）

| permission_key | 說明 | 預設管理員 | 預設一般使用者 |
|---------------|------|-----------|------------|
| `view_tracker` | 可看到追蹤板頁面 | ✅ | ✅ |
| `view_my_tasks` | 我的任務 tab + Header badge | ✅ | ✅ |
| `show_login_banner` | 登入後顯示待處理議題 Banner | ✅ | ❌ |
| `create_issues` | 可新增議題（顯示「＋ 新增議題」按鈕） | ✅ | ❌ |

---

## Schema 異動

### 新增資料表

```sql
-- 1. 議題主表
CREATE TABLE issues (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,        -- '缺貨'|'韌體'|'維修'|'客戶反應'|'其他'
  priority    TEXT NOT NULL DEFAULT 'medium',  -- 'high'|'medium'|'low'
  status      TEXT NOT NULL DEFAULT '待處理',  -- '待處理'|'進行中'|'等待中'|'已完成'
  due_date    DATE,
  description TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_by  TEXT NOT NULL,        -- user email
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 議題負責人（多人）
CREATE TABLE issue_assignees (
  issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  PRIMARY KEY (issue_id, user_email)
);

-- 3. 議題更新紀錄
CREATE TABLE issue_updates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_by TEXT NOT NULL,  -- user email
  created_at TIMESTAMPTZ DEFAULT now()
);

-- updated_at 自動觸發器
CREATE OR REPLACE FUNCTION update_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_issues_updated_at();
```

### RLS 政策

```sql
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_updates ENABLE ROW LEVEL SECURITY;

-- 所有登入使用者可讀（前端再依 view_tracker 權限控制顯示）
CREATE POLICY "authenticated read issues" ON issues
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated read assignees" ON issue_assignees
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated read updates" ON issue_updates
  FOR SELECT USING (auth.role() = 'authenticated');

-- 寫入由 API Route（Service Role）控制，前端不直接寫入
```

### app_settings 新增 key

```sql
INSERT INTO app_settings (key, value) VALUES
  ('issueTypes', '["缺貨", "韌體", "維修", "客戶反應", "其他"]'),
  ('issueTags', '[]')
ON CONFLICT (key) DO NOTHING;
```

### role_permissions 新增種子資料

```sql
-- 管理員：加 4 項新權限
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'view_tracker', 'view_my_tasks', 'show_login_banner', 'create_issues'
]) FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;

-- 一般使用者：加 2 項（追蹤板可看、我的任務可看）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'view_tracker', 'view_my_tasks'
]) FROM roles WHERE name = '一般使用者'
ON CONFLICT DO NOTHING;
```

---

## API Routes

### GET /api/issues
查詢議題清單，支援篩選參數：`type`、`status`、`priority`、`assignee=me`（我的任務）

權限：`view_tracker`

回傳：議題陣列，含 `assignees`（email 前綴陣列）

### POST /api/issues
新增議題

權限：`create_issues`

Body：`{ title, type, priority, status, due_date, description, tags, assignees: string[] }`

### GET /api/issues/[id]
查詢單筆議題完整資料（含 assignees + updates）

權限：`view_tracker`

### PATCH /api/issues/[id]
更新議題欄位

權限：本人（created_by = 當前 email）或擁有 `create_issues` 權限

### DELETE /api/issues/[id]
刪除議題

權限：本人（created_by = 當前 email）或擁有 `crud_cards` 權限

### POST /api/issues/[id]/updates
新增更新紀錄

權限：`view_tracker`（任何可看追蹤板的人都能留更新）

Body：`{ content: string }`

---

## 前端頁面與元件

### 導覽列更新（Header）
- 追蹤板連結（有 `view_tracker` 才顯示）
- Badge：`我的任務 (N)`，N = 我的未完成議題數（有 `view_my_tasks` 才顯示）

### 登入 Banner（page.tsx）
- 有 `show_login_banner` 且有未完成議題（assigned to me）時顯示
- 文字：「你有 N 件待處理議題」，點擊跳至追蹤板我的任務 tab
- 可手動關閉（session 內不再顯示）

### 追蹤板頁面（`/tracker`）

```
追蹤板
[全部] [我的任務]          類型▾  狀態▾  優先度▾    [＋ 新增議題]（需 create_issues）

─────────────────────────────────────────────────
🔴  [缺貨]  A型壓縮機缺貨        [待處理]  6/25  homejay, wang  2天前
🟡  [韌體]  B系列韌體更新 v2.3   [進行中]  6/30  homejay        5小時前
🟢  [維修]  測試機歸還確認        [等待中]   —    li             剛剛
─────────────────────────────────────────────────
```

每列欄位：優先度圓點 + 類型標籤 + 標題 + 狀態徽章 + 預計日期 + 負責人（email 前綴）+ 建立時間

### IssueDetailDialog（點開議題）

```
┌──────────────────────────────────────────┐
│ A型壓縮機缺貨              [待處理 ▾]  ✕ │
├──────────────────────────────────────────┤
│ 優先度   🔴 緊急                         │
│ 類型     [缺貨]                          │
│ 預計日期  2026-06-25                     │
│ 負責人   [homejay ✕] [wang ✕] [＋]      │
│ 標籤     [跨部門 ✕] [待確認 ✕]          │
│                                          │
│ 說明                                     │
│ 廠商原定 6/15，已確認延至 6/25           │
│                                          │
│ ── 更新紀錄 ───────────────────────────  │
│ 2026-06-05 14:32  homejay                │
│ 廠商通知延遲，改為 6/25                  │
│                                          │
│ 2026-06-03 09:10  wang                   │
│ 已向廠商確認，原定 6/15 到貨             │
│                                          │
│ [新增更新紀錄...              ]  [送出]  │
├──────────────────────────────────────────┤
│ 建立者 homejay｜2026-06-03 09:00  [刪除] │
└──────────────────────────────────────────┘
```

**編輯權限**：
- 所有欄位編輯：建立者本人 或 有 `create_issues` 權限
- 狀態更新：負責人 + 建立者 + 有 `create_issues` 者
- 新增更新紀錄：有 `view_tracker` 者（全員）
- 刪除議題：建立者本人 或 有 `crud_cards` 權限（須 ConfirmDialog 確認）

### NewIssueDialog / EditIssueDialog
- 欄位：標題（必填）、類型（必填）、優先度（預設 medium）、狀態（預設待處理）、預計日期、說明、負責人多選、標籤多選
- 負責人選單：從 allowed_emails 撈取使用者清單
- 標籤選單：從 app_settings.issueTags 讀取

### 設定頁新增（admin/settings）
- `議題標籤` 管理（使用現有 OptionsEditor 元件）
- `議題類型` 管理（可擴充，預設值已在 seed 資料）

### 角色權限頁面更新（admin/roles）
- 新增 4 個 permission key 的顯示與勾選

---

## 主題色規範

沿用現有設計語言：
- 主色：`#7a5230`
- 背景：`#faf6f0`
- 強調：`#c49a72`
- 優先度圓點：🔴 `#ef4444`（red-500）/ 🟡 `#eab308`（yellow-500）/ 🟢 `#22c55e`（green-500）
- 狀態徽章：待處理 灰、進行中 藍、等待中 黃、已完成 綠（使用 shadcn/ui Badge variant）

---

## 踩坑預防清單

| 風險點 | 預防措施 |
|--------|---------|
| 三元運算式當 statement | 一律改用 if/else（ESLint no-unused-expressions 踩過 3 次） |
| 議題刪除無確認 | 使用 ConfirmDialog，禁用原生 confirm() |
| 狀態切換延遲感 | Optimistic Update，先更新 UI，失敗再 rollback |
| useSearchParams | 確保包在 `<Suspense>` 內 |
| Popover 被裁切 | 負責人多選 Popover 確認父容器無 overflow:hidden，否則改 fixed 定位 |
| 議題 tag 孤兒值 | 從議題資料掃出不在 issueTags 設定的 tag，浮出顯示（同現有篩選邏輯） |
| API 無權限防護 | 每個 API Route 頂端加 permission 檢查，回傳 403 |
| 負責人清單更新 | allowed_emails 撈取，不 cache（每次開 Dialog 重撈） |

---

## 執行順序

```
Step 20a（data agent）：
  1. 建立 issues / issue_assignees / issue_updates 資料表（SQL）
  2. 設定 RLS 政策
  3. app_settings seed（issueTypes / issueTags）
  4. role_permissions seed（4 個新 key）
  5. 建立 API Routes（/api/issues、/api/issues/[id]、/api/issues/[id]/updates）

Step 20b（frontend agent）：
  1. Header：追蹤板連結 + badge
  2. /tracker 頁面（追蹤板主頁 + 篩選列）
  3. IssueDetailDialog
  4. NewIssueDialog / EditIssueDialog
  5. 登入 Banner（page.tsx）
  6. 設定頁：議題標籤 + 議題類型管理
  7. 角色權限頁：新增 4 個 permission key

tester → reviewer
```

---

## 完成標準

- [ ] `npm run build` 通過，無 TypeScript / ESLint 錯誤
- [ ] 有 `view_tracker` 權限的角色可看到追蹤板頁面
- [ ] 無 `view_tracker` 權限時，Header 不顯示追蹤板連結，直接訪問 `/tracker` 重導向
- [ ] 有 `create_issues` 權限才顯示「＋ 新增議題」按鈕
- [ ] 新增議題成功後清單即時更新
- [ ] 狀態切換為 Optimistic Update（無延遲感）
- [ ] 刪除議題需通過 ConfirmDialog 確認
- [ ] 更新紀錄含時間戳，新到舊排列
- [ ] Badge 數字正確反映未完成議題數
- [ ] 登入 Banner 在有 `show_login_banner` 且有待處理議題時顯示
- [ ] 設定頁可管理議題標籤清單
- [ ] 主題色視覺與現有介面一致
