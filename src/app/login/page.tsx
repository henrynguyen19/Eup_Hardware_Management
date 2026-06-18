'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin')
      return
    }
    setLoading(true)
    setError('')
    const email = username.includes('@') ? username.trim() : `${username.trim()}@eup.net.vn`
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Tên đăng nhập hoặc mật khẩu không đúng')
      setLoading(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0d2a4a' }}>
      {/* Left panel - brand */}
      <div className="hidden lg:flex w-96 flex-col items-center justify-center px-12 relative overflow-hidden"
           style={{ background: 'linear-gradient(160deg, #0d2a4a 0%, #164d81 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-10"
             style={{ background: '#A70A0A' }} />
        <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full opacity-5"
             style={{ background: '#00AF50' }} />
        {/* Green stripe */}
        <div className="absolute top-0 left-0 right-0 h-1"
             style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />

        <div className="relative text-center">
          {/* Big EUP logo */}
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl font-black text-white text-2xl"
               style={{ background: '#A70A0A', letterSpacing: '-0.05em' }}>
            EUP
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-wide mb-2">
            EUP HARDWARE
          </h1>
          <div className="h-0.5 w-16 mx-auto mb-4 rounded" style={{ background: '#00AF50' }} />
          <p className="text-white/60 text-sm leading-relaxed">
            Hệ thống quản lý nội bộ<br/>bộ phận kỹ thuật Hardware
          </p>

          <div className="mt-12 space-y-3">
            {[
              { icon: '📦', text: 'Quản lý thiết bị & phụ kiện' },
              { icon: '🛠️', text: 'Hỗ trợ kỹ thuật' },
              { icon: '🚗', text: 'Xe & thiết bị cần lắp' },
            ].map(f => (
              <div key={f.icon} className="flex items-center gap-3 text-white/50 text-sm">
                <span>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 font-black text-white text-lg shadow-lg"
                 style={{ background: '#A70A0A' }}>
              EUP
            </div>
            <h1 className="text-xl font-bold text-white">EUP Hardware</h1>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Card top accent */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />

            <div className="p-8">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0d2a4a' }}>Đăng nhập</h2>
              <p className="text-gray-400 text-xs mb-6">Chỉ dành cho nhân viên bộ phận Hardware</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>
                    Tên đăng nhập
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="VD: henry hoặc henry@eup.net.vn"
                    autoComplete="username"
                    autoFocus
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm transition outline-none"
                    style={{ '--tw-ring-color': '#A70A0A' } as React.CSSProperties}
                    onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>
                    Mật khẩu
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm transition outline-none"
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white font-bold py-3 rounded-xl transition-all duration-200 text-sm mt-2 disabled:opacity-60"
                  style={{ background: loading ? '#A70A0A99' : '#A70A0A' }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#8b0808' }}
                  onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#A70A0A' }}
                >
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

              <p className="text-center text-xs text-gray-400 mt-5">
                Liên hệ IT nếu cần hỗ trợ tài khoản
              </p>
            </div>
          </div>

          <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
            © 2025 CTCP Công nghệ EUPFIN Việt Nam
          </p>
        </div>
      </div>
    </div>
  )
}
