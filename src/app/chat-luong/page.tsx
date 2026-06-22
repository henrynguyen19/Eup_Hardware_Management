import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'
import ChatLuongDashboard from '@/components/chat-luong/ChatLuongDashboard'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUserPermissions(userId: string): Promise<string[]> {
  const { data } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  return data?.permissions ?? []
}

// v2: bypass sheet filter, KTV stats, thong ke tab
export default async function ChatLuongPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await getUserPermissions(user.id)
  const isAdmin       = permissions.includes('admin:users')
  const canChatLuong  = permissions.includes('chat_luong:read') || isAdmin

  if (!canChatLuong) redirect('/kho')

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <ChatLuongDashboard
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
      />
    </AppShell>
  )
}
