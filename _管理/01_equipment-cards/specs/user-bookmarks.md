# Step 13 規格：個人備忘板（user_bookmarks）

## 功能描述

每個使用者都有自己的私人備忘空間，可以標記料卡、記錄個人備註。其他使用者（包含管理員）完全看不到。

## 隱私設計

- Supabase RLS 確保資料隔離：每筆 bookmark 只有 `user_id === auth.uid()` 才能讀/寫
- 管理員也不例外（不設後門）
- UI 上明顯標示「此區為您的私人空間」

## Schema 異動

```sql
CREATE TABLE user_bookmarks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, equipment_id)
);

ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own bookmarks"
  ON user_bookmarks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

SQL 存放：`_開發檔案/sql/add-user-bookmarks.sql`

## API Routes

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/bookmarks` | 取得當前使用者的所有 bookmarks |
| POST | `/api/bookmarks` | 新增 bookmark（body: equipment_id, notes?） |
| PUT | `/api/bookmarks/[id]` | 更新個人備註 |
| DELETE | `/api/bookmarks/[id]` | 刪除 bookmark |

## UI 設計

### 主頁（PhotoWall.tsx）
- 頂部新增「我的關注」頁籤（僅登入後可見）
- 點擊後顯示已標記的料卡清單 + 個人備註
- 區塊顯示說明：「⭐ 此區為您的私人空間，其他人（包含管理員）看不到您的標記與備註」

### 料卡細節 Dialog（CardDetailDialog.tsx）
- 右上角加「⭐」按鈕，切換加入/移除個人關注
- 已加入時顯示 filled star，可在此區編輯個人備註

### 個人備註搜尋
- 「我的關注」頁籤內有獨立搜尋框，搜尋 notes 內容（Fuse.js，僅在個人 bookmarks 範圍內）

## 驗收標準

- 使用者 A 標記的料卡，使用者 B 登入後看不到
- 管理員查看資料庫必須繞過 RLS 才能看到（正常 client 看不到）
- 主頁「我的關注」頁籤顯示已標記料卡 + 個人備註
- 可搜尋個人備註內容
- 刪除料卡時，相關 bookmarks 自動刪除（ON DELETE CASCADE）
