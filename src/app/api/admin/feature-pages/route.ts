import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/feature-pages — list all pages with sub-pages (admin only)
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pages } = await sb()
    .from('feature_pages')
    .select('*, feature_sub_pages(*)')
    .order('sort_order')

  // Sort sub-pages within each page
  const result = (pages ?? []).map(p => ({
    ...p,
    feature_sub_pages: (p.feature_sub_pages ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  }))

  return NextResponse.json({ pages: result })
}
