import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_DOMAINS = ['eup.com.tw', 'eup.com.vn']

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    // exchange thất bại（code 過期或已用）：直接跳回đăng nhập頁
    if (error || !data.user) {
      return NextResponse.redirect(`${origin}/login`)
    }

    // 非公司信箱：Đăng xuất並Hiển thị錯誤（嚴格比對 domain，防範 @fake-eup.com.tw 偽造）
    const emailDomain = data.user.email?.split('@')[1]
    if (!emailDomain || !ALLOWED_DOMAINS.includes(emailDomain)) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=unauthorized`)
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
