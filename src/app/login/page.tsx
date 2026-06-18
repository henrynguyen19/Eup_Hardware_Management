'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

type View = 'login' | 'forgot' | 'forgot_sent'

export default function LoginPage() {
  const router = useRouter()
  const [view, setView]         = useState<View>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) { setError('Vui lòng nhập đầy đủ thông tin'); return }
    setLoading(true); setError('')
    const email = username.includes('@') ? username.trim() : `${username.trim()}@eup.net.vn`
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError('Tên đăng nhập hoặc mật khẩu không đúng'); setLoading(false); return }
    router.push('/'); router.refresh()
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail.trim()) { setError('Vui lòng nhập email'); return }
    setLoading(true); setError('')
    const email = forgotEmail.includes('@') ? forgotEmail.trim() : `${forgotEmail.trim()}@eup.net.vn`
    const redirectTo = window.location.origin + '/reset-password'
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (resetErr) { setError('Không thể gửi email. Kiểm tra lại địa chỉ email.'); return }
    setView('forgot_sent')
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0d2a4a' }}>
      {/* Left panel */}
      <div className="hidden lg:flex w-96 flex-col items-center justify-center px-12 relative overflow-hidden"
           style={{ background: 'linear-gradient(160deg, #0d2a4a 0%, #164d81 100%)' }}>
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-10" style={{ background: '#A70A0A' }} />
        <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full opacity-5" style={{ background: '#00AF50' }} />
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />
        <div className="relative text-center">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl font-black text-white text-2xl"
               style={{ background: '#A70A0A', letterSpacing: '-0.05em' }}>EUP</div>
          <h1 className="text-3xl font-extrabold text-white tracking-wide mb-2">EUP HARDWARE</h1>
          <div className="h-0.5 w-16 mx-auto mb-4 rounded" style={{ background: '#00AF50' }} />
          <p className="text-white/60 text-sm leading-relaxed">Hệ thống quản lý nội bộ<br/>bộ phận kỹ thuật Hardware</p>
          <div className="mt-12 space-y-3">
            {[
              { icon: '📦', text: 'Quản lý thiết bị & phụ kiện' },
              { icon: '🛠️', text: 'Hỗ trợ kỹ thuật' },
              { icon: '🚗', text: 'Xe & thiết bị cần lắp' },
            ].map(f => (
              <div key={f.icon} className="flex items-center gap-3 text-white/50 text-sm">
                <span>{f.icon}</span><span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 font-black text-white text-lg shadow-lg" style={{ background: '#A70A0A' }}>EUP</div>
            <h1 className="text-xl font-bold text-white">EUP Hardware</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />

            {/* ── View: Đăng nhập ── */}
            {view === 'login' && (
              <div className="p-8">
                <h2 className="text-xl font-bold mb-1" style={{ color: '#0d2a4a' }}>Đăng nhập</h2>
                <p className="text-gray-400 text-xs mb-6">Chỉ dành cho nhân viên bộ phận Hardware</p>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>Tên đăng nhập</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="VD: henry hoặc henry@eup.net.vn"
                      autoComplete="username" autoFocus
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition"
                      onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>Mật khẩu</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" autoComplete="current-password"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition"
                      onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
                    />
                    <div className="mt-1.5 text-right">
                      <button type="button" onClick={() => { setView('forgot'); setError(''); setForgotEmail(username) }}
                        className="text-xs transition" style={{ color: '#A70A0A' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.textDecoration = 'underline'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.textDecoration = ''}>
                        Quên mật khẩu?
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  )}
                  <button type="submit" disabled={loading}
                    className="w-full text-white font-bold py-3 rounded-xl transition-all text-sm mt-2 disabled:opacity-60"
                    style={{ background: '#A70A0A' }}
                    onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#8b0808' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#A70A0A' }}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Đang đăng nhập...
                      </span>
                    ) : 'Đăng nhập'}
                  </button>
                </form>
                <p className="text-center text-xs text-gray-400 mt-5">Liên hệ IT nếu cần hỗ trợ tài khoản</p>
              </div>
            )}

            {/* ── View: Quên mật khẩu ── */}
            {view === 'forgot' && (
              <div className="p-8">
                <button onClick={() => { setView('login'); setError('') }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-4 transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  Quay lại đăng nhập
                </button>
                <h2 className="text-xl font-bold mb-1" style={{ color: '#0d2a4a' }}>Quên mật khẩu</h2>
                <p className="text-gray-400 text-xs mb-6">Nhập email EUP của bạn — hệ thống sẽ gửi link đặt lại mật khẩu</p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>Email</label>
                    <input type="text" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      placeholder="VD: henry hoặc henry@eup.net.vn"
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition"
                      onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
                    />
                  </div>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  )}
                  <button type="submit" disabled={loading || !forgotEmail.trim()}
                    className="w-full text-white font-bold py-3 rounded-xl transition-all text-sm disabled:opacity-60"
                    style={{ background: '#A70A0A' }}
                    onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#8b0808' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#A70A0A' }}>
                    {loading ? 'Đang gửi...' : '📧 Gửi link đặt lại mật khẩu'}
                  </button>
                </form>
              </div>
            )}

            {/* ── View: Đã gửi email ── */}
            {view === 'forgot_sent' && (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl" style={{ background: '#00AF5015' }}>
                  📧
                </div>
                <h2 className="text-lg font-bold mb-2" style={{ color: '#0d2a4a' }}>Kiểm tra email của bạn</h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-1">
                  Link đặt lại mật khẩu đã được gửi đến:
                </p>
                <p className="font-semibold text-sm mb-4" style={{ color: '#A70A0A' }}>
                  {forgotEmail.includes('@') ? forgotEmail : `${forgotEmail}@eup.net.vn`}
                </p>
                <p className="text-gray-400 text-xs mb-6">
                  Click vào link trong email để đặt mật khẩu mới.<br/>
                  Link có hiệu lực trong 1 giờ.
                </p>
                <button onClick={() => { setView('login'); setError(''); setForgotEmail('') }}
                  className="text-sm font-medium transition" style={{ color: '#A70A0A' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.textDecoration = 'underline'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.textDecoration = ''}>
                  ← Quay lại đăng nhập
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
            © 2025 CTCP Công nghệ EUPFIN Việt Nam
          </p>
        </div>
      </div>
    </div>
  )
}
