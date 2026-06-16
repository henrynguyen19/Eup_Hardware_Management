/**
 * batch-upload.ts
 * 掃描本地照片 → 上傳 Cloudinary → Upsert Supabase equipment_cards
 *
 * 執行前：
 *   1. 確認 .env.local 填好所有 CLOUDINARY_* 與 SUPABASE_* 變數
 *   2. npm install -D tsx  &&  npm install cloudinary @supabase/supabase-js dotenv
 *   3. npx tsx scripts/batch-upload.ts
 *      （加 --dry-run 只解析不上傳，確認解析結果）
 *
 * 可安全重複執行：已上傳的料卡會跳過（Supabase main_photo 有值即視為已完成）
 */

import * as fs   from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary'
import { createClient } from '@supabase/supabase-js'

// ── 設定 ─────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const MAIN_DIR   = path.resolve(__dirname, '../設備線材_照片')
const DETAIL_DIR = path.resolve(__dirname, '../設備線材_照片_細節')
const FOLDER     = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'equipment-cards'
const DRY_RUN    = process.argv.includes('--dry-run')
const DELAY_MS   = 300   // 每張上傳間隔，避免 Cloudinary rate limit

const LOG_PATH   = path.resolve(__dirname, '../logs/batch-upload.log')

// ── 初始化 SDK ────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── 工具函式 ──────────────────────────────────────────────────

const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', '.ds_store'])
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (SYSTEM_FILES.has(lower)) return false
  return IMAGE_EXTS.has(path.extname(lower))
}

/** 從主照片檔名解析 equipment_id 與 name
 *  格式：{id}_{name}.{ext}   e.g. 1000057_FUHO AHD 4G-DVR(4路)雙SD.jpg
 */
function parseMainFilename(filename: string): { equipment_id: string; name: string } {
  const base = path.basename(filename, path.extname(filename))
  const idx  = base.indexOf('_')
  if (idx === -1) throw new Error(`無法解析主照片檔名：${filename}`)
  return {
    equipment_id: base.substring(0, idx),
    name:         base.substring(idx + 1),
  }
}

/** 從細節照片檔名解析 equipment_id 與 suffix
 *  格式：{id}_{name}_{suffix}.{ext}
 *  由於 name 本身可能含底線，用已知 name map 剝前綴
 *
 *  e.g. 1000057_FUHO AHD 4G-DVR(4路)雙SD_配線_2.jpg
 *       → { equipment_id:'1000057', suffix:'配線_2' }
 */
function parseDetailFilename(
  filename: string,
  nameMap: Map<string, string>,
): { equipment_id: string; suffix: string } {
  const base = path.basename(filename, path.extname(filename))
  const firstUnderscore = base.indexOf('_')
  if (firstUnderscore === -1) throw new Error(`無法解析細節照片檔名：${filename}`)

  const equipment_id = base.substring(0, firstUnderscore)
  const rest         = base.substring(firstUnderscore + 1)  // {name}_{suffix}
  const name         = nameMap.get(equipment_id)

  if (name && rest.startsWith(name + '_')) {
    return { equipment_id, suffix: rest.substring(name.length + 1) }
  }

  // fallback：找不到對應主照片，取最後一段底線後的內容作 suffix
  const parts = rest.split('_')
  const suffix = parts.length > 1 ? parts[parts.length - 1] : rest
  logWarn(`細節照片找不到對應主照片 → ${filename}，使用 suffix=${suffix}`)
  return { equipment_id, suffix }
}

/** 產生 Cloudinary public_id（不含 folder，folder 由上傳參數帶入）
 *  main:   {id}_main
 *  detail: {id}_{suffix}   保留原始後綴，含中文
 */
function makePublicId(equipment_id: string, type: 'main' | string): string {
  return type === 'main'
    ? `${equipment_id}_main`
    : `${equipment_id}_${type}`
}

// ── 日誌 ──────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' })

function log(msg: string)     { const line = `[${new Date().toISOString()}] ${msg}`; console.log(line);  logStream.write(line + '\n') }
function logWarn(msg: string) { const line = `[WARN] ${msg}`;                        console.warn(line); logStream.write(line + '\n') }
function logErr(msg: string)  { const line = `[ERR]  ${msg}`;                        console.error(line);logStream.write(line + '\n') }

// ── 上傳 ──────────────────────────────────────────────────────

function uploadToCloudinary(
  filePath: string,
  public_id: string,
): Promise<UploadApiResponse> {
  // 用 ReadStream + upload_stream，修正 Cloudinary SDK v2 在 Windows 上
  // 無法識別含中文目錄的本地 PNG 路徑問題（直接傳路徑字串會 400）
  return new Promise((resolve, reject) => {
    const writeStream = cloudinary.uploader.upload_stream(
      {
        folder:        FOLDER,
        public_id,
        overwrite:     false,
        resource_type: 'image',
        use_filename:  false,
      },
      (error, result) => {
        if (error) reject(error)
        else       resolve(result!)
      },
    )
    fs.createReadStream(filePath).pipe(writeStream)
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── 主流程 ────────────────────────────────────────────────────

interface EquipmentData {
  equipment_id:          string
  name:                  string
  main_photo:            string | null
  main_photo_public_id:  string | null
  detail_photos:         { public_id: string; url: string }[]
  mainFile:              string | null   // local path
  detailFiles:           { file: string; suffix: string }[]
}

async function main() {
  log('='.repeat(60))
  log(`批次上傳開始  ${DRY_RUN ? '[DRY RUN — 不實際上傳]' : ''}`)
  log('='.repeat(60))

  // 1. 讀取主照片，建立 equipment_id → { name, filePath } map
  const mainFiles  = fs.readdirSync(MAIN_DIR).filter(isImageFile)
  const nameMap    = new Map<string, string>()   // equipment_id → name
  const equipMap   = new Map<string, EquipmentData>()

  for (const filename of mainFiles) {
    try {
      const { equipment_id, name } = parseMainFilename(filename)
      nameMap.set(equipment_id, name)
      equipMap.set(equipment_id, {
        equipment_id,
        name,
        main_photo:           null,
        main_photo_public_id: null,
        detail_photos:        [],
        mainFile:             path.join(MAIN_DIR, filename),
        detailFiles:          [],
      })
    } catch (e) {
      logWarn(`跳過主照片：${filename} — ${(e as Error).message}`)
    }
  }
  log(`主照片解析完成：${equipMap.size} 筆料卡`)

  // 2. 讀取細節照片，依 equipment_id 分組
  const detailFiles = fs.readdirSync(DETAIL_DIR).filter(isImageFile)
  let detailLinked = 0, detailOrphan = 0

  for (const filename of detailFiles) {
    try {
      const { equipment_id, suffix } = parseDetailFilename(filename, nameMap)
      const equip = equipMap.get(equipment_id)
      if (equip) {
        equip.detailFiles.push({ file: path.join(DETAIL_DIR, filename), suffix })
        detailLinked++
      } else {
        logWarn(`細節照片無對應主照片：${filename}（id=${equipment_id}）`)
        detailOrphan++
      }
    } catch (e) {
      logWarn(`跳過細節照片：${filename} — ${(e as Error).message}`)
    }
  }
  log(`細節照片解析完成：${detailLinked} 張已連結，${detailOrphan} 張無對應主照片`)

  if (DRY_RUN) {
    log('DRY RUN 完成，印出前 5 筆資料預覽：')
    let count = 0
    for (const [id, e] of equipMap) {
      if (count++ >= 5) break
      log(`  ${id}  ${e.name}  detail×${e.detailFiles.length}`)
      e.detailFiles.forEach(d => log(`    └ ${d.suffix}`))
    }
    return
  }

  // 3. 查詢 Supabase，找出已完成的 equipment_id（可重複執行安全）
  const { data: existing } = await supabase
    .from('equipment_cards')
    .select('equipment_id, main_photo')
  const doneSet = new Set(
    (existing ?? [])
      .filter((r: { main_photo: string | null }) => r.main_photo !== null)
      .map((r: { equipment_id: string }) => r.equipment_id),
  )
  log(`Supabase 已有 ${doneSet.size} 筆含主照片，將跳過`)

  // 4. 上傳 + Upsert
  let uploaded = 0, skipped = 0, failed = 0
  const total = equipMap.size

  for (const [equipment_id, equip] of equipMap) {
    if (doneSet.has(equipment_id)) {
      skipped++
      continue
    }

    log(`[${uploaded + skipped + failed + 1}/${total}] 處理 ${equipment_id} ${equip.name}`)

    try {
      // 上傳主照片
      if (equip.mainFile) {
        const pid    = makePublicId(equipment_id, 'main')
        const result = await uploadToCloudinary(equip.mainFile, pid)
        equip.main_photo           = result.secure_url
        equip.main_photo_public_id = result.public_id
        await sleep(DELAY_MS)
      }

      // 上傳細節照片
      for (const { file, suffix } of equip.detailFiles) {
        const pid    = makePublicId(equipment_id, suffix)
        const result = await uploadToCloudinary(file, pid)
        equip.detail_photos.push({ public_id: result.public_id, url: result.secure_url })
        await sleep(DELAY_MS)
      }

      // Upsert Supabase
      const { error } = await supabase.from('equipment_cards').upsert({
        equipment_id,
        name:                  equip.name,
        main_photo:            equip.main_photo,
        main_photo_public_id:  equip.main_photo_public_id,
        detail_photos:         equip.detail_photos,
      }, { onConflict: 'equipment_id' })

      if (error) throw error
      uploaded++
      log(`  ✓ 完成 (主×1 細節×${equip.detail_photos.length})`)
    } catch (e) {
      failed++
      logErr(`  ✗ ${equipment_id} 失敗：${(e as Error).message}`)
    }
  }

  log('='.repeat(60))
  log(`完成  上傳:${uploaded}  跳過:${skipped}  失敗:${failed}`)
  log('='.repeat(60))
  logStream.end()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
