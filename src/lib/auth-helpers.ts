/**
 * auth-helpers.ts — Hệ thống phân quyền mới (department-based)
 *
 * Thay thế legacy user_permissions_view checks.
 * Admin = user thuộc phòng 'hardware' (full access tất cả sub-pages).
 *
 * Sub-page codes:
 *   'sua_chua_main'        → Sửa chữa / Repair tracking
 *   'giao_hang_main'       → Giao nhận
 *   'hotro_bang_thong_ke'  → Hỗ trợ kỹ thuật
 *   'chat_luong_main'      → Chất lượng
 *   'giay_chung_nhan_main' → Chứng nhận
 *   'thiet_bi_danh_sach'   → Kho - Danh sách
 *   'thiet_bi_tinh_nang'   → Kho - Tính năng
 *   'thiet_bi_xe'          → Kho - Xe & thiết bị
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Lấy user đang đăng nhập từ session cookie */
export async function getAuthUser() {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser()
  return user
}

/**
 * Kiểm tra user có thuộc phòng 'hardware' không (admin equivalent).
 * Hardware dept có full CRUD trên tất cả sub-pages.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await adminDb()
    .from('user_departments')
    .select('departments(code)')
    .eq('user_id', userId)
  return (data ?? []).some((r: { departments: { code: string } | null }) => r.departments?.code === 'hardware')
}

/**
 * Kiểm tra user có quyền CRUD cụ thể trên một sub-page (hệ thống mới).
 * action mặc định là 'can_read'.
 */
export async function hasSubPagePerm(
  userId: string,
  subPageCode: string,
  action: 'can_read' | 'can_create' | 'can_update' | 'can_delete' = 'can_read'
): Promise<boolean> {
  const { data } = await adminDb()
    .from('user_effective_permissions')
    .select(action)
    .eq('user_id', userId)
    .eq('sub_page_code', subPageCode)
    .maybeSingle()
  return (data as Record<string, boolean> | null)?.[action] ?? false
}

/**
 * Yêu cầu user là admin (hardware dept). Trả về user hoặc error response.
 *
 * Usage:
 *   const auth = await requireAdmin()
 *   if (!auth.ok) return auth.response
 *   const { user } = auth
 */
export async function requireAdmin(): Promise<
  { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> } |
  { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }
  if (!(await isAdminUser(user.id))) {
    return { ok: false, response: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true, user }
}

/**
 * Yêu cầu admin HOẶC có quyền cụ thể trên sub-page.
 * Trả về { ok, user, isAdmin } — giữ isAdmin flag cho behavioral checks.
 *
 * Usage:
 *   const auth = await requirePermOrAdmin('sua_chua_main', 'can_create')
 *   if (!auth.ok) return auth.response
 *   const { user, isAdmin } = auth
 */
/**
 * Xây dựng mảng permission dạng cũ cho AppShell (sidebar visibility).
 * Dùng hệ thống mới (user_effective_permissions) để suy ra các chuỗi cũ.
 *
 * Admin → full access tất cả module.
 * Non-admin → map sub_page_code có can_read → legacy permission string.
 */
const SUB_TO_LEGACY: Record<string, string> = {
  thiet_bi_danh_sach:  'kho:read',
  thiet_bi_tinh_nang:  'kho:read',
  thiet_bi_xe:         'kho:read',
  sua_chua_main:       'sua_chua:read',
  hotro_bang_thong_ke: 'ho_tro:read',
  hotro_jira_bugs:     'ho_tro:read',
  chat_luong_main:     'chat_luong:read',
  giay_chung_nhan_main:'chung_nhan:read',
  giao_hang_main:      'gui_hang:read',
}

const ADMIN_LEGACY = [
  'admin:users',
  'kho:read', 'kho:write',
  'sua_chua:read', 'sua_chua:write',
  'ho_tro:read', 'ho_tro:write', 'ho_tro:admin',
  'chat_luong:read', 'chat_luong:write',
  'chung_nhan:read', 'chung_nhan:write',
  'gui_hang:read', 'gui_hang:write',
  'kho_daily:read', 'kho_daily:write',
  'tai_lieu:read', 'huong_dan:read',
]

export async function buildAppShellPerms(userId: string): Promise<string[]> {
  const admin = await isAdminUser(userId)
  if (admin) return ADMIN_LEGACY

  const { data } = await adminDb()
    .from('user_effective_permissions')
    .select('sub_page_code, can_read, can_create, can_update, can_delete')
    .eq('user_id', userId)

  const result = new Set<string>()
  for (const row of data ?? []) {
    if (!row.can_read) continue
    const legacy = SUB_TO_LEGACY[row.sub_page_code]
    if (legacy) result.add(legacy)
    // can_create → write variant
    if (row.can_create) {
      const writeVariant = legacy?.replace(':read', ':write')
      if (writeVariant) result.add(writeVariant)
    }
  }
  return Array.from(result)
}

export async function requirePermOrAdmin(
  subPageCode: string,
  action: 'can_read' | 'can_create' | 'can_update' | 'can_delete' = 'can_read'
): Promise<
  { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; isAdmin: boolean } |
  { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }
  const [admin, hasPerm] = await Promise.all([
    isAdminUser(user.id),
    hasSubPagePerm(user.id, subPageCode, action),
  ])
  if (!admin && !hasPerm) {
    return { ok: false, response: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true, user, isAdmin: admin }
}
