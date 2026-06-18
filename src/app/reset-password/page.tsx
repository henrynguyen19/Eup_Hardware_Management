'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [ready, setReady]         = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Supabase gắn token vào URL hash (#access_token=...) sau khi user click link email
  // onAuthStateChange sẽ bắt sự kiện PASSWORD_RECOVERY
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    // Fallback: nếu đã có session (user đã được xác thực qua link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [supabase.auth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPw.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự'); return }
    if (newPw !== confirmPw) { setError('Mật khẩu xác nhận không khớp'); return }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setLoading(false)

    if (updateErr) { setError(updateErr.message); return }
    setSuccess(true)
    setTimeout(() => router.push('/'), 2500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0d2a4a' }}>
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #A70A0A, #00AF50)' }} />

          {success ? (
            <div className="p-10 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-lg font-bold mb-2" style={{ color: '#0d2a4a' }}>Đặt mật khẩu thành công!</h2>
              <p className="text-gray-400 text-sm">Đang chuyển về trang chính...</p>
            </div>
          ) : !ready ? (
            <div className="p-10 text-center">
              <div className="text-4xl mb-4 animate-pulse">🔑</div>
              <p className="text-gray-500 text-sm">Đang xác thực link reset...</p>
              <p className="text-gray-300 text-xs mt-2">Nếu chờ quá lâu, hãy thử lại từ email</p>
            </div>
          ) : (
            <div className="p-8">
              {/* Logo mini */}
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                     style={{ background: '#A70A0A' }}>EUP</div>
                <div>
                  <h2 className="font-bold text-gray-800">Đặt mật khẩu mới</h2>
                  <p className="text-xs text-gray-400">Mật khẩu phải có ít nhất 6 ký tự</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>Mật khẩu mới</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                    placeholder="Nhập mật khẩu mới" autoFocus
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition"
                    onFocus={e => { e.currentTarget.style.borderColor = '#A70A0A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,10,10,0.1)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: '#0d2a4a' }}>Xác nhận mật khẩu</label>
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
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

                <button type="submit" disabled={loading || !newPw || !confirmPw}
                  className="w-full text-white font-bold py-3 rounded-xl transition-all text-sm disabled:opacity-60"
                  style={{ background: '#A70A0A' }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#8b0808' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#A70A0A' }}>
                  {loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
          © 2025 CTCP Công nghệ EUPFIN Việt Nam
        </p>
      </div>
    </div>
  )
}
