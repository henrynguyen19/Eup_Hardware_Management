import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import ChatLuongDashboard from '@/components/chat-luong/ChatLuongDashboard'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


// v2: bypass sheet filter, KTV stats, thong ke tab
export default async function ChatLuongPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)
  const isAdmin = await isAdminUser(user.id)
  const canChatLuong = permissions.includes('chat_luong:read') || isAdmin

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
