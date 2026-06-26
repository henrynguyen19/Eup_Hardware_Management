/**
 * GET  /api/crm/hashtags         — list all definitions + usage count
 * POST /api/crm/hashtags         — create new hashtag (admin only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function checkAdmin(db: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await db.from('user_permissions_view').select('permissions').eq('user_id', userId).single()
  return ((data?.permissions ?? []) as string[]).includes('admin:users')
}

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data, error } = await db
    .from('hashtag_definitions')
    .select('*')
    .order('category')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ hashtags: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  if (!await checkAdmin(db, user.id))
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json() as { tag: string; meaning: string; category: string; description?: string; example?: string }
  if (!body.tag || !body.meaning)
    return NextResponse.json({ error: 'tag và meaning là bắt buộc' }, { status: 400 })

  const { data, error } = await db.from('hashtag_definitions').insert({
    tag:         body.tag.startsWith('#') ? body.tag : `#${body.tag}`,
    meaning:     body.meaning,
    category:    body.category ?? 'other',
    description: body.description ?? '',
    example:     body.example ?? '',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, hashtag: data })
}
