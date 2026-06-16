# Step 10 規格：時間欄位顯示 + 最後更新人

## 功能描述

在料卡細節 Dialog 中顯示新增時間、最後更新時間，管理員另可看到最後更新人。

## Schema 異動

```sql
-- 新增欄位
ALTER TABLE equipment_cards ADD COLUMN updated_by TEXT;

-- 自動更新 updated_at 的 Trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON equipment_cards
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

SQL 存放：`_開發檔案/sql/add-updated-by.sql`

## API Route 異動

`PUT /api/cards/[id]`：更新時寫入 `updated_by = currentUser.email`

## UI 異動（CardDetailDialog.tsx）

在備註區塊下方新增時間資訊區：
```
新增時間：2026-04-27
最後更新：2026-05-15          ← 所有使用者可見
最後更新人：admin@eup.com.tw  ← 僅 isAdmin === true 時顯示
```

## 欄位說明

| 欄位 | 來源 | 顯示對象 |
|------|------|---------|
| created_at | Supabase 自動填入 | 所有使用者 |
| updated_at | Trigger 自動更新 | 所有使用者 |
| updated_by | API Route 寫入（session email）| 僅管理員 |

## 驗收標準

- CardDetailDialog 手機版和桌機版都顯示 created_at / updated_at
- updated_by 只有 isAdmin 為 true 時顯示
- 編輯儲存後 updated_at 自動更新（trigger 負責）
- 編輯儲存後 updated_by 正確記錄操作者 email
