/**
 * GET /api/repair-tracking/stale-devices
 * Trả về thiết bị ở trạng thái cho_gui/da_gui quá 7 ngày (tính từ received_at hoặc sent_at).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const db = sb()
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // cho_gui quá 7 ngày (tính từ received_at)
    const { data: choGui } = await db
      .from('repair_items')
      .select('id, imei, product_name, status, received_at, sent_at, repair_warehouse, notes')
      .eq('status', 'cho_gui')
      .lt('received_at', cutoff)
      .order('received_at', { ascending: true })

    // da_gui quá 7 ngày (tính từ sent_at)
    const { data: daGui } = await db
      .from('repair_items')
      .select('id, imei, product_name, status, received_at, sent_at, repair_warehouse, notes')
      .eq('status', 'da_gui')
      .lt('sent_at', cutoff)
      .order('sent_at', { ascending: true })

    const items = [
      ...(choGui ?? []),
      ...(daGui ?? []),
    ]

    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
