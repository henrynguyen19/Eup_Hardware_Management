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

  function isActive(href: string) {
    if (href === '/kho') return pathname === '/kho' || pathname.startsWith('/kho/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const userDisplayName = userEmail.split('@')[0]
  const userInitial = userEmail.charAt(0).toUpperCase()

  return (
    <aside className="w-56 min-h-screen flex flex-col flex-shrink-0" style={{ background: '#0d2a4a' }}>

      {/* Top accent stripe */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />

      {/* Brand */}
      <div className="px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          {/* EUP Logo mark */}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-white text-sm tracking-tight shadow"
               style={{ background: '#A70A0A', fontFamily: 'sans-serif', letterSpacing: '-0.05em' }}>
            EUP
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight tracking-wide">HARDWARE</p>
            <p className="text-xs leading-tight" style={{ color: '#00AF50' }}>Quản lý nội bộ</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visibleItems.map(item => {
          const active = isActive(item.href)
          return item.comingSoon ? (
            <div
              key={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-default select-none"
              title="Sắp ra mắt"
              style={{ opacity: 0.35 }}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <span className="text-white text-sm font-medium flex-1 truncate">{item.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                Soon
              </span>
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150"
              style={active
                ? { background: '#A70A0A', color: '#fff', boxShadow: '0 2px 8px rgba(167,10,10,0.4)' }
                : { color: 'rgba(255,255,255,0.7)' }
              }
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '' }}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                      style={{ background: '#00AF50', color: '#fff' }}>
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom green accent */}
      <div className="mx-4 mb-3" style={{ height: '1px', background: 'rgba(0,175,80,0.3)' }} />

      {/* User + Logout */}
      <div className="px-2 pb-3">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
               style={{ background: '#A70A0A' }}>
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{userDisplayName}</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>@eup.net.vn</p>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="p-1.5 rounded-lg transition-all flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = 'rgba(167,10,10,0.2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLElement).style.background = '' }}
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
