'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'
import OrderDetailView from '@/components/giao-nhan/OrderDetailView'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)
  const isAdmin = permissions.includes('admin')
  const isKho   = isAdmin || permissions.includes('giao_nhan_kho')

  const { data: order, error } = await sb()
    .from('giao_hang_don_hang')
    .select('*, giao_hang_don_items(*)')
    .eq('id', params.id)
    .single()

  if (error || !order) redirect('/giao-nhan')

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <OrderDetailView
        order={order}
        userEmail={user.email ?? ''}
        isKho={isKho}
        isAdmin={isAdmin}
      />
    </AppShell>
  )
}
