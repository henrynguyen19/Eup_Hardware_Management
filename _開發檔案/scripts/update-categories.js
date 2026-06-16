/**
 * update-categories.js
 * 從 設備線材_照片Jason 資料夾結構，批次更新 equipment_cards 的 category + tags
 * 執行：node _開發檔案/scripts/update-categories.js
 */

const fs      = require('fs')
const path    = require('path')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_DIR = path.resolve(__dirname, '../../設備線材_照片Jason')

// ── 資料夾 → category 對應表 ─────────────────────────────────────
const FOLDER_TO_CATEGORY = {
  '主機':       '主機',
  '鏡頭':       '鏡頭',
  '螢幕':       '螢幕',
  '天線':       '天線',
  '儲存卡':     '儲存媒體',
  '攝影機線材': '線材',
  '車機線組':   '線材',
  '轉接線材':   '線材',
  '螢幕線組':   '線材',
  '環保線組':   '線材',
  '溫控線':     '線材',
  'Smart Box':  '線材',   // Smart Box 線組
  'ADAS':       '配件',
  'CAN設備':    '配件',
  'DMS':        '配件',
  'RFID':       '配件',
  '盲區':       '配件',
  '胎壓':       '配件',
  '酒測器':     '配件',
  '酒精鎖':     '配件',
  '血壓計':     '配件',
  '變壓器':     '配件',
  '麥克風、喇叭': '配件',
  '支架、底座': '配件',
  '中租專插':   '配件',
  '轉接頭':     '線材',
  '螺絲、螺帽': '耗材',
  '耗材':       '耗材',
  '校正工具':   '工具',
  '國外設備':   '國外設備',
  '_未分類':    null,       // 跳過
}

// ── 掃描資料夾，建立 equipment_id → {category, tags} 映射 ────────
function walk(dir, parts, result) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      walk(full, [...parts, e.name], result)
    } else if (/\.(jpg|jpeg|png)$/i.test(e.name)) {
      const id = e.name.split('_')[0]
      if (!id) continue

      if (!result[id]) result[id] = { category: null, tags: new Set() }

      const topFolder = parts[0]
      const category  = FOLDER_TO_CATEGORY[topFolder]
      if (category === null) continue      // _未分類 跳過

      // 設定 category（取第一個非 null 值）
      if (!result[id].category && category) {
        result[id].category = category
      }

      // Tags：加入所有有意義的資料夾名稱（排除通用詞）
      const SKIP_TAGS = new Set(['主機', '鏡頭', '螢幕', '天線', '儲存卡',
        '攝影機線材', '車機線組', '轉接線材', '螢幕線組', '環保線組', '溫控線',
        '螺絲、螺帽', '轉接頭', '_未分類', '耗材', '其他', '無料號', '盒子'])

      for (const part of parts) {
        if (!SKIP_TAGS.has(part) && part) {
          result[id].tags.add(part)
        }
      }
    }
  }
}

async function main() {
  console.log('📂 掃描資料夾結構…')
  const idMap = {}
  walk(BASE_DIR, [], idMap)

  const ids = Object.keys(idMap)
  console.log(`✅ 找到 ${ids.length} 筆料卡的分類資訊\n`)

  // 顯示分類統計
  const catCount = {}
  for (const { category } of Object.values(idMap)) {
    const k = category ?? '(未分類)'
    catCount[k] = (catCount[k] || 0) + 1
  }
  console.log('📊 分類統計：')
  Object.entries(catCount).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
    console.log(`   ${k}: ${v} 筆`)
  )
  console.log()

  // 批次更新 Supabase（每次 50 筆）
  const BATCH = 50
  let updated = 0, failed = 0

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const promises = batch.map(id => {
      const { category, tags } = idMap[id]
      return supabase
        .from('equipment_cards')
        .update({
          category: category ?? null,
          tags: [...tags],
          updated_at: new Date().toISOString()
        })
        .eq('equipment_id', id)
        .then(({ error }) => {
          if (error) {
            console.error(`  ❌ ${id}:`, error.message)
            failed++
          } else {
            updated++
          }
        })
    })
    await Promise.all(promises)
    process.stdout.write(`\r🔄 進度：${Math.min(i + BATCH, ids.length)} / ${ids.length}`)
  }

  console.log(`\n\n✅ 完成！成功 ${updated} 筆，失敗 ${failed} 筆`)
}

main().catch(console.error)
