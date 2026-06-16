'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

interface UserMenuProps {
  email: string
  permissions?: string[]
  trackerBadge?: number
}

export default function UserMenu({ email, permissions = [], trackerBadge = 0 }: UserMenuProps) {
  const router = useRouter()
  const canViewTracker = permissions.includes('view_tracker')

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      {canViewTracker && (
        <Link
          href="/tracker"
          className="relative flex items-center gap-1 text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] transition-colors whitespace-nowrap"
        >
          Nhiệm vụ
          {trackerBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-[#ef4444] text-white rounded-full leading-none">
              {trackerBadge > 99 ? '99+' : trackerBadge}
            </span>
          )}
        </Link>
      )}
      <span className="text-sm text-[#a08060] hidden sm:block truncate max-w-[200px]">
        {email}
      </span>
      <button
        onClick={signOut}
        className="text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] transition-colors whitespace-nowrap"
      >
        Đăng xuất
      </button>
    </div>
  )
}
