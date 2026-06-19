'use client'

import { useState } from 'react'
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
  const [showChangePw, setShowChangePw] = useState(false)

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems: NavItem[] = [
    { icon: '📦', label: 'Quản lý thiết bị',  href: '/kho' },
    { icon: '🛠️', label: 'Hỗ trợ kỹ thuật',  href: '/ho-tro',      show: canHoTro || isAdmin },
    { icon: '📜', label: 'Giấy chứng nhận',   href: '/chung-nhan' },
    { icon: '📊', label: 'Thống kê sửa chữa', href: '/sua-chua' },
    { icon: '🚚', label: 'Thông tin giao nhận',href: '/giao-nhan',  comingSoon: true },
    { icon: '👥', label: 'Phân quyền & User', href: '/admin/users', show: isAdmin },
  ]

  const visibleItems = navItems.filter(item => item.show === undefined || item.show === true)

  function isActive(href: string) {
    if (href === '/kho') return pathname === '/kho' || pathname.startsWith('/kho/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const userDisplayName = userEmail.split('@')[0]
  const userInitial = userEmail.charAt(0).toUpperCase()

  return (
    <>
      <aside className="w-56 min-h-screen flex flex-col flex-shrink-0" style={{ background: '#0d2a4a' }}>

        {/* Top accent stripe */}
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />

        {/* Brand */}
        <div className="px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-white text-sm shadow"
                 style={{ background: '#A70A0A', letterSpacing: '-0.05em' }}>
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
              <div key={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-default select-none" title="Sắp ra mắt" style={{ opacity: 0.35 }}>
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                <span className="text-white text-sm font-medium flex-1 truncate">{item.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>Soon</span>
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
              </Link>
            )
          })}
        </nav>

        {/* Bottom green accent */}
        <div className="mx-4 mb-3" style={{ height: '1px', background: 'rgba(0,175,80,0.3)' }} />

        {/* User + Logout */}
        <div className="px-2 pb-3 space-y-1">
          {/* Đổi mật khẩu */}
          <button
            onClick={() => setShowChangePw(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
            style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)' }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Đổi mật khẩu
          </button>

          {/* User info */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
               style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: '#A70A0A' }}>
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

      {/* Modal đổi mật khẩu */}
      {showChangePw && (
        <ChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
    </>
  )
}

// ── Modal đổi mật khẩu ────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPw.length < 6) { setError('Mật khẩu mới phải có ít nhất 6 ký tự'); return }
    if (newPw !== confirmPw) { setError('Mật khẩu xác nhận không khớp'); return }

    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()

      // Xác minh mật khẩu hiện tại bằng cách thử đăng nhập lại
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user?.email) { setError('Không lấy được thông tin người dùng'); setLoading(false); return }

      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPw,
      })
      if (verifyErr) { setError('Mật khẩu hiện tại không đúng'); setLoading(false); return }

      // Đổi mật khẩu
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
      if (updateErr) { setError(updateErr.message); setLoading(false); return }

      setSuccess(true)
      setTimeout(() => onClose(), 2000)
    } catch {
      setError('Có lỗi xảy ra, thử lại sau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="h-1" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-800">Đổi mật khẩu</h2>
            <p className="text-xs text-gray-400 mt-0.5">Mật khẩu phải ít nhất 6 ký tự</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {success ? (
          <div className="px-6 py-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-green-700">Đổi mật khẩu thành công!</p>
            <p className="text-xs text-gray-400 mt-1">Đang đóng...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mật khẩu hiện tại</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại"
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none transition"
                onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mật khẩu mới</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Nhập mật khẩu mới (≥ 6 ký tự)"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none transition"
                onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none transition"
                onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading || !currentPw || !newPw || !confirmPw}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition disabled:opacity-50"
                style={{ background: '#A70A0A' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#8b0808' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#A70A0A' }}
              >
                {loading ? 'Đang lưu...' : 'Lưu mật khẩu'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
