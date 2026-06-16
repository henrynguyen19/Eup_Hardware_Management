import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 預設quyền常數（SQL 執行前的 fallback）
const ADMIN_PERMISSIONS = [
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content',
  'use_bookmarks', 'filter_all_statuses', 'filter_no_photo', 'crud_cards', 'create_delete_cards',
  'manage_users', 'manage_roles', 'use_groups',
]
const VIEWER_PERMISSIONS = [
  'read_active_only',
  'read_documents', 'read_notes', 'read_vendor',
  'use_bookmarks', 'use_groups',
]

const ALLOWED_DOMAINS = ['eup.com.tw', 'eup.com.vn']

function isAllowedDomain(email: string): boolean {
  const domain = email.split('@')[1]
  return !!domain && ALLOWED_DOMAINS.includes(domain)
}

// 透過 roles + role_permissions 查quyền
// 若 roles 表不存在或找不到vai trò → 依舊 role tên做 fallback
export async function getUserRoleWithPermissions(): Promise<{ roleName: string; permissions: string[] }> {
  const supabase = createSupabaseServerClient()

  // 平行：驗證 session + 預載所有vai tròquyềndữ liệu
  const [{ data: { user } }, rolesResult] = await Promise.all([
    supabase.auth.getUser(),
    getServiceClient()
      .from('roles')
      .select('name, role_permissions(permission_key)')
      .order('id', { ascending: true }),
  ])

  if (!user?.email) return { roleName: '', permissions: VIEWER_PERMISSIONS }
  if (!isAllowedDomain(user.email)) return { roleName: '', permissions: VIEWER_PERMISSIONS }

  const { data: emailData } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  const roleName = emailData?.role ?? ''

  // 從預載的 roles dữ liệu比對（省去第三次 DB 往返）
  const roleRow = rolesResult.data?.find((r: { name: string; role_permissions: { permission_key: string }[] }) => r.name === roleName)
  if (roleRow && Array.isArray(roleRow.role_permissions)) {
    const permissions = roleRow.role_permissions.map((p: { permission_key: string }) => p.permission_key)
    return { roleName, permissions }
  }

  // Fallback：SQL 執行前，依舊英文 role tên判斷
  if (roleName === 'admin' || roleName === 'Quản trị viên') {
    return { roleName, permissions: ADMIN_PERMISSIONS }
  }
  return { roleName, permissions: VIEWER_PERMISSIONS }
}

// 檢查目前người dùng是否有特定 permission
export async function requirePermission(key: string) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { permissions } = await getUserRoleWithPermissions()
  return permissions.includes(key) ? user : null
}

export async function requireAdmin() {
  return requirePermission('manage_users')
}

export async function getUserRole(): Promise<'admin' | 'viewer' | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  // 非公司信箱：無quyền（嚴格比對 domain）
  if (!isAllowedDomain(user.email)) return null

  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  // allowed_emails 有記錄就用指定vai trò，否則公司信箱預設 viewer
  if (data?.role === 'admin') return 'admin'
  return 'viewer'
}
