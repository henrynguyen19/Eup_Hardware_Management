import { NextResponse, type NextRequest } from 'next/server'

// Supabase session cookie 前綴（projectRef = ntapfguwmuufnlafroxs）
const SESSION_COOKIE = 'sb-ntapfguwmuufnlafroxs-auth-token'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 放行登入與 OAuth callback 路由
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  // 檢查 Supabase session cookie（支援分段 cookie .0 .1）
  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(`${SESSION_COOKIE}.0`) ||
    request.cookies.has(`${SESSION_COOKIE}.1`)

  if (!hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // 排除靜態資源，其餘全部進入 middleware
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
