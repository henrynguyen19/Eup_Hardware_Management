'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

interface NavItem {
  icon: string
  label: string
  href: string
  show?: boolean
  badge?: string
  comingSoon?: boolean
}

interface Props {
  userEmail: string
  isAdmin: boolean
  canHoTro: boolean
}

export default function SidebarNav({ userEmail, isAdmin, canHoTro }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems: NavItem[] = [
    {
      icon: '📦',
      label: 'Quản lý thiết bị',
      href: '/kho',
    },
    {
      icon: '🛠️',
      label: 'Hỗ trợ kỹ thuật',
      href: '/ho-tro',
      show: canHoTro || isAdmin,
    },
    {
      icon: '📊',
      label: 'Thống kê sửa chữa',
      href: '/thong-ke',
      comingSoon: true,
    },
    {
      icon: '🚚',
      label: 'Thông tin giao nhận',
      href: '/giao-nhan',
      comingSoon: true,
    },
    {
      icon: '👥',
      label: 'Phân quyền & User',
      href: '/admin/users',
      show: isAdmin,
    },
  ]

  const visibleItems = navItems.filter(
    item => item.show === undefined || item.show === true
  )

  // Active: exact match OR starts with href (for sub-pages)
  function isActive(href: string) {
    if (href === '/kho') return pathname === '/kho' || pathname.startsWith('/kho/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const userInitial = userEmail.charAt(0).toUpperCase()

  return (
    <aside className="w-56 min-h-screen bg-slate-900 flex flex-col flex-shrink-0">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            E
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">EUP Hardware</p>
            <p className="text-slate-400 text-xs leading-tight">Quản lý bộ phận</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {visibleItems.map(item => {
          const active = isActive(item.href)
          return item.comingSoon ? (
            <div
              key={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-500 cursor-default select-none"
              title="Sắp ra mắt"
            >
              <span className="text-base w-5 text-center flex-shrink-0 opacity-50">{item.icon}</span>
              <span className="text-sm font-medium flex-1 truncate opacity-50">{item.label}</span>
              <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                Soon
              </span>
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
                ${active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }
              `}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-2 py-3 border-t border-slate-700/60">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-xs font-medium truncate">{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="text-slate-400 hover:text-red-400 transition p-1 rounded flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
