# Step 16 規格：ESG 淨重照片標記

## 功能描述

為每張料卡新增「淨重（kg）」欄位與「淨重照片」，供 ESG 合規使用。
淨重照片為獨立欄位（非 detail_photos 陣列），方便報表查詢。

---

## Schema 異動

```sql
ALTER TABLE equipment_cards
  ADD COLUMN IF NOT EXISTS net_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_photo TEXT,
  ADD COLUMN IF NOT EXISTS weight_photo_public_id TEXT;
```

檔案：`_開發檔案/sql/add-net-weight.sql`
執行方式：Supabase Dashboard → SQL Editor（手動）

---

## TypeScript 型別（src/types/equipment.ts）

```typescript
export interface EquipmentCard {
  // ... 既有欄位 ...
  net_weight: number | null        // 新增
  weight_photo: string | null      // 新增（Cloudinary URL）
  weight_photo_public_id: string | null  // 新增
}
```

---

## API 異動

### POST /api/cards
- insert 加入 `net_weight: net_weight ?? null`

### PATCH /api/cards/[id]
- update 加入 `net_weight: typeof net_weight === 'number' ? net_weight : null`
- 新增 weight photo 刪除邏輯：若 body 帶 `delete_weight_photo: true`，呼叫 Cloudinary destroy + 清空欄位

### DELETE /api/cards/[id]
- Cloudinary 清除清單加入 `weight_photo_public_id`

### PATCH /api/upload
- 新增 `type: 'weight'` 分支：更新 `weight_photo` + `weight_photo_public_id`

### POST /api/cards/batch（改為 upsert）
- 既有料號 → UPDATE（只更新有提供的欄位，含 `net_weight`）
- 新料號 → INSERT
- 回傳格式加入 `updated` 數量：`{ inserted, updated, skipped, errors }`

---

## 前端異動

### CardFormDialog.tsx
- 新增「淨重（kg）」number input（允許小數，例：0.38）
- 新增「淨重照片」單張上傳（與主圖相同模式）
  - state: `weightPhotoFile`, `weightPhotoPreview`, `deleteWeightPhotoPending`
  - 上傳後呼叫 PATCH /api/upload（type: 'weight'）
  - 刪除時 body 帶 `delete_weight_photo: true` 至 PATCH /api/cards/[id]

### CardDetailDialog.tsx
- 資訊欄加入「淨重」列：`⚖ X kg`（若有值）
- 淨重照片加入相片輪播，label 標示「淨重照」

### BatchImportDialog.tsx
- CSV 解析改為 **header-based**（讀第一列 header，依名稱對應欄位）
  - 支援中英文 header：`net_weight` 或 `淨重`（公斤）
  - 其餘欄位 header：`equipment_id/料號`, `name/品名`, `category/分類`, `vendor/廠商`, `status/狀態`, `tags/標籤`, `notes/備註`
- `ParsedRow` 介面加入 `net_weight?: number`
- 預覽表格加入淨重欄
- 匯入結果顯示「新增 X 筆、更新 Y 筆、錯誤 Z 筆」

---

## 批次照片腳本（Phase 2，等照片提供後）

- 位置：`_開發檔案/scripts/upload-weight-photos.js`
- 邏輯：讀資料夾 → 取檔名第一段（空格 or 底線前）為料號 → 上傳 Cloudinary → PATCH /api/upload（type: 'weight'）
- 等照片提供後確認檔名規則再執行

---

## 驗收標準

- `npm run build` 通過
- 管理員可在編輯表單填寫淨重值並上傳淨重照
- CardDetailDialog 正確顯示淨重值與淨重照
- BatchImportDialog CSV 可包含淨重欄位（選填），upsert 正確運作
- 舊資料（無淨重欄位）正常顯示，無 undefined 錯誤
