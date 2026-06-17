import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export default async function GiaoNhanPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const permissions: string[] = data?.permissions ?? []

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="text-6xl">🚚</div>
          <h1 className="text-2xl font-bold text-gray-800">Thông tin giao nhận hàng</h1>
          <p className="text-gray-500 max-w-sm">
            Module đang được phát triển. Sẽ quản lý đơn đặt hàng, theo dõi giao nhận
            thiết bị và phụ kiện giữa các bộ phận.
          </p>
          <span className="inline-block px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            Sắp ra mắt
          </span>
        </div>
      </div>
    </AppShell>
  )
}
