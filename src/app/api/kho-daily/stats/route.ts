import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/kho-daily/stats
// ?from=2026-01-01&to=2026-06-30  — date range (default: last 30 days)
// &person=Kai                      — optional person filter
// &mode=detail&date=2026-06-29&person=Nick — single day device detail
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const person = searchParams.get('person')
  const mode   = searchParams.get('mode')
  const date   = searchParams.get('date')

  const client = sb()

  if (mode === 'detail' && date && person) {
    const { data, error } = await client
      .from('kho_daily_records')
      .select('*')
      .eq('person_name', person)
      .eq('entry_date', date)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ record: data })
  }

  let query = client
    .from('kho_daily_records')
    .select('*')
    .order('entry_date', { ascending: false })

  if (from)   query = query.gte('entry_date', from)
  if (to)     query = query.lte('entry_date', to)
  if (person) query = query.eq('person_name', person)

  const { data, error } = await query.limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ records: data ?? [] })
}
