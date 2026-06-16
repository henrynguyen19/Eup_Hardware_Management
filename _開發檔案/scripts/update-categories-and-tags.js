// update-categories-and-tags.js
// 批次更新所有料卡的分類（category）與標籤（tags）
// 執行指令：node _開發檔案/scripts/update-categories-and-tags.js
// ⚠️ 此腳本會覆蓋所有料卡的 category 和 tags，無法還原

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')

// ─── 環境變數 ───────────────────────────────────────────────
// worktree 裡的 __dirname 需要往上 5 層才到主專案根目錄
// .../設備料卡/.claude/worktrees/epic-varahamihira-ca1466/_開發檔案/scripts → .../設備料卡/
const PROJECT_ROOT = path.join(__dirname, '../../../../../')
const envPath = path.join(PROJECT_ROOT, '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const idx = trimmed.indexOf('=')
  if (idx < 0) return
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
})

const supabase = createClient(
  env['NEXT_PUBLIC_SUPABASE_URL'],
  env['SUPABASE_SERVICE_ROLE_KEY'],
)

// ─── 設定 ────────────────────────────────────────────────────
const PHOTOS_DIR = path.join(PROJECT_ROOT, '_開發檔案/data/photos-categories')

// 跳過（與新分類欄位重疊的資料夾）
const SKIP_FOLDERS = new Set(['主機', '鏡頭', '螢幕', '耗材', '國外設備'])

// 新分類清單（同步更新 app_settings）
const NEW_CATEGORIES = ['主機', '鏡頭', '螢幕', '儲存設備', '配件', '線材', '耗材', '工具', '國外', '其他']

// ─── 分類判斷（依料號開頭 + 品名關鍵字）─────────────────────
function getCategory(equipmentId, name) {
  const prefix = equipmentId.charAt(0)
  const hasToolKeyword = /校正|工具/.test(name)

  if (prefix === '1') return '主機'
  if (prefix === '2') return '鏡頭'
  if (prefix === '3') return '螢幕'
  if (prefix === '4') return '儲存設備'
  if (prefix === '5' || prefix === '6') return '配件'
  if (prefix === '7') return hasToolKeyword ? '工具' : '線材'
  if (prefix === '9') return hasToolKeyword ? '工具' : '耗材'
  return '其他'
}

// ─── 掃描 photos-categories → equipment_id 對應標籤 map ──────
function buildTagsMap() {
  const map = {}

  const folders = fs.readdirSync(PHOTOS_DIR)
  for (const folder of folders) {
    const folderPath = path.join(PHOTOS_DIR, folder)
    if (!fs.statSync(folderPath).isDirectory()) continue

    // 決定此資料夾對應的標籤名稱
    let tagName
    if (folder === '_未分類') {
      tagName = '未分類'
    } else if (SKIP_FOLDERS.has(folder)) {
      continue  // 與分類欄位重疊，跳過
    } else {
      tagName = folder
    }

    // 掃描資料夾內的檔案，提取料號
    let files
    try { files = fs.readdirSync(folderPath) } catch { continue }

    for (const file of files) {
      // 只處理檔案（跳過子資料夾）
      const filePath = path.join(folderPath, file)
      try { if (!fs.statSync(filePath).isFile()) continue } catch { continue }

      // 格式：{equipment_id}_{name}.jpg，料號為第一個 _ 之前的部分
      const underscoreIdx = file.indexOf('_')
      if (underscoreIdx < 1) continue
      const equipmentId = file.slice(0, underscoreIdx)

      if (!map[equipmentId]) map[equipmentId] = []
      if (!map[equipmentId].includes(tagName)) map[equipmentId].push(tagName)
    }
  }

  return map
}

// ─── 主程序 ──────────────────────────────────────────────────
async function main() {
  console.log('Step 1/3 — 掃描 photos-categories 資料夾...')
  const tagsMap = buildTagsMap()

  const taggedCount = Object.keys(tagsMap).length
  const totalTags = Object.values(tagsMap).reduce((s, t) => s + t.length, 0)
  console.log(`  找到 ${taggedCount} 個料號，共 ${totalTags} 筆標籤對應`)

  // ── Step 1：更新 app_settings 分類清單 ──
  console.log('\nStep 2/3 — 更新 app_settings 分類清單...')
  const { error: settingsErr } = await supabase
    .from('app_settings')
    .upsert({ key: 'categories', value: NEW_CATEGORIES }, { onConflict: 'key' })
  if (settingsErr) {
    console.error('  ❌ 更新 app_settings 失敗:', settingsErr.message)
  } else {
    console.log('  ✅ 分類清單已更新為：', NEW_CATEGORIES.join('、'))
  }

  // ── Step 2：批次更新料卡 ──
  console.log('\nStep 3/3 — 批次更新料卡（分類 + 標籤）...')
  const { data: cards, error: fetchErr } = await supabase
    .from('equipment_cards')
    .select('equipment_id, name, category, tags')

  if (fetchErr) {
    console.error('  ❌ 查詢料卡失敗:', fetchErr.message)
    process.exit(1)
  }

  console.log(`  找到 ${cards.length} 張料卡\n`)

  let updated = 0, unchanged = 0, failed = 0

  for (const card of cards) {
    const newCategory = getCategory(card.equipment_id, card.name)
    const newTags = tagsMap[card.equipment_id] || []

    const categoryChanged = card.category !== newCategory
    const tagsChanged = JSON.stringify([...(card.tags || [])].sort()) !== JSON.stringify([...newTags].sort())

    if (!categoryChanged && !tagsChanged) {
      unchanged++
      continue
    }

    const { error: updateErr } = await supabase
      .from('equipment_cards')
      .update({ category: newCategory, tags: newTags })
      .eq('equipment_id', card.equipment_id)

    if (updateErr) {
      console.error(`  ❌ [${card.equipment_id}] ${card.name}: ${updateErr.message}`)
      failed++
    } else {
      const changes = []
      if (categoryChanged) changes.push(`分類: 「${card.category || '無'}」→「${newCategory}」`)
      if (tagsChanged) changes.push(`標籤: [${(card.tags || []).join(', ')}] → [${newTags.join(', ')}]`)
      console.log(`  ✓ [${card.equipment_id}] ${card.name}`)
      changes.forEach(c => console.log(`     ${c}`))
      updated++
    }
  }

  console.log('\n─────────────────────────────────────────')
  console.log(`完成！更新 ${updated} 筆 ／ 略過 ${unchanged} 筆 ／ 失敗 ${failed} 筆`)
  if (failed > 0) console.log('（有失敗項目，請檢查上方錯誤訊息）')
}

main()
