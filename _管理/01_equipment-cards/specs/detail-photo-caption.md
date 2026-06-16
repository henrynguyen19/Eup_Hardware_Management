# Step 11 規格：細節圖 caption 說明

## 功能描述

為每張細節圖加入說明文字（caption），讓使用者了解圖片內容（例如：被迭代的舊版設備、淨重標貼）。

## Schema 異動

`detail_photos` 欄位格式由：
```json
[{"public_id": "...", "url": "..."}]
```
擴展為：
```json
[{"public_id": "...", "url": "...", "caption": "第一代 2022年版（已停產）"}]
```

**不需 ALTER TABLE**，JSONB 欄位直接加子欄位，舊資料讀取時 caption 為 undefined，顯示時預設為空。

## TypeScript 型別異動

```typescript
// src/types/equipment.ts
export interface DetailPhoto {
  public_id: string
  url: string
  caption?: string   // 新增
}
```

## UI 異動

### CardDetailDialog.tsx
- 顯示當前細節圖的 caption（若有）
- 位置：照片左下角 overlay 或縮圖標籤下方
- 「淨重」caption 可加特殊圖示（如秤重icon）

### CardFormDialog.tsx（管理員）
- 每張細節圖旁加 caption 輸入框
- 上傳新圖時也可填 caption

## 驗收標準

- 有 caption 的細節圖在 Dialog 中正確顯示說明文字
- 無 caption 的圖片不顯示空白說明區塊
- 管理員可在編輯表單為每張細節圖填寫或修改 caption
- 舊資料（無 caption）正常顯示，無 undefined 錯誤
