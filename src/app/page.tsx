import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { EquipmentCard } from '@/types/equipment'
import type { UserGroup } from '@/types/equipment'
import PhotoWall from '@/components/PhotoWall'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import type { Issue } from '@/app/tracker/page'

async function getEquipmentCards(): Promise<EquipmentCard[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('equipment_cards')
    .select('*')
    .order('equipment_id')

  if (error) {
    console.error('Supabase error:', error)
    return []
  }
  return data ?? []
}

async function getUserBookmarkNotes(userId: string): Promise<Record<string, string>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('user_bookmarks')
    .select('equipment_id, notes')
    .eq('user_id', userId)
    .not('notes', 'is', null)
  const result: Record<string, string> = {}
  ;(data ?? []).forEach((b: { equipment_id: string; notes: string | null }) => {
    if (b.notes) result[b.equipment_id] = b.notes
  })
  return result
}

async function getUserGroups(userId: string): Promise<UserGroup[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let { data: groups } = await supabase
    .from('user_groups')
    .select('*, group_items(equipment_id, added_at)')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('sort_order')

  // 懶遷移：若完全沒有Nhóm，從 user_bookmarks Tạo預設Nhóm並遷移
  if (!groups || groups.length === 0) {
    const { data: bookmarks } = await supabase
      .from('user_bookmarks')
      .select('equipment_id, created_at')
      .eq('user_id', userId)

    const { data: newGroup } = await supabase
      .from('user_groups')
      .insert({ user_id: userId, name: 'Theo dõi', is_default: true })
      .select()
      .single()

    if (newGroup && bookmarks && bookmarks.length > 0) {
      await supabase.from('group_items').insert(
        bookmarks.map((b: { equipment_id: string; created_at: string }) => ({
          group_id: newGroup.id,
          equipment_id: b.equipment_id,
          added_at: b.created_at,
        }))
      )
    }

    const { data: fresh } = await supabase
      .from('user_groups')
      .select('*, group_items(equipment_id, added_at)')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('sort_order')
    groups = fresh
  }

  return (groups ?? []) as UserGroup[]
}

async function getTrackerData(userEmail: string): Promise<{
  initialIssues: Issue[]
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const [issuesResult, allowedEmailsResult, settingsResult] = await Promise.allSettled([
    supabase
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at,
        issue_assignees(user_email)
      `)
      .order('created_at', { ascending: false }),
    supabase.from('allowed_emails').select('email'),
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['issueTypes', 'issueTags']),
  ])

  const issuesData = issuesResult.status === 'fulfilled' ? (issuesResult.value.data ?? []) : []
  const initialIssues: Issue[] = issuesData.map((issue) => {
    const emails: string[] = ((issue.issue_assignees ?? []) as { user_email: string }[]).map(
      (a) => a.user_email,
    )
    return {
      ...issue,
      issue_assignees: undefined,
      assignee_emails: emails,
      assignees: emails.map((e) => e.split('@')[0]),
    }
  })

  const allowedEmails: string[] =
    allowedEmailsResult.status === 'fulfilled'
      ? ((allowedEmailsResult.value.data ?? []) as { email: string }[]).map((r) => r.email)
      : []

  const settingsRows =
    settingsResult.status === 'fulfilled' ? (settingsResult.value.data ?? []) : []
  let issueTypes = ['缺貨', '韌體', '維修', '客戶反應', 'Khác']
  let issueTags: string[] = []
  for (const row of settingsRows as { key: string; value: unknown }[]) {
    if (row.key === 'issueTypes' && Array.isArray(row.value)) issueTypes = row.value as string[]
    if (row.key === 'issueTags' && Array.isArray(row.value)) issueTags = row.value as string[]
  }

  void userEmail // 保留參數供未來擴充（如個人化Lọc）
  return { initialIssues, allowedEmails, issueTypes, issueTags }
}

export default async function HomePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [cards, roleData, settings, initialGroups, initialBookmarkNotes] = await Promise.all([
    getEquipmentCards(),
    getUserRoleWithPermissions(),
    getSettings(),
    getUserGroups(user.id),
    getUserBookmarkNotes(user.id),
  ])

  const { permissions, roleName } = roleData
  const isAdmin = permissions.includes('create_delete_cards') || permissions.includes('crud_cards')

  // 伺服器端依quyền過濾Thiết bị（read_active_only → 只回現役）
  const activeStatus = settings.statuses[0] ?? 'Hiện hành'
  const filteredCards = permissions.includes('read_all_cards')
    ? cards
    : cards.filter(c => c.status === activeStatus)

  const hasTrackerPermission = permissions.includes('view_tracker')
  const trackerData = hasTrackerPermission ? await getTrackerData(user.email ?? '') : undefined

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <Suspense fallback={
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          Đang tải...
        </div>
      }>
        <PhotoWall
          initialCards={filteredCards}
          isAdmin={isAdmin}
          settings={settings}
          userEmail={user?.email ?? ''}
          initialGroups={initialGroups}
          initialBookmarkNotes={initialBookmarkNotes}
          permissions={permissions}
          userRole={roleName}
          trackerData={trackerData ?? undefined}
        />
      </Suspense>
    </main>
  )
}
