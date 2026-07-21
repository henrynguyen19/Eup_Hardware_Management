import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildAppShellPerms, isAdminUser } from '@/lib/auth-helpers'
import AppShell from '@/components/AppShell'

export default async function ThongKePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permissions = await buildAppShellPerms(user.id)

  return (
    <AppShell userEmail={user.email ?? ''} permissions={permissions}>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="text-6xl">📊</div>
          <h1 className="text-2xl font-bold text-gray-800">Thống kê sửa chữa thiết bị</h1>
          <p className="text-gray-500 max-w-sm">
            Module đang được phát triển. Sẽ hiển thị thống kê tình trạng sửa chữa,
            lịch sử bảo trì và báo cáo hiệu suất thiết bị.
          </p>
          <span className="inline-block px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            Sắp ra mắt
          </span>
        </div>
      </div>
    </AppShell>
  )
}
