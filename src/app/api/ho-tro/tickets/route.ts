import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/ho-tro/tickets?staffName=Kane&month=6&year=2026&page=1&limit=50
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  const isAdmin = perms.includes('admin:users')
  const hasAccess = isAdmin || perms.includes('ho_tro:read') || perms.includes('ho_tro:write')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp          = new URL(req.url).searchParams
  const staffName = sp.get('staffName')
  const month     = sp.get('month')
  const year      = sp.get('year')
  const search      = sp.get('search') ?? ''
  const pendingOnly = sp.get('pendingOnly') === 'true'
  const page      = Math.max(1, parseInt(sp.get('page') ?? '1'))
  const limit     = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '100')))
  const offset    = (page - 1) * limit

  let query = db.from('ho_tro_tickets').select('*', { count: 'exact' })

  // Non-admin: can only see their own staff name
  if (!isAdmin && staffName) {
    const myName = user.email?.split('@')[0] ?? ''
    if (staffName.toLowerCase() !== myName.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (staffName) query = query.ilike('staff_name', staffName)

  if (month && year) {
    const y = year.length === 4 ? year : `20${year}`
    const m = month.padStart(2, '0')
    query = query
      .gte('ticket_date', `${y}-${m}-01`)
      .lte('ticket_date', `${y}-${m}-31`)
  }

  if (search) {
    query = query.or(
      `code.ilike.%${search}%,company.ilike.%${search}%,content.ilike.%${search}%,reply.ilike.%${search}%`
    )
  }

  if (pendingOnly) {
    query = query.in('speed_tag', ['hen', 'mai_bao_lai'])
  }

  const { data, error, count } = await query
    .order('ticket_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data ?? [], total: count ?? 0, page, limit })
}

// PATCH /api/ho-tro/tickets — cập nhật ticket (date, reply, status)
export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  const hasAccess = perms.includes('admin:users') || perms.includes('ho_tro:write')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    id: string
    ticket_date?: string
    reply?: string
    status?: string
    content?: string
  }
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Non-admin can only edit their own tickets
  const isAdmin = perms.includes('admin:users')
  if (!isAdmin) {
    const { data: ticket } = await db.from('ho_tro_tickets').select('staff_name').eq('id', id).single()
    const myName = user.email?.split('@')[0] ?? ''
    if (!ticket || ticket.staff_name.toLowerCase() !== myName.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const allowed = ['ticket_date', 'reply', 'status', 'content']
  const patch: Record<string, string> = {}
  for (const k of allowed) {
    if (k in updates) patch[k] = (updates as Record<string, string>)[k]
  }

  const { error } = await db.from('ho_tro_tickets').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
