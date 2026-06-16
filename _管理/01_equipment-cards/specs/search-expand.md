# Step 15 規格：模糊搜尋擴充

## 功能描述

在現有 Fuse.js 搜尋 keys 中新增 `category` 和 `documents[].name`，讓搜尋更完整。

## 現有搜尋 Keys

```typescript
keys: [
  { name: 'equipment_id', weight: 2 },
  { name: 'name',         weight: 2 },
  { name: 'vendor',       weight: 1 },
  { name: 'tags',         weight: 1 },
  { name: 'notes',        weight: 0.5 },
]
```

## 新增 Keys

```typescript
// 新增以下兩項
{ name: 'category',          weight: 0.5 },
{ name: 'documents.name',    weight: 0.5 },  // Step 12 完成後加入
```

## 說明

- `category`：讓使用者輸入「螢幕」也能命中分類（目前只靠品名比對）
- `documents.name`：文件名稱可搜尋（待 Step 12 文件功能完成後加）

## 異動位置

`src/components/PhotoWall.tsx`，`useMemo` 中的 `fuse` 設定。

## 驗收標準

- 搜尋「螢幕」能命中 category=螢幕 的料卡
- Step 12 完成後，搜尋規格書名稱關鍵字能找到對應料卡
