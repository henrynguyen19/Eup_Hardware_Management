# Step 17 規格：快速修正

> 來源：2026-05-27 需求討論，四個獨立 bug fix，不依賴 Step 18/19。

## 修正項目總覽

| # | 問題 | 影響檔案 | 修法 |
|---|------|---------|------|
| 1 | 星星圖示跑版 | `EquipmentCardItem.tsx` | button 加 h-full + flex flex-col |
| 2 | 星星操作延遲 | `PhotoWall.tsx` | Optimistic Update |
| 3 | 計數文字語意不清 | `PhotoWall.tsx` | 改顯示文字 |
| 4 | 無主圖料卡難以找到 | `PhotoWall.tsx` | 管理員限定篩選按鈕 |

---

## 修正 1｜星星位置跑版

**根因**：CSS Grid 同 row 等高機制。`.group.relative` 被撐到最高卡片的高度，但 `button` 沒有 `h-full`，不填滿容器。星星用 `absolute bottom-1.5 right-1.5` 定位在容器底部，對短名字的卡片來說，星星會落在 button 內容區下方的空白。

**修法**：`EquipmentCardItem.tsx` 的 `<button>` 元素加上 `h-full flex flex-col`。資訊區 `<div className="p-2.5">` 不需改動，`flex-col` 會讓資訊區在 button 底部對齊。

```tsx
// Before
<button className={`bg-white rounded-xl border overflow-hidden ...`}>

// After
<button className={`bg-white rounded-xl border overflow-hidden h-full flex flex-col ...`}>
```

---

## 修正 2｜星星操作延遲

**根因**：目前流程是「呼叫 API → 等回應 → 更新 state」，網路延遲導致使用者以為功能壞掉。

**修法**：Optimistic Update in `PhotoWall.tsx`。

```typescript
// handleToggleBookmark（示意）
async function handleToggleBookmark(equipmentId: string) {
  // 1. 先翻 local state
  setBookmarkedIds(prev => {
    const next = new Set(prev)
    if (next.has(equipmentId)) next.delete(equipmentId)
    else next.add(equipmentId)
    return next
  })

  // 2. 背景呼叫 API
  try {
    const isCurrentlyBookmarked = bookmarkedIds.has(equipmentId)
    if (isCurrentlyBookmarked) {
      await fetch(`/api/bookmarks`, { method: 'DELETE', body: JSON.stringify({ equipment_id: equipmentId }) })
    } else {
      await fetch(`/api/bookmarks`, { method: 'POST', body: JSON.stringify({ equipment_id: equipmentId }) })
    }
  } catch {
    // 3. API 失敗才 rollback
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      if (next.has(equipmentId)) next.delete(equipmentId)
      else next.add(equipmentId)
      return next
    })
  }
}
```

注意：Step 18 完成後 API route 會從 `/api/bookmarks` 改為 `/api/groups`，屆時一併更新。

---

## 修正 3｜計數文字

**位置**：`PhotoWall.tsx` 的結果數量顯示段落。

```tsx
// Before
顯示 {filtered.length} / {initialCards.length} 筆

// After
共 {filtered.length} / {initialCards.length} 筆料卡
```

---

## 修正 4｜無主圖篩選（管理員限定）

**位置**：`PhotoWall.tsx` 的篩選列，僅 `isAdmin === true` 時顯示。

在現有篩選 chips 後方加一個新 chip：

```tsx
{isAdmin && (
  <button
    onClick={() => setNoPhotoFilter(v => !v)}
    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
      noPhotoFilter
        ? 'bg-[#7a5230] text-white border-[#7a5230]'
        : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)]'
    }`}
  >
    無主圖
  </button>
)}
```

新增 state：`const [noPhotoFilter, setNoPhotoFilter] = useState(false)`

`filtered` 的 useMemo 加上條件：
```typescript
if (noPhotoFilter) result = result.filter(c => !c.main_photo)
```

`clearFilters` 也要重置：`setNoPhotoFilter(false)`

`hasActiveFilters` 也要納入：`|| noPhotoFilter`

---

## 驗收標準

- [ ] 同 row 不同名稱長度的料卡，星星位置統一在資訊區右下角
- [ ] 按星星後立即切換填滿/空心，不等 API 回應
- [ ] 篩選列顯示「無主圖」按鈕（管理員登入後才出現）
- [ ] 「無主圖」篩選啟用後，只顯示沒有主圖的料卡
- [ ] 計數顯示改為「共 X / Y 筆料卡」
- [ ] `npm run build` 通過

## 委派指示

```
委派給：frontend
告知：Step 17 Quick Fixes，修改 src/components/EquipmentCardItem.tsx 和 src/components/PhotoWall.tsx
規格文件：_管理/01_equipment-cards/specs/step17-quick-fixes.md
完成後：tester 驗收
```
