/**
 * Seed dữ liệu: Vehicle types + Device-Vehicle compatibility + Device features
 *
 * Script tự động lookup equipment_id theo tên thiết bị từ DB
 * → Không cần biết trước ID, không bị lỗi khi ID khác với giả định
 *
 * Cách chạy:
 *   cd Eup_Hardware_Management
 *   node scripts/seed-device-data.mjs
 *
 * Yêu cầu: Migration 04 đã chạy xong trong Supabase SQL Editor
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const [key, ...val] = line.split('=')
    if (key && val.length) env[key.trim()] = val.join('=').trim()
  }
  return env
}

const env = loadEnv()
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── 1. Danh mục loại xe ─────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { name: 'Xe đầu kéo / container',                category: 'Kinh doanh vận tải', sort_order: 1  },
  { name: 'Xe cứu hộ giao thông',                  category: 'Kinh doanh vận tải', sort_order: 2  },
  { name: 'Xe tải chở hàng',                       category: 'Kinh doanh vận tải', sort_order: 3  },
  { name: 'Xe tải chở hàng lạnh',                  category: 'Kinh doanh vận tải', sort_order: 4  },
  { name: 'Xe ben (chở VLXD)',                      category: 'Kinh doanh vận tải', sort_order: 5  },
  { name: 'Xe cẩu tự hành',                        category: 'Kinh doanh vận tải', sort_order: 6  },
  { name: 'Xe bơm bê tông',                        category: 'Kinh doanh vận tải', sort_order: 7  },
  { name: 'Xe bồn (chở bê tông)',                   category: 'Kinh doanh vận tải', sort_order: 8  },
  { name: 'Xe khách ≥ 9 chỗ',                      category: 'Kinh doanh vận tải', sort_order: 9  },
  { name: 'Xe khách < 9 chỗ',                      category: 'Kinh doanh vận tải', sort_order: 10 },
  { name: 'Xe cứu thương',                         category: 'Kinh doanh vận tải', sort_order: 11 },
  { name: 'Xe chở học sinh',                       category: 'Kinh doanh vận tải', sort_order: 12 },
  { name: 'Xe môi trường (xe rác)',                 category: 'Kinh doanh vận tải', sort_order: 13 },
  { name: 'Xe cẩu (bánh lốp / bánh xích / Kato)',  category: 'Xe công trình',       sort_order: 20 },
  { name: 'Xe lu',                                 category: 'Xe công trình',       sort_order: 21 },
  { name: 'Xe ủi',                                 category: 'Xe công trình',       sort_order: 22 },
  { name: 'Máy xúc',                               category: 'Xe công trình',       sort_order: 23 },
  { name: 'Xe tải biển trắng (chở hàng nội bộ)',   category: 'Cá nhân & Nội bộ',   sort_order: 30 },
  { name: 'Xe ô tô biển trắng (chở người nội bộ)', category: 'Cá nhân & Nội bộ',   sort_order: 31 },
  { name: 'Xe máy (mô tô)',                        category: 'Cá nhân & Nội bộ',   sort_order: 32 },
]

// ─── 2. Ma trận xe × thiết bị (dùng tên thiết bị, script sẽ lookup ID) ──────
// Format: [vehicle_name, device_name_pattern, requirement, group_note, notes]
//
// device_name_pattern: chuỗi khớp với tên thiết bị trong equipment_cards
// (tìm kiếm không phân biệt hoa thường, khớp một phần)
//
// Ghi chú nhóm:
//   - Xe đầu kéo / cứu hộ / khách ≥9 / cứu thương / học sinh: C43 hoặc H5
//   - Xe tải / lạnh / ben / bồn / bơm / cẩu tự hành / môi trường / khách <9: Go-168 hoặc VN88
//   - Xe công trình / biển trắng / xe máy: MT99 hoặc GPS cơ bản

const G_DVR      = 'Chọn 1 trong: C43 hoặc H5'
const G_GPS_STD  = 'Chọn 1 trong: Go-168 hoặc VN88-4G'
const G_GPS_ALL  = 'Chọn 1 trong: MT99, Go-168 hoặc VN88-4G'
const G_FUEL     = 'Chọn 1 trong: CB dầu Soji hoặc Taiwan'

// [vehicle_name, device_name_pattern, requirement, group_note, notes]
const COMPAT_BY_NAME = [
  // Xe đầu kéo
  ['Xe đầu kéo / container', 'C43',           'mandatory', G_DVR,     ''],
  ['Xe đầu kéo / container', 'H5',            'mandatory', G_DVR,     ''],
  ['Xe đầu kéo / container', 'cảm biến dầu',  'optional',  G_FUEL,    ''],

  // Xe cứu hộ
  ['Xe cứu hộ giao thông', 'C43',           'mandatory', G_DVR,  ''],
  ['Xe cứu hộ giao thông', 'H5',            'mandatory', G_DVR,  ''],
  ['Xe cứu hộ giao thông', 'cảm biến dầu',  'optional',  G_FUEL, ''],

  // Xe tải chở hàng
  ['Xe tải chở hàng', 'Go-168',        'mandatory', G_GPS_STD, ''],
  ['Xe tải chở hàng', 'VN88',          'mandatory', G_GPS_STD, ''],
  ['Xe tải chở hàng', 'cảm biến dầu',  'optional',  G_FUEL,    ''],

  // Xe tải lạnh
  ['Xe tải chở hàng lạnh', 'Go-168',         'mandatory', G_GPS_STD, ''],
  ['Xe tải chở hàng lạnh', 'VN88',           'mandatory', G_GPS_STD, ''],
  ['Xe tải chở hàng lạnh', 'cảm biến dầu',   'optional',  G_FUEL,    ''],
  ['Xe tải chở hàng lạnh', 'SmartBox',        'optional',  '',        'Cần SmartBox khi dùng VN88-4G'],
  ['Xe tải chở hàng lạnh', 'cảm biến nhiệt',  'optional',  '',        ''],

  // Xe ben
  ['Xe ben (chở VLXD)', 'Go-168',        'mandatory', G_GPS_STD, ''],
  ['Xe ben (chở VLXD)', 'VN88',          'mandatory', G_GPS_STD, ''],
  ['Xe ben (chở VLXD)', 'cảm biến dầu',  'optional',  G_FUEL,    ''],

  // Xe cẩu tự hành
  ['Xe cẩu tự hành', 'Go-168',        'mandatory', G_GPS_STD, ''],
  ['Xe cẩu tự hành', 'VN88',          'mandatory', G_GPS_STD, ''],
  ['Xe cẩu tự hành', 'cảm biến dầu',  'optional',  G_FUEL,    ''],

  // Xe bơm bê tông
  ['Xe bơm bê tông', 'Go-168',        'mandatory', G_GPS_STD, ''],
  ['Xe bơm bê tông', 'VN88',          'mandatory', G_GPS_STD, ''],
  ['Xe bơm bê tông', 'cảm biến dầu',  'optional',  G_FUEL,    ''],

  // Xe bồn bê tông
  ['Xe bồn (chở bê tông)', 'Go-168',          'mandatory', G_GPS_STD, ''],
  ['Xe bồn (chở bê tông)', 'VN88',            'mandatory', G_GPS_STD, ''],
  ['Xe bồn (chở bê tông)', 'cảm biến dầu',    'optional',  G_FUEL,    ''],
  ['Xe bồn (chở bê tông)', 'cảm biến bê tông', 'optional', '',         ''],

  // Xe khách ≥9
  ['Xe khách ≥ 9 chỗ', 'C43', 'mandatory', G_DVR, ''],
  ['Xe khách ≥ 9 chỗ', 'H5',  'mandatory', G_DVR, ''],

  // Xe khách <9
  ['Xe khách < 9 chỗ', 'Go-168', 'mandatory', G_GPS_STD, ''],
  ['Xe khách < 9 chỗ', 'VN88',   'mandatory', G_GPS_STD, ''],

  // Xe cứu thương
  ['Xe cứu thương', 'C43', 'mandatory', G_DVR, ''],
  ['Xe cứu thương', 'H5',  'mandatory', G_DVR, ''],

  // Xe chở học sinh
  ['Xe chở học sinh', 'C43', 'mandatory', G_DVR, ''],
  ['Xe chở học sinh', 'H5',  'mandatory', G_DVR, ''],

  // Xe môi trường
  ['Xe môi trường (xe rác)', 'MT99',          'mandatory', G_GPS_ALL, ''],
  ['Xe môi trường (xe rác)', 'Go-168',        'mandatory', G_GPS_ALL, ''],
  ['Xe môi trường (xe rác)', 'VN88',          'mandatory', G_GPS_ALL, ''],
  ['Xe môi trường (xe rác)', 'H5',            'optional',  '',        ''],
  ['Xe môi trường (xe rác)', 'cảm biến dầu',  'optional',  G_FUEL,    ''],

  // Xe cẩu công trình
  ['Xe cẩu (bánh lốp / bánh xích / Kato)', 'MT99',         'mandatory', G_GPS_ALL, ''],
  ['Xe cẩu (bánh lốp / bánh xích / Kato)', 'Go-168',       'mandatory', G_GPS_ALL, ''],
  ['Xe cẩu (bánh lốp / bánh xích / Kato)', 'VN88',         'mandatory', G_GPS_ALL, ''],
  ['Xe cẩu (bánh lốp / bánh xích / Kato)', 'cảm biến dầu', 'optional',  G_FUEL,    ''],

  // Xe lu
  ['Xe lu', 'MT99',         'mandatory', G_GPS_ALL, ''],
  ['Xe lu', 'Go-168',       'mandatory', G_GPS_ALL, ''],
  ['Xe lu', 'VN88',         'mandatory', G_GPS_ALL, ''],
  ['Xe lu', 'cảm biến dầu', 'optional',  G_FUEL,    ''],

  // Xe ủi
  ['Xe ủi', 'MT99',         'mandatory', G_GPS_ALL, ''],
  ['Xe ủi', 'Go-168',       'mandatory', G_GPS_ALL, ''],
  ['Xe ủi', 'VN88',         'mandatory', G_GPS_ALL, ''],
  ['Xe ủi', 'cảm biến dầu', 'optional',  G_FUEL,    ''],

  // Máy xúc
  ['Máy xúc', 'MT99',         'mandatory', G_GPS_ALL, ''],
  ['Máy xúc', 'Go-168',       'mandatory', G_GPS_ALL, ''],
  ['Máy xúc', 'VN88',         'mandatory', G_GPS_ALL, ''],
  ['Máy xúc', 'cảm biến dầu', 'optional',  G_FUEL,    ''],

  // Xe tải biển trắng
  ['Xe tải biển trắng (chở hàng nội bộ)', 'MT99',         'mandatory', G_GPS_ALL, ''],
  ['Xe tải biển trắng (chở hàng nội bộ)', 'Go-168',       'mandatory', G_GPS_ALL, ''],
  ['Xe tải biển trắng (chở hàng nội bộ)', 'VN88',         'mandatory', G_GPS_ALL, ''],
  ['Xe tải biển trắng (chở hàng nội bộ)', 'cảm biến dầu', 'optional',  G_FUEL,    ''],

  // Xe ô tô biển trắng
  ['Xe ô tô biển trắng (chở người nội bộ)', 'MT99',    'mandatory', G_GPS_ALL, ''],
  ['Xe ô tô biển trắng (chở người nội bộ)', 'Go-168',  'optional',  '',        ''],
  ['Xe ô tô biển trắng (chở người nội bộ)', 'VN88',    'optional',  '',        ''],

  // Xe máy
  ['Xe máy (mô tô)', 'MT99',   'mandatory', '', 'Tiết kiệm điện, phù hợp ắc quy xe máy'],
  ['Xe máy (mô tô)', 'Go-168', 'optional',  '', ''],
  ['Xe máy (mô tô)', 'VN88',   'optional',  '', ''],
]

// ─── 3. Tính năng thiết bị (dùng tên, script lookup ID) ─────────────────────
// Format: [device_name_pattern, feature_key, value, notes]
const FEATURES_BY_NAME = [
  // VN88-4G
  ['VN88', 'qcvn06',            '✔', ''],
  ['VN88', 'qcvn31',            '✔', ''],
  ['VN88', 'nd10',              '✔', 'Phải kết hợp cùng DVR-88'],
  ['VN88', 'rfid',              '✔', 'Đầu quẹt tích hợp sẵn - Thẻ EUP'],
  ['VN88', 'rfid_auto_logout',  '✔', 'Đỗ xe quá 4H (mặc định tắt)'],
  ['VN88', 'speed_alert',       '✔', ''],
  ['VN88', 'cam_max',           '2',  'Kết hợp DVR-88, có thể thêm SmartBox'],
  ['VN88', 'fuel_sensor',       '✔', 'Soji, Taiwan, Daviteq, BK-Adsun+DTU, AI'],
  ['VN88', 'fuel_sensor_dual',  '✔', 'Soji (2 cây dầu cùng phiên bản)'],
  ['VN88', 'temp_sensor',       '✔', ''],
  ['VN88', 'concrete_sensor',   '✗', ''],
  ['VN88', 'collision_sensor',  '✔', 'Cần thêm SmartBox'],
  ['VN88', 'trailer_etag',      '✔', 'Cần thêm SmartBox'],
  ['VN88', 'telematics_l1',     '✔', 'Tăng tốc đột ngột, phanh gấp, cua gấp'],
  ['VN88', 'telematics_l2',     '✗', 'Cần H5 + DMS/ADAS'],
  ['VN88', 'dms',               '✗', ''],
  ['VN88', 'adas',              '✗', ''],
  ['VN88', 'sos',               '✔', ''],

  // Go-168
  ['Go-168', 'qcvn06',            '✔', ''],
  ['Go-168', 'qcvn31',            '✔', ''],
  ['Go-168', 'nd10',              '✗', 'Không hỗ trợ NĐ10 (không tích hợp camera)'],
  ['Go-168', 'rfid',              '✔', 'Đầu quẹt tích hợp sẵn - Thẻ EUP'],
  ['Go-168', 'rfid_auto_logout',  '✔', 'Có thể cài đặt thời gian (mặc định tắt)'],
  ['Go-168', 'speed_alert',       '✔', ''],
  ['Go-168', 'cam_max',           '0',  'Không tích hợp camera'],
  ['Go-168', 'fuel_sensor',       '✔', 'Soji, Daviteq, Adsun'],
  ['Go-168', 'fuel_sensor_dual',  '✔', 'Soji (2 cây dầu cùng phiên bản)'],
  ['Go-168', 'temp_sensor',       '✔', ''],
  ['Go-168', 'concrete_sensor',   '✔', ''],
  ['Go-168', 'collision_sensor',  '✔', ''],
  ['Go-168', 'trailer_etag',      '✗', ''],
  ['Go-168', 'telematics_l1',     '✔', 'Tăng tốc đột ngột, phanh gấp, cua gấp'],
  ['Go-168', 'telematics_l2',     '✗', ''],
  ['Go-168', 'dms',               '✗', ''],
  ['Go-168', 'adas',              '✗', ''],
  ['Go-168', 'sos',               '✔', ''],

  // C43
  ['C43', 'qcvn06',            '✗', ''],
  ['C43', 'qcvn31',            '✔', ''],
  ['C43', 'nd10',              '✔', ''],
  ['C43', 'rfid',              '✔', 'Đầu ghi thẻ ngoài - Thẻ QCVN'],
  ['C43', 'rfid_auto_logout',  '✔', 'Sau khi tắt chìa khóa (mặc định tắt)'],
  ['C43', 'speed_alert',       '✔', ''],
  ['C43', 'cam_max',           '2',  'Cố định 2 camera: 1 hành trình + 1 trong cabin'],
  ['C43', 'fuel_sensor',       '✔', 'Soji, Daviteq'],
  ['C43', 'fuel_sensor_dual',  '✔', 'Soji (2 cây dầu cùng phiên bản)'],
  ['C43', 'temp_sensor',       '✗', ''],
  ['C43', 'concrete_sensor',   '✗', ''],
  ['C43', 'collision_sensor',  '✗', ''],
  ['C43', 'telematics_l1',     '✗', ''],
  ['C43', 'telematics_l2',     '✗', ''],
  ['C43', 'dms',               '✗', ''],
  ['C43', 'adas',              '✗', ''],
  ['C43', 'sos',               '✗', ''],

  // H5
  ['H5', 'qcvn06',            '✗', ''],
  ['H5', 'qcvn31',            '✔', ''],
  ['H5', 'nd10',              '✔', ''],
  ['H5', 'rfid',              '✔', 'Đầu ghi thẻ ngoài - Thẻ QCVN'],
  ['H5', 'rfid_auto_logout',  '✔', 'Sau khi tắt chìa khóa (mặc định tắt)'],
  ['H5', 'speed_alert',       '✔', ''],
  ['H5', 'cam_max',           '4',  'Tối đa 4 camera rời'],
  ['H5', 'fuel_sensor',       '✔', 'Soji (cần thêm cáp kết nối)'],
  ['H5', 'fuel_sensor_dual',  '✔', 'Soji (2 cây dầu cùng phiên bản)'],
  ['H5', 'temp_sensor',       '✗', ''],
  ['H5', 'concrete_sensor',   '✗', ''],
  ['H5', 'collision_sensor',  '✗', ''],
  ['H5', 'telematics_l1',     '✗', ''],
  ['H5', 'telematics_l2',     '✔', 'H5 + DMS (buồn ngủ/điện thoại) + ADAS (lệch làn/va chạm)'],
  ['H5', 'dms',               '✔', 'Cần lắp thêm thiết bị DMS'],
  ['H5', 'adas',              '✔', 'Cần lắp thêm thiết bị ADAS'],
  ['H5', 'sos',               '✗', ''],

  // F6N (AICAM)
  ['F6N', 'qcvn06',            '✔', ''],
  ['F6N', 'qcvn31',            '✔', ''],
  ['F6N', 'nd10',              '✔', ''],
  ['F6N', 'rfid',              '✔', 'Đầu ghi thẻ ngoài - Thẻ QCVN'],
  ['F6N', 'rfid_auto_logout',  '✔', 'Sau khi tắt chìa khóa (mặc định tắt)'],
  ['F6N', 'speed_alert',       '✔', ''],
  ['F6N', 'cam_max',           '4',  'Tối đa 4 camera rời'],
  ['F6N', 'fuel_sensor',       '✗', ''],
  ['F6N', 'temp_sensor',       '✗', ''],
  ['F6N', 'concrete_sensor',   '✗', ''],
  ['F6N', 'telematics_l1',     '✗', ''],
  ['F6N', 'telematics_l2',     '✗', ''],
  ['F6N', 'dms',               '✗', ''],
  ['F6N', 'adas',              '✗', ''],
  ['F6N', 'sos',               '✗', ''],

  // MT99
  ['MT99', 'qcvn06',         '✗', ''],
  ['MT99', 'qcvn31',         '✗', 'Không hợp chuẩn - thiết bị cơ bản'],
  ['MT99', 'nd10',           '✗', ''],
  ['MT99', 'rfid',           '✗', ''],
  ['MT99', 'cam_max',        '0', ''],
  ['MT99', 'fuel_sensor',    '✗', ''],
  ['MT99', 'temp_sensor',    '✗', ''],
  ['MT99', 'telematics_l1',  '✗', ''],
  ['MT99', 'sos',            '✗', ''],
  ['MT99', 'low_power',      '✔', 'Tiêu thụ điện thấp - phù hợp ắc quy xe máy'],

  // SmartBox
  ['SmartBox', 'purpose',        'Bộ mở rộng', 'Hỗ trợ VN88-4G kết nối nhiều phụ kiện đồng thời'],
  ['SmartBox', 'temp_sensor',    '✔', 'Hỗ trợ cảm biến nhiệt độ khi dùng với VN88-4G'],
  ['SmartBox', 'collision_sensor','✔', 'Hỗ trợ cảm biến va chạm khi dùng với VN88-4G'],
  ['SmartBox', 'trailer_etag',   '✔', 'Hỗ trợ rơmooc etag khi dùng với VN88-4G'],
  ['SmartBox', 'cam_max',        '2', 'Mở rộng thêm 2 camera cho VN88-4G'],
]

// ─── Hàm lookup: tìm equipment_id theo tên (khớp một phần, không phân biệt hoa thường) ──
function findDeviceId(pattern, equipmentCards) {
  const p = pattern.toLowerCase()
  // Ưu tiên khớp chính xác equipment_id
  const exactId = equipmentCards.find(e => e.equipment_id.toLowerCase() === p)
  if (exactId) return exactId

  // Khớp theo tên thiết bị
  const byName = equipmentCards.filter(e =>
    e.name.toLowerCase().includes(p) ||
    e.equipment_id.toLowerCase().includes(p)
  )
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    // Trả về thiết bị "Hiện hành" ưu tiên, hoặc cái đầu tiên
    return byName.find(e => e.status === 'Hiện hành') ?? byName[0]
  }
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌱 Bắt đầu seed dữ liệu thiết bị...\n')

  // 0. Load tất cả equipment_cards từ DB
  const { data: equipmentCards, error: eqErr } = await supabase
    .from('equipment_cards')
    .select('equipment_id, name, status, device_type')
    .order('name')

  if (eqErr) { console.error('❌ Không đọc được equipment_cards:', eqErr.message); process.exit(1) }

  console.log(`📦 Tìm thấy ${equipmentCards.length} thiết bị trong DB:`)
  equipmentCards.forEach(e => console.log(`   ${e.equipment_id.padEnd(25)} | ${e.name}`))
  console.log()

  // 1. Upsert vehicle_types
  console.log('📍 Upsert vehicle_types...')
  const { error: vtErr } = await supabase
    .from('vehicle_types')
    .upsert(VEHICLE_TYPES, { onConflict: 'name' })
  if (vtErr) { console.error('❌ vehicle_types:', vtErr.message); process.exit(1) }
  console.log(`   ✅ ${VEHICLE_TYPES.length} loại xe\n`)

  // 2. Lấy vehicle_type map (name → id)
  const { data: vtRows } = await supabase.from('vehicle_types').select('id, name')
  const vtMap = Object.fromEntries(vtRows.map(r => [r.name, r.id]))

  // 3. Upsert device_vehicle_compat (lookup theo tên)
  console.log('🔗 Upsert device_vehicle_compat...')
  let compatOk = 0, compatSkip = 0, compatWarn = []

  for (const [vName, devPattern, req, groupNote, notes] of COMPAT_BY_NAME) {
    const vtId = vtMap[vName]
    if (!vtId) {
      compatWarn.push(`  ⚠️  Không tìm thấy vehicle_type: "${vName}"`)
      compatSkip++
      continue
    }

    const device = findDeviceId(devPattern, equipmentCards)
    if (!device) {
      compatWarn.push(`  ⚠️  Không tìm thấy thiết bị khớp với: "${devPattern}"`)
      compatSkip++
      continue
    }

    const { error } = await supabase
      .from('device_vehicle_compat')
      .upsert(
        {
          equipment_id: device.equipment_id,
          vehicle_type_id: vtId,
          requirement: req,
          group_note: groupNote || null,
          notes: notes || null,
        },
        { onConflict: 'equipment_id,vehicle_type_id' }
      )

    if (error) {
      compatWarn.push(`  ❌ [${device.equipment_id} × ${vName}]: ${error.message}`)
      compatSkip++
    } else {
      compatOk++
    }
  }

  console.log(`   ✅ ${compatOk} bản ghi compat  |  ⏭️  ${compatSkip} bỏ qua`)
  if (compatWarn.length > 0) {
    console.log('   Cảnh báo:')
    compatWarn.forEach(w => console.log(w))
  }
  console.log()

  // 4. Upsert device_features (lookup theo tên)
  console.log('⚙️  Upsert device_features...')
  let featOk = 0, featSkip = 0, featWarn = []

  for (const [devPattern, key, val, notes] of FEATURES_BY_NAME) {
    const device = findDeviceId(devPattern, equipmentCards)
    if (!device) {
      featWarn.push(`  ⚠️  Không tìm thấy thiết bị khớp với: "${devPattern}"`)
      featSkip++
      continue
    }

    const { error } = await supabase
      .from('device_features')
      .upsert(
        { equipment_id: device.equipment_id, feature_key: key, value: val, notes: notes || null },
        { onConflict: 'equipment_id,feature_key' }
      )

    if (error) {
      featWarn.push(`  ❌ [${device.equipment_id}.${key}]: ${error.message}`)
      featSkip++
    } else {
      featOk++
    }
  }

  console.log(`   ✅ ${featOk} tính năng  |  ⏭️  ${featSkip} bỏ qua`)
  if (featWarn.length > 0) {
    console.log('   Cảnh báo:')
    featWarn.forEach(w => console.log(w))
  }

  console.log('\n✅ Seed hoàn tất!\n')
  console.log('Nếu có cảnh báo "Không tìm thấy thiết bị":')
  console.log('→ Tên thiết bị trong DB không khớp với pattern trong script')
  console.log('→ Vào Admin Kho và nhập tính năng thủ công, hoặc điều chỉnh pattern trong script\n')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
