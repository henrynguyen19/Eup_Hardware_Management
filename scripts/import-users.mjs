/**
 * Import bulk users vào Supabase
 *
 * Cách chạy:
 *   cd Eup_Hardware_Management
 *   node scripts/import-users.mjs
 *
 * Yêu cầu: .env.local có NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Đọc .env.local
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

const DEFAULT_PASSWORD = 'EupVN123'

// ─── Danh sách nhân viên cần tạo ────────────────────────────
// group: tên nhóm phải khớp với user_groups.name trong DB
const USERS = [
  // ── R&D Phần cứng (14 người) ───────────────────────────────
  { english: 'Henry',  vn: 'Nguyễn Văn Hùng',         group: 'R&D Phần cứng' },
  { english: 'Julie',  vn: 'Nguyễn Thu Hiền',          group: 'R&D Phần cứng' },
  { english: 'Kai',    vn: 'Trần Như Tư',              group: 'R&D Phần cứng' },
  { english: 'Shiro',  vn: 'Nguyễn Thành Đạt',         group: 'R&D Phần cứng' },
  { english: 'Irene',  vn: 'Hoàng Kim Xuyến',          group: 'R&D Phần cứng' },
  { english: 'Peter',  vn: 'Lê Đặng Tuấn Kiệt',        group: 'R&D Phần cứng' },
  { english: 'Kane',   vn: 'Lỗ Văn Ninh',              group: 'R&D Phần cứng' },
  { english: 'Thor',   vn: 'Nguyễn Đạt Công Tài',      group: 'R&D Phần cứng' },
  { english: 'Kris',   vn: 'Dương Tử Quỳnh',           group: 'R&D Phần cứng' },
  { english: 'Nick',   vn: 'Nguyễn Bá Đức Anh',        group: 'R&D Phần cứng' },
  { english: 'Galvin', vn: 'Nguyễn Thế Đạt',           group: 'R&D Phần cứng' },
  { english: 'Stefan', vn: 'Trịnh Huy Thương',          group: 'R&D Phần cứng' },
  { english: 'Cop',    vn: 'Lê Huy Hiếu',              group: 'R&D Phần cứng' },
  { english: 'Zeus',   vn: 'Đoàn Văn Lực',             group: 'R&D Phần cứng' },

  // ── Hành chính tổng hợp (6 người) ─────────────────────────
  { english: 'Sunny',  vn: 'Nguyễn Thúy Lan',          group: 'Hành chính' },
  { english: 'Katie',  vn: 'Nguyễn Thị Thỉnh',         group: 'Hành chính' },
  { english: 'Ruby',   vn: 'Lê Thị Hạnh',              group: 'Hành chính' },
  { english: 'Jennie', vn: 'Phạm Ngọc Thanh',          group: 'Hành chính' },
  { english: 'Lily',   vn: 'Lương Thị Thanh Xuân',     group: 'Hành chính' },
  { english: 'Cindy',  vn: 'Đinh Ngọc Tuyết',          group: 'Hành chính' },

  // ── Kinh doanh – VP Hà Nội (21 người: salesmen + trợ lý) ──
  { english: 'Owen',   vn: '', group: 'Kinh doanh' },
  { english: 'Hawk',   vn: '', group: 'Kinh doanh' },
  { english: 'Titan',  vn: '', group: 'Kinh doanh' },
  { english: 'Leo',    vn: '', group: 'Kinh doanh' },
  { english: 'Ben',    vn: '', group: 'Kinh doanh' },
  { english: 'Zenda',  vn: '', group: 'Kinh doanh' },
  { english: 'Dily',   vn: '', group: 'Kinh doanh' },
  { english: 'Canary', vn: '', group: 'Kinh doanh' },
  { english: 'Min',    vn: '', group: 'Kinh doanh' },
  { english: 'Anna',   vn: '', group: 'Kinh doanh' },
  { english: 'Lee',    vn: '', group: 'Kinh doanh' },
  { english: 'Elsa',   vn: '', group: 'Kinh doanh' },
  { english: 'Jeny',   vn: '', group: 'Kinh doanh' },
  { english: 'Abbey',  vn: '', group: 'Kinh doanh' },
  { english: 'Soda',   vn: '', group: 'Kinh doanh' },
  { english: 'Jena',   vn: '', group: 'Kinh doanh' },
  { english: 'Helen',  vn: '', group: 'Kinh doanh' },
  { english: 'Hana',   vn: '', group: 'Kinh doanh' },
  { english: 'Mina',   vn: '', group: 'Kinh doanh' },
  { english: 'Luna',   vn: '', group: 'Kinh doanh' },
  { english: 'Lita',   vn: '', group: 'Kinh doanh' },

  // ── Kinh doanh – VP HCM (15 người) ────────────────────────
  { english: 'Dylan',   vn: '', group: 'Kinh doanh' },
  { english: 'Alvin',   vn: '', group: 'Kinh doanh' },
  { english: 'Roger',   vn: '', group: 'Kinh doanh' },
  { english: 'Arnold',  vn: '', group: 'Kinh doanh' },
  { english: 'Lionel',  vn: '', group: 'Kinh doanh' },
  { english: 'Bell',    vn: '', group: 'Kinh doanh' },
  { english: 'Jade',    vn: '', group: 'Kinh doanh' },
  { english: 'Zoey',    vn: '', group: 'Kinh doanh' },
  { english: 'Vivian',  vn: '', group: 'Kinh doanh' },
  { english: 'Dani',    vn: '', group: 'Kinh doanh' },
  { english: 'Selina',  vn: '', group: 'Kinh doanh' },
  { english: 'Vanessa', vn: '', group: 'Kinh doanh' },
  { english: 'Winter',  vn: '', group: 'Kinh doanh' },
  { english: 'Alice',   vn: '', group: 'Kinh doanh' },
  { english: 'Clara',   vn: '', group: 'Kinh doanh' },

  // ── Kinh doanh – VP Bình Dương (6 người) ──────────────────
  { english: 'Eric',   vn: '', group: 'Kinh doanh' },
  { english: 'Steven', vn: '', group: 'Kinh doanh' },
  { english: 'Tansy',  vn: '', group: 'Kinh doanh' },
  { english: 'Lucy',   vn: '', group: 'Kinh doanh' },
  { english: 'Ella',   vn: '', group: 'Kinh doanh' },
  { english: 'Vera',   vn: '', group: 'Kinh doanh' },

  // ── Kinh doanh – VP Hải Phòng (7 người) ───────────────────
  { english: 'Brian', vn: '', group: 'Kinh doanh' },
  { english: 'Alex',  vn: '', group: 'Kinh doanh' },
  { english: 'Cris',  vn: '', group: 'Kinh doanh' },
  { english: 'Tina',  vn: '', group: 'Kinh doanh' },
  { english: 'Ellie', vn: '', group: 'Kinh doanh' },
  { english: 'Mimi',  vn: '', group: 'Kinh doanh' },
  { english: 'Jin',   vn: '', group: 'Kinh doanh' },

  // ── Kinh doanh – VP Đà Nẵng (5 người) ────────────────────
  { english: 'Adam',  vn: '', group: 'Kinh doanh' },
  { english: 'Maika', vn: '', group: 'Kinh doanh' },
  { english: 'Vivi',  vn: '', group: 'Kinh doanh' },
  { english: 'Gina',  vn: '', group: 'Kinh doanh' },
  { english: 'Mango', vn: '', group: 'Kinh doanh' },
]

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Bắt đầu import ${USERS.length} users...\n`)

  // 1. Lấy danh sách roles để tìm default role (viewer hoặc tên tương đương)
  const { data: roles, error: rolesErr } = await supabase.from('roles').select('id, name')
  if (rolesErr) { console.error('❌ Không đọc được bảng roles:', rolesErr.message); process.exit(1) }

  // Tìm role viewer (hoặc role đầu tiên không phải admin)
  const viewerRole = roles.find(r =>
    r.name.toLowerCase().includes('viewer') ||
    r.name.includes('一般使用者') ||
    r.name.toLowerCase() === 'viewer'
  ) ?? roles[0]

  if (!viewerRole) { console.error('❌ Không tìm thấy role mặc định'); process.exit(1) }
  console.log(`✅ Role mặc định: "${viewerRole.name}" (${viewerRole.id})\n`)

  // 2. Lấy danh sách groups
  const { data: groups, error: groupsErr } = await supabase.from('user_groups').select('id, name')
  if (groupsErr) {
    console.error('❌ Không đọc được bảng user_groups. Hãy chạy migration 03 trước:', groupsErr.message)
    process.exit(1)
  }
  const groupMap = Object.fromEntries(groups.map(g => [g.name, g.id]))
  console.log(`✅ Tìm thấy ${groups.length} groups:`, groups.map(g => g.name).join(', '), '\n')

  // 3. Lấy users hiện có trong auth để skip nếu đã tồn tại
  const { data: existingAuth } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingEmails = new Set((existingAuth?.users ?? []).map(u => u.email?.toLowerCase()))

  let created = 0, skipped = 0, errors = 0

  for (const user of USERS) {
    const email = `${user.english.toLowerCase()}@eup.net.vn`

    if (existingEmails.has(email)) {
      console.log(`⏭️  Bỏ qua (đã tồn tại): ${email}`)
      skipped++
      // Vẫn kiểm tra và gán group nếu chưa có
      await ensureGroupMembership(email, user.group, groupMap)
      continue
    }

    try {
      // Tạo user trong Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: user.vn || user.english,
          display_name: user.english,
        }
      })

      if (authErr) {
        console.error(`❌ Lỗi tạo ${email}:`, authErr.message)
        errors++
        continue
      }

      const userId = authData.user.id

      // Thêm vào allowed_emails
      await supabase.from('allowed_emails').upsert(
        { email, role: viewerRole.name },
        { onConflict: 'email' }
      )

      // Gán role mặc định trong user_roles
      await supabase.from('user_roles').upsert(
        { user_id: userId, user_email: email, role_id: viewerRole.id },
        { onConflict: 'user_email' }
      )

      // Gán group
      const groupId = groupMap[user.group]
      if (groupId) {
        await supabase.from('user_group_members').upsert(
          { user_id: userId, group_id: groupId },
          { onConflict: 'user_id,group_id', ignoreDuplicates: true }
        )
      } else {
        console.warn(`  ⚠️  Không tìm thấy group "${user.group}" cho ${email}`)
      }

      const label = user.vn ? `${user.english} (${user.vn})` : user.english
      console.log(`✅ Tạo: ${email} → ${user.group}${user.vn ? ` | ${user.vn}` : ''}`)
      created++
    } catch (err) {
      console.error(`❌ Exception tạo ${email}:`, err.message ?? err)
      errors++
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`✅ Tạo mới:  ${created} users`)
  console.log(`⏭️  Bỏ qua:   ${skipped} users (đã tồn tại)`)
  console.log(`❌ Lỗi:      ${errors} users`)
  console.log(`${'─'.repeat(50)}\n`)
  console.log('Hoàn thành! Nhân viên có thể đăng nhập với:')
  console.log(`  URL:      [địa chỉ web của công ty]`)
  console.log(`  Email:    {tên tiếng anh}@eup.net.vn (viết thường)`)
  console.log(`  Mật khẩu: ${DEFAULT_PASSWORD}`)
  console.log('\n⚠️  Khuyến nghị: Yêu cầu đổi mật khẩu sau lần đăng nhập đầu tiên.\n')
}

// Kiểm tra và gán group cho user đã tồn tại
async function ensureGroupMembership(email, groupName, groupMap) {
  const groupId = groupMap[groupName]
  if (!groupId) return

  const { data: ur } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('user_email', email)
    .single()

  if (!ur?.user_id) return

  await supabase.from('user_group_members').upsert(
    { user_id: ur.user_id, group_id: groupId },
    { onConflict: 'user_id,group_id', ignoreDuplicates: true }
  )
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
