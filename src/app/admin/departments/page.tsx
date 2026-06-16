import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'
import { requirePermission } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'
import DepartmentsManager from '@/components/DepartmentsManager'

export interface RoleBasic {
  id: string
  name: string
  is_system: boolean
  dept_group: string | null
  level: string | null
}

const ROLE_ORDER = [
  'Quản trị viên', 'Quản lý (Chuỗi cung ứng)', 'Quản lý (Mua hàng)', 'Quản lý (Kỹ thuật)', 'Quản lý (Kinh doanh)', 'Quản lý (Kỹ sư)',
  'Chuỗi cung ứng', 'Mua hàng', 'Kỹ thuật', 'Kinh doanh', 'Kỹ sư', 'Người dùng thông thường',
]

function sortByRoleOrder<T extends { name: string }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.name)
    const bi = ROLE_ORDER.indexOf(b.name)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

async function fetchRoles(): Promise<RoleBasic[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .order('id', { ascending: true })

    if (error || !data) return []

    const mapped = data.map((row: {
      id: string
      name: string
      is_system: boolean
      dept_group: string | null
      level: string | null
    }) => ({
      id: row.id,
      name: row.name,
      is_system: row.is_system ?? false,
      dept_group: row.dept_group ?? null,
      level: row.level ?? null,
    }))
    return sortByRoleOrder(mapped)
  } catch {
    return []
  }
}

export default async function AdminDepartmentsPage() {
  const [user, roles] = await Promise.all([
    requirePermission('manage_roles'),
    fetchRoles(),
  ])

  if (!user) redirect('/')

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/roles" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">Quản lý bộ phận</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <DepartmentsManager initialRoles={roles} />
      </div>
    </main>
  )
}
