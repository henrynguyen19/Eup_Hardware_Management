# Step 22 規格：追蹤板體驗優化（8 項修正）

> 來源：2026-06-07 需求討論
> 前置條件：Step 21 已完成

---

## ⛔ 實作範圍限制

**本 Step 只做指定修正，不做其他改動。**

### 【禁止觸碰】以下檔案不得有任何修改

| 檔案 | 原因 |
|------|------|
| `src/components/PhotoWall.tsx` | 除下方明確允許的單行改動外，其餘不得碰 |
| `src/components/CardFormDialog.tsx` | 不涉及本 Step |
| `src/components/CardDetailDialog.tsx` | 不涉及本 Step |
| `src/components/EquipmentCardItem.tsx` | 不涉及本 Step |
| `src/components/BatchImportDialog.tsx` | 不涉及本 Step |
| `src/app/page.tsx` | 不涉及本 Step |
| `src/lib/supabase-server.ts` | 不動 |
| `src/lib/supabase-browser.ts` | 不動 |
| `src/lib/utils.ts` | 不動 |

### 【允許修改的既有檔案】僅以下 5 個，且只能做指定範圍的修改

| 檔案 | 允許的修改範圍 |
|------|-------------|
| `src/app/tracker/TrackerClient.tsx` | 修正 #1：myPendingCount 與 my tab 過濾邏輯；修正 #5：PRIORITY_LABEL |
| `src/components/IssueDetailDialog.tsx` | 修正 #2：skeleton；修正 #3：textarea 不 disabled；修正 #5：PRIORITY_LABEL |
| `src/components/EditIssueDialog.tsx` | 修正 #4：SettingsPopover；修正 #5：priority 選項；修正 #7：樂觀更新 |
| `src/components/NewIssueDialog.tsx` | 修正 #5：priority 選項 label |
| `src/components/PhotoWall.tsx` | 修正 #9：**僅**在 tracker tab 的 onClick 加 `router.refresh()`，不得改動任何其他邏輯或樣式 |

---

## 修正項目明細

### #1 + #8 — 我的任務計數修正（`TrackerClient.tsx`）

**問題**：`myPendingCount` 與 `my` tab 過濾同時包含 `created_by === userEmail`，但「我的任務」定義為「被指派的任務」。

**修正**：
```diff
- (i.assignee_emails.includes(userEmail) || i.created_by === userEmail)
+ i.assignee_emails.includes(userEmail)
```

影響兩處：`filteredIssues`（activeTab === 'my' 分支）與 `myPendingCount`。

---

### #2 — 更新紀錄 Skeleton（`IssueDetailDialog.tsx`）

**問題**：Dialog 打開後顯示「載入中…」spinner，體感上 Dialog 卡住。

**修正**：
- 將 `loadingUpdates` 時的 UI 改為 **skeleton placeholder**（2-3 行灰色方塊動畫）
- Dialog 立即顯示所有內容，只有更新紀錄區域顯示 skeleton
- Skeleton 樣式：`animate-pulse` + `rounded bg-[rgba(122,82,48,.08)]` 灰色區塊

---

### #3 — 送出更新後 textarea 不被 disabled（`IssueDetailDialog.tsx`）

**問題**：送出中 `disabled={submittingUpdate}` 使 textarea 無法輸入，體感延遲。

**修正**：
- 移除 textarea 的 `disabled={submittingUpdate}`
- 樂觀更新已讓訊息立即出現，textarea 清空後使用者可馬上繼續輸入
- 送出按鈕維持 spinner（視覺回饋），但不阻擋輸入

---

### #4 — 類型 SettingsPopover（`EditIssueDialog.tsx`）

**問題**：編輯議題的類型下拉固定，無法從 UI 增減。

**修正**：
- 加 `localIssueTypes` state（初始值 = `issueTypes` prop）
- 類型 label 旁加 `<SettingsPopover settingKey="issueTypes" items={localIssueTypes} onConfirm={...} />`
- 確認後更新 `localIssueTypes`（SettingsPopover 內部已處理 `app_settings` 寫入）
- 下拉選項改用 `localIssueTypes`

> 注意：`SettingsPopover` 的 `settingKey` 型別已支援 `'issueTypes'`（見 `SettingsPopover.tsx:7`）

---

### #5 — 優先度標籤統一（4 個檔案）

**問題**：目前 `high→緊急`、`medium→中`、`low→低`，不一致。

**修正**：全部統一為 `high→緊急`、`medium→重要`、`low→普通`

| 檔案 | 修改位置 |
|------|---------|
| `TrackerClient.tsx` | `PRIORITY_LABEL` |
| `IssueDetailDialog.tsx` | `PRIORITY_LABEL` |
| `EditIssueDialog.tsx` | priority `<option>` 的文字 |
| `NewIssueDialog.tsx` | priority `<option>` 的文字 |

DB 欄位值（`'high'`/`'medium'`/`'low'`）不改，只改顯示文字。

---

### #7 — 編輯儲存樂觀更新（`EditIssueDialog.tsx`）

**問題**：按儲存後 dialog 停留並顯示 spinner，等 API 回應才關閉。

**修正**：
1. 按儲存後立即用表單現值組出 `optimisticIssue` 物件
2. 呼叫 `onUpdated(optimisticIssue)` 並 `onClose()`（立即關閉）
3. API 在背景繼續跑
4. API 失敗時：呼叫 `onUpdated(originalIssue)` 還原（靜默還原，原始 issue 需在 handleSubmit 開始時儲存）

> 失敗策略：靜默還原，不新增 toast 系統（避免過度複雜）

---

### #9 — Tracker Tab 切換即時性（`PhotoWall.tsx`）

**問題**：切換到其他 tab 再切回追蹤板，client state 重置，需重整才顯示最新資料。

**修正**：
- 在追蹤板 tab 的 `onClick` handler 加 `router.refresh()`
- 效果：點擊追蹤板 tab → Next.js soft refresh → 從 DB 重拉最新資料 → TrackerClient 以最新 `initialIssues` 重新掛載
- 僅改 onClick，不改任何樣式或其他邏輯

---

## 完成標準

1. `npm run build` 通過，無 TypeScript 錯誤
2. 「我的任務」badge 數字只計算被指派的未完成議題
3. 打開 IssueDetailDialog 時更新紀錄區顯示 skeleton，不阻塞 dialog 顯示
4. 送出更新紀錄後 textarea 立即可再輸入
5. EditIssueDialog 類型欄位旁有齒輪，可增減類型
6. 三個地方（篩選器、detail、edit）優先度均顯示「緊急/重要/普通」
7. EditIssueDialog 按儲存後立即關閉
8. 切換到追蹤板 tab 時資料是最新的（不需手動重整）
