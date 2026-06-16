# Step 18 規格：群組系統（取代 user_bookmarks）

> 來源：2026-05-27 需求討論。
> 核心決策：「我的關注」不再是獨立系統，而是一個 `is_default=true` 的群組，和使用者自訂群組平行存在。

---

## 設計決策摘要

| 項目 | 決策 |
|------|------|
| 我的關注定位 | 系統自動建立的預設群組（is_default=true），不可刪除 |
| 群組性質 | 個人（每人只看得到自己的） |
| 卡片星號行為 | 按下 = 加入/移除「我的關注」群組（is_default=true 那個） |
| 批次替換觸發點 | Method B：從群組 Panel 內展開群組後，點料卡旁的「⇄」按鈕觸發 |
| 手機呈現 | Bottom Drawer，佔螢幕 75–85% 高 |
| 需要手動執行 SQL | `_開發檔案/sql/add-groups.sql` |

---

## Schema 異動

```sql
-- 1. 使用者群組表
CREATE TABLE user_groups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT false,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own groups"
  ON user_groups FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. 群組料卡關聯表
CREATE TABLE group_items (
  group_id     UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, equipment_id)
);

ALTER TABLE group_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own group items"
  ON group_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_groups.id = group_items.group_id
        AND user_groups.user_id = auth.uid()
    )
  );

-- 3. 遷移現有 user_bookmarks → group_items
-- 對每個有 bookmark 的 user，建立 is_default=true 群組，再把 bookmarks 搬過去
-- （由 API Route 在第一次呼叫時懶遷移，或用以下一次性 SQL 執行）
INSERT INTO user_groups (user_id, name, is_default)
SELECT DISTINCT user_id, '我的關注', true
FROM user_bookmarks
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO group_items (group_id, equipment_id, added_at)
SELECT ug.id, ub.equipment_id, ub.created_at
FROM user_bookmarks ub
JOIN user_groups ug ON ug.user_id = ub.user_id AND ug.is_default = true
ON CONFLICT DO NOTHING;
```

SQL 存放：`_開發檔案/sql/add-groups.sql`

---

## API Routes

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/groups` | 取得當前使用者所有群組（含 items） |
| POST | `/api/groups` | 新增群組（body: `{name}` ） |
| PATCH | `/api/groups/[id]` | 重命名群組（body: `{name}` ） |
| DELETE | `/api/groups/[id]` | 刪除群組（is_default=true 不允許刪除） |
| POST | `/api/groups/[id]/items` | 加入料卡（body: `{equipment_id}` ） |
| DELETE | `/api/groups/[id]/items/[equipmentId]` | 移除料卡 |
| POST | `/api/groups/replace` | 跨群組批次替換（見下方） |

### POST /api/groups/replace

```typescript
// Request body
{
  old_equipment_id: string,
  new_equipment_id: string,
  group_ids: string[]  // 要替換的群組 id 清單
}

// 邏輯：
// 1. 確認 group_ids 都屬於 auth.uid()
// 2. DELETE group_items WHERE group_id IN group_ids AND equipment_id = old_equipment_id
// 3. INSERT group_items (group_id, equipment_id) 各 group_id + new_equipment_id
// 4. ON CONFLICT DO NOTHING（新料卡本來就在群組裡也不報錯）
```

### 懶遷移策略

GET `/api/groups` 被呼叫時，若該使用者沒有任何 user_groups，自動：
1. 查詢 user_bookmarks 中該使用者的所有書籤
2. 建立 is_default=true 的「我的關注」群組
3. 把書籤全部搬進 group_items
4. 回傳群組資料

這樣不需要一次性跑大量遷移 SQL，使用者第一次打開 Panel 時自動遷移。

---

## 前端設計

### Panel 入口

- 現有星號 badge（右上角）改為開啟 GroupsPanel
- Badge 數字 = 使用者的 is_default 群組的料卡數量

### GroupsPanel 元件（新建）

位置：`src/components/GroupsPanel.tsx`

```
桌面（≥ md）               手機（< md）
右側固定 Panel，            從底部滑上的 Bottom Drawer
280–320px 寬               佔螢幕 75–85% 高
overlay 但不遮主頁面         有拖動 handle
```

**Panel 內容結構**：

```
╔══════════════════════╗
║ 我的群組        [✕]  ║
╠══════════════════════╣
║ ★ 我的關注   12 筆 ▼ ║  ← is_default，永遠第一
║   [縮圖] 1000101 … ⇄ ║
║   [縮圖] 1000203 … ⇄ ║
╠══════════════════════╣
║ 群組 A         3 筆 ▶ ║  ← 折疊
╠══════════════════════╣
║ 群組 B         5 筆 ▶ ║  ← 折疊
╠══════════════════════╣
║ [＋ 新增群組]         ║
╚══════════════════════╝
```

每筆料卡顯示：縮圖（40×40）+ 料號 + 品名（單行截斷） + 右側「⇄」替換按鈕

### 批次替換彈窗

點擊「⇄」後，出現 Dialog：

```
替換「{料卡名稱}」

搜尋新料卡  [輸入料號或品名...]
           ○ 1000202 – EDR-200 新款
           ● 1000300 – TID-90 升級版  ← 選取

此料卡同時存在於：
  ☑ 我的關注（目前開啟）
  ☑ 群組 A
  ☑ 群組 B

[取消]  [確認替換]
```

- 預設全勾，可取消個別群組
- 新料卡搜尋：使用 Fuse.js 在 initialCards 中搜尋
- 確認後呼叫 POST /api/groups/replace

### 星號行為更新

`EquipmentCardItem.tsx` 和 `PhotoWall.tsx` 的 `onToggleBookmark` 行為：
- 按下 = 呼叫 POST `/api/groups/[defaultGroupId]/items`（或 DELETE）
- `bookmarkedIds` state 改從 `group_items` 計算（is_default 群組的 equipment_ids）

### page.tsx 異動

```typescript
// 原本
const bookmarks = await getUserBookmarks(userId)

// 改為
const groups = await getUserGroups(userId)
// getUserGroups 包含懶遷移邏輯
```

傳給 PhotoWall 的 props：`groups` 取代 `initialBookmarks`

---

## 驗收標準

- [ ] 打開 Panel 看到所有群組，我的關注永遠第一
- [ ] 展開群組可看到料卡縮圖列表
- [ ] 新增/刪除/重命名群組正常運作
- [ ] 我的關注不能被刪除（刪除按鈕不顯示）
- [ ] 卡片星號切換仍然有 Optimistic Update
- [ ] 跨群組替換：選新料卡 + 勾選群組 → 確認後所有指定群組完成替換
- [ ] 舊的 user_bookmarks 資料在第一次開 Panel 時自動遷移
- [ ] 手機 Bottom Drawer 正常顯示
- [ ] `npm run build` 通過

## 委派指示

```
委派給：data（API routes + SQL） + frontend（GroupsPanel + 前端邏輯）並行
告知：Step 18，需新建 user_groups 和 group_items 資料表、SQL 存 _開發檔案/sql/add-groups.sql、
      API routes 在 src/app/api/groups/ 下建立、GroupsPanel 元件在 src/components/GroupsPanel.tsx
規格文件：_管理/01_equipment-cards/specs/step18-groups-system.md
SQL 執行：需提醒使用者在 Supabase Dashboard 執行 add-groups.sql
完成後：tester 驗收 → reviewer 審查
```
