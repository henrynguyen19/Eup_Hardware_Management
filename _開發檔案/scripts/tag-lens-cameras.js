// tag-lens-cameras.js
// 根據品名關鍵字為鏡頭類料卡自動打標
// 執行前請確認已設定 .env.local
// 執行指令：node _開發檔案/scripts/tag-lens-cameras.js
// 執行後請人工確認結果再決定是否接受

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')

// 讀取 .env.local
const envPath = path.join(__dirname, '../../.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=')
  if (key && vals.length) env[key.trim()] = vals.join('=').trim()
})

const supabase = createClient(
  env['NEXT_PUBLIC_SUPABASE_URL'],
  env['SUPABASE_SERVICE_ROLE_KEY'],
)

const TAG_RULES = [
  { keyword: '前', tag: '前鏡' },
  { keyword: '後', tag: '後鏡' },
  { keyword: '左', tag: '左鏡' },
  { keyword: '右', tag: '右鏡' },
  { keyword: '室內', tag: '室內鏡' },
]
const DIRECTION_TAGS = ['前鏡', '後鏡', '左鏡', '右鏡', '室內鏡']

async function main() {
  const { data: lensCards, error } = await supabase
    .from('equipment_cards')
    .select('equipment_id, name, tags')
    .eq('category', '鏡頭')

  if (error) { console.error('查詢失敗', error); process.exit(1) }
  console.log(`找到 ${lensCards.length} 張鏡頭料卡`)

  let updated = 0
  for (const card of lensCards) {
    const newTags = [...(card.tags ?? [])]
    let changed = false

    for (const { keyword, tag } of TAG_RULES) {
      if (card.name.includes(keyword) && !newTags.includes(tag)) {
        newTags.push(tag)
        changed = true
      }
    }

    // 無任何方位標籤 → 加 廣角特殊（供人工確認）
    const hasDirectionTag = newTags.some(t => DIRECTION_TAGS.includes(t))
    if (!hasDirectionTag && !newTags.includes('廣角特殊')) {
      newTags.push('廣角特殊')
      changed = true
    }

    if (changed) {
      const { error: updateErr } = await supabase
        .from('equipment_cards')
        .update({ tags: newTags })
        .eq('equipment_id', card.equipment_id)
      if (updateErr) {
        console.error(`更新失敗 ${card.equipment_id}:`, updateErr)
      } else {
        console.log(`已更新 [${card.equipment_id}] ${card.name} → tags: ${newTags.join(', ')}`)
        updated++
      }
    }
  }

  console.log(`\n完成：共更新 ${updated} / ${lensCards.length} 筆料卡`)
  console.log('請人工確認「廣角特殊」標籤是否正確，如有需要可手動修正。')
}

main()
