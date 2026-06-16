# CLAUDE.md — 設備料卡管理系統（D 型專案執行）

此檔案供 Claude Code 全程使用，涵蓋討論、決策、執行委派、文件維護。
實際程式執行由子 Agent 負責（`.claude/agents/`）。

---

## 專案規格

- **產品名稱**：設備料卡管理系統（Equipment Cards）
- **核心功能**：部門設備照片牆與管理後台，取代過大的 Excel 設備清單
- **目標使用者**：公司內部 @eup.com.tw，10–50 人，786 筆料卡
- **最在意的面向**：使用體驗 + 維護便利性

### 技術架構

- **前端**：Next.js 14 App Router + Tailwind CSS + shadcn/ui + Fuse.js
- **資料庫/Auth**：Supabase（PostgreSQL + Google OAuth + RLS）
- **照片儲存**：Cloudinary（免費 25GB，`dnqtafoh6`）
- **部署**：Vercel Hobby（`equipment-cards` 專案，push 即自動部署）
- **選型原因**：Supabase 免費且不需信用卡；Cloudinary 25GB 比 R2 10GB 大；Vercel + Next.js 同廠商零障礙
- **排除選項**：Cloudflare R2（需信用卡，10GB 上限）、Firebase（比 Supabase 複雜）

### 服務帳號速查

| 服務 | 網址 / 識別 |
|------|------------|
| **GitHub** | https://github.com/homejay-eup/equipment-cards |
| **Vercel** | https://vercel.com/hjs-projects-bc94d0b2/equipment-cards |
| **Supabase** | 專案 `ntapfguwmuufnlafroxs` |
| **Cloudinary** | Cloud Name: `dnqtafoh6` |
| **線上網址** | https://equipment-cards.vercel.app |

### 專案結構

```
設備料卡/
├── CLAUDE.md                          ← 本檔案
├── middleware.ts                      ← 路由保護（cookie 檢查）
├── .env.local                         ← 環境變數（勿 commit）
├── .claude/
│   └── agents/                        ← 子 Agent 定義
│       ├── frontend.md
│       ├── data.md
│       ├── tester.md
│       └── reviewer.md
├── _管理/
│   ├── 00_專案索引.md                 ← 必讀：步驟狀態總覽
│   ├── 00_方案紀錄.md                 ← 按需讀：決策依據
│   ├── 00_執行紀錄.md                 ← 按需讀：試做結果
│   ├── 00_待整理清單.md               ← 暫存用
│   └── 01_equipment-cards/
│       ├── 00_專案概覽.md             ← Step 清單與狀態
│       ├── specs/                     ← 功能規格文件
│       └── archived/                  ← 舊版步驟冊
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   ← 首頁（驗證 session + 查詢角色）
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── auth/callback/route.ts
│   │   ├── admin/users/               ← 帳號管理
│   │   └── api/
│   │       ├── upload/                ← 照片上傳/刪除
│   │       └── cards/                 ← 料卡 CRUD
│   ├── components/
│   │   ├── PhotoWall.tsx              ← 主頁（搜尋+篩選+網格）
│   │   ├── EquipmentCardItem.tsx      ← 單張卡片縮圖
│   │   ├── CardDetailDialog.tsx       ← 細節 Lightbox（照片輪播）
│   │   ├── CardFormDialog.tsx         ← 新增/編輯料卡 Dialog
│   │   ├── BatchImportDialog.tsx      ← CSV 批次匯入
│   │   ├── ConfirmDialog.tsx          ← 破壞性操作確認
│   │   ├── UserMenu.tsx               ← Header 右上角
│   │   └── ui/                        ← shadcn/ui 元件
│   ├── hooks/usePhotoUpload.ts
│   ├── lib/
│   │   ├── supabase-server.ts
│   │   ├── supabase-browser.ts
│   │   ├── admin.ts                   ← requireAdmin() / getUserRole()
│   │   └── utils.ts
│   └── types/equipment.ts             ← EquipmentCard / AppSettings 型別
├── _開發檔案/scripts/                 ← 一次性輔助腳本
└── 設備線材_照片Jason/                ← 分類資料夾（本機，不進 git）
```

### 目前進度

- **已完成**：Step 1–23（2026-04-27 至 2026-06-08）
- **待執行**：待需求討論
- **目前 git HEAD**：`dd50788`（Steps 1–23 均已包含）
- **Step 16 Phase 2 待執行**：批次淨重照片上傳腳本（等照片提供後）
- **重要**：Step 20 執行時必須嚴守 `_管理/01_equipment-cards/specs/step20-tracker.md` 的「⛔ 核心保護原則」，現有版面功能風格一律不得改動

### 規範與約定

- 命名規則：TypeScript 檔案 `PascalCase`（元件）/ `camelCase`（hooks/lib）
- UI 語言：繁體中文
- 主題色：`#7a5230`（木質暖棕）、背景 `#faf6f0`、強調 `#c49a72`
- **不要動的東西**：`.env.local`（含所有金鑰）、`設備線材_照片Jason/`（原始資料）

#### 核心既有元件保護原則（強制）

**這條規則是針對「新功能實作」的範圍限制，不是永久凍結。** 若有新需求或優化要調整現有元件，在該 Step 的規格中明確說明即可。

新功能實作時，**未在規格中明確列出的既有元件一律不得修改**：

| 元件 | 說明 |
|------|------|
| `src/components/PhotoWall.tsx` | 主頁照片牆 |
| `src/components/EquipmentCardItem.tsx` | 卡片縮圖 |
| `src/components/CardDetailDialog.tsx` | Lightbox |
| `src/components/CardFormDialog.tsx` | 新增/編輯料卡 |
| `src/components/BatchImportDialog.tsx` | CSV 匯入 |
| `src/app/page.tsx` | 首頁入口 |

**允許的最小侵入**（需在規格中明確列出）：
- 加新 prop，且必須有預設值不破壞現有呼叫端
- 加一個入口連結或圖示，不改變版面結構

**未列在規格的既有元件，禁止**：
- 改 className / 樣式
- 改現有 handler 邏輯
- 改 layout 結構
- 新增影響既有功能的 state

**新功能優先走獨立路由**：新頁面開新路由（如 `/tracker`、`/groups`），現有頁面只加一個入口連結，不動內部邏輯。

#### 根目錄使用原則

根目錄只允許：
- 設定檔（`package.json`、`next.config.mjs`、`tsconfig.json`、`.env.local` 等）— **必須在根目錄**
- `src/`、`public/`
- `CLAUDE.md`、`.claude/`
- `_管理/`、`_開發檔案/`

#### 檔案放置規則

| 類型 | 位置 |
|------|------|
| 頁面 | `src/app/`（路徑即 URL，不可移動） |
| 共用元件 | `src/components/` |
| shadcn/ui | `src/components/ui/` |
| 自訂 hooks | `src/hooks/` |
| 工具/API Client | `src/lib/` |
| TypeScript 型別 | `src/types/` |
| API Routes | `src/app/api/` |
| 一次性腳本 | `_開發檔案/scripts/` |
| Schema SQL | `_開發檔案/sql/` |
| 規格文件 | `_管理/01_equipment-cards/specs/` |
| **不確定時** | 停下來問，不擅自建立新資料夾 |

### 完成標準

- 每個功能完成後 `npm run build` 必須通過
- 不確定時先問，不要自行假設
- 照片操作採暫存機制（按儲存才呼叫 Cloudinary API）
- 破壞性操作必須使用 `ConfirmDialog`，不用原生 `confirm()`
- **PR 合併前**：主 Agent 必須列出所有**修改過的既有檔案**，每個改動說明理由；若有核心保護元件被改動，必須先取得使用者確認才能繼續

### 已知問題 / 技術債

- `useSearchParams()` 必須包在 `<Suspense>` 內（否則 build 失敗）
- 三元運算式不能當 statement（ESLint `no-unused-expressions`，已踩過 3 次）
- shadcn/ui Popover 在 overflow:hidden 父容器需改 fixed 定位
- Fuse.js 純數字查詢要走 `includes`，不走模糊算法

---

## 此次任務（每次新對話時更新，執行完後清空）

（空白）

---

## 啟動行為

每次對話開始時：

1. 依優先順序讀取常駐檔：
   - **必讀**：`_管理/00_專案索引.md`、`_管理/01_equipment-cards/00_專案概覽.md`
   - **按需讀**：`_管理/00_方案紀錄.md`、`_管理/00_執行紀錄.md`
   - **暫存用**：`_管理/00_待整理清單.md`
2. 讀取「專案規格」與「此次任務」區塊
3. 簡要告知目前進度（走到第幾步、各步驟狀態、上次執行結果）
4. 詢問本次要做什麼

---

## 工作流程

1. **啟動** → 讀常駐檔、報告進度、確認本次任務類型
2. **腦力激盪階段**（主 session，不委派子 Agent）：
   - 模糊概念 → 列選項優缺點後收斂
   - 已有具體方案 → 評估優缺點，提出替代做法
   - 技術選型 → 列選項優缺點與成本，確認後更新「技術架構」
3. **逐步引導討論**：每次只問一個問題
4. 討論告一段落時主動詢問：「要把以上討論整理並更新到常駐檔嗎？」確認後更新
5. **執行前** → 提出「步驟結構與執行摘要」，確認後才委派子 Agent
6. **委派執行** → 依任務類型呼叫對應子 Agent
7. 執行結果有問題 → 依迭代規則處理

---

## 子 Agent 委派規則

| 任務類型 | 委派給 | 備註 |
|---|---|---|
| UI 元件、頁面、前端邏輯、樣式 | `frontend` | 告知相關檔案路徑與規格文件 |
| Supabase Schema、API Routes、RLS | `data` | 告知 schema 與操作需求 |
| Build 驗證、功能情境 | `tester` | 告知要測試的功能與完成標準 |
| Code Review、安全性、效能審查 | `reviewer` | tester 通過後呼叫 |

**標準執行順序（新功能）**：
```
frontend／data 執行 → tester 驗證 → reviewer 審查 → 主 Agent 整合回報
```

**委派時必須在規格中明確列出**：
- `【允許新建】`：列出所有新增的檔案路徑
- `【禁止觸碰】`：列出所有不得修改的既有檔案（預設包含核心保護元件）

**不委派的情況**：
- 小幅修改（單檔、10 行以內）
- 純文件更新（常駐檔、.md）

---

## 迭代規則（三類）

**類型 1：當前步驟重來**
1. 舊版移入 `_管理/01_equipment-cards/archived/`
2. 分析原因，記入 `00_執行紀錄.md`
3. 調整做法，重新委派

**類型 2：前步驟決策改變**
1. 確認哪個步驟的決策要改
2. 版號 +1，舊版 archived
3. 確認受影響步驟需要重跑的範圍

**類型 3：整個方案推翻**
1. 所有步驟冊移入 `archived/`
2. 更新方案紀錄與執行紀錄
3. 重新討論，產出新方案

---

## 常駐檔寫入規則（強制）

1. **先讀再寫**：寫入前必須先讀取現有內容，比照格式繼續寫
2. **只能追加**：只能在檔尾追加新條目，不允許重寫整個檔案
   - 例外 1：狀態類欄位允許就地修改
   - 例外 2：使用者明確要求重寫
3. 格式不一致時停下來問

---

## 完成後動作（依序執行）

1. 輸出回報格式（給使用者看）
2. 將執行結果追加至 `_管理/00_執行紀錄.md`
3. 清空「此次任務」區塊，還原為空白模板
4. 更新「目前進度」

**回報格式**：
```
## 執行結果

- 完成項目：
- 產出檔案：（列出所有新建或修改的檔案）
- 遇到的問題：
- 不滿意的點：（若有）
- 建議下一步：
- 已更新常駐檔：
```

---

## CoreBrain 連接

### 路徑宣告

```
知識庫根目錄：  C:\Users\jay10\.claude\CoreBrain\
設備料卡實體：  C:\Users\jay10\.claude\CoreBrain\wiki\entities\equipment-cards-system(設備料卡管理系統).md
Bug 百科：     C:\Users\jay10\.claude\CoreBrain\wiki\analyses\equipment-cards-bugs(Bug百科與教訓).md
技術組合：     C:\Users\jay10\.claude\CoreBrain\wiki\concepts\web-dev\nextjs-supabase-cloudinary-stack(技術組合).md
Auth 踩坑：   C:\Users\jay10\.claude\CoreBrain\wiki\concepts\web-dev\supabase-auth-google-oauth(認證與Google登入).md
Cloudinary：  C:\Users\jay10\.claude\CoreBrain\wiki\concepts\web-dev\cloudinary-photo-management(照片管理).md
```

### 開發前必查

開始新 Step 或技術選型討論前，主動查詢：
- `equipment-cards-bugs` — 有無相關踩坑（必讀）
- `equipment-cards-system` — 現有功能與 schema 狀態
- `wiki/concepts/web-dev/` — 有無相關技術踩坑

### 何時 ingest 到 CoreBrain

| 內容 | 目的地 | 時機 |
|------|--------|------|
| 新功能完成、schema 變更 | `equipment-cards-system` entity | Step 完成後 |
| 新 Bug 或踩坑 | `equipment-cards-bugs` analysis | 發現時 |
| 可複用的技術模式 | `wiki/concepts/web-dev/` | 確認有通用價值時 |

---

## 本機開發

```bash
npm install        # 安裝依賴
npm run dev        # 開發伺服器 → http://localhost:3000
npm run build      # 確認無 build 錯誤
git push           # 自動觸發 Vercel 部署
```

## 回答偏好

- 簡潔，無開場白
- 腦力激盪時主動列出選項優缺點，不替使用者做決定
- 委派前說明要委派給哪個 Agent、做什麼
- 步驟有相依關係時主動提出
- 不確定直接說不知道，不擅自猜測
