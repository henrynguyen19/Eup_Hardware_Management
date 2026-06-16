# Step 12 規格：PDF 文件外部連結

## 功能描述

為每個料卡附加規格書、合約書等文件的外部連結（Google Drive / SharePoint），使用者查詢設備時可直接點開。

## 核心設計決策

**不上傳 PDF 到 Cloudinary**，改用外部連結：
- 檔案已在公司共用資料夾（Google Drive / SharePoint）
- 維護者自行管理檔案，只需將分享連結貼入料卡
- 無額外存儲成本，Cloudinary 25GB 留給照片

## Schema 異動

```sql
ALTER TABLE equipment_cards ADD COLUMN documents JSONB DEFAULT '[]';
```

格式：
```json
[
  {"name": "S168-3G 規格書 v2", "url": "https://drive.google.com/...", "type": "spec"},
  {"name": "採購合約 2024", "url": "https://drive.google.com/...", "type": "contract"}
]
```

| 欄位 | 說明 |
|------|------|
| name | 文件名稱（顯示用） |
| url | 外部連結（Google Drive / SharePoint） |
| type | `spec`（規格書）/ `contract`（合約書）/ `other` |

SQL 存放：`_開發檔案/sql/add-documents.sql`

## TypeScript 型別異動

```typescript
// src/types/equipment.ts
export interface Document {
  name: string
  url: string
  type: 'spec' | 'contract' | 'other'
}
export interface EquipmentCard {
  // ...現有欄位...
  documents: Document[]
}
```

## UI 異動

### CardDetailDialog.tsx
- 在備註區塊下方新增「文件」區塊
- 每個文件顯示：文件名稱 + type badge + 外部連結圖示
- 點擊在新分頁開啟

### CardFormDialog.tsx（管理員）
- 文件列表可新增/刪除
- 每項：名稱輸入、URL 輸入、類型選擇（select）

## 驗收標準

- 有文件的料卡在 Dialog 顯示文件清單
- 點擊文件在新分頁開啟連結
- 管理員可新增/刪除文件
- 舊資料（documents 為 null）顯示空文件區塊或不顯示此區塊
