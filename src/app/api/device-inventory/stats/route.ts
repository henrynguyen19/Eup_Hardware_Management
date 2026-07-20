/**
 * GET /api/device-inventory/stats
 * Cache: ket qua luu vao device_inventory_stats_cache (singleton, TTL 30 phut).
 * Dung ?refresh=1 de buoc tinh lai.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime     = 'nodejs'
export const maxDuration = 60

const CACHE_TTL_MIN = 30

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db      = sb()
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'

  if (!refresh) {
    const { data: cacheRow } = await db
      .from('device_inventory_stats_cache')
      .select('data, computed_at')
      .eq('id', 'singleton')
      .single()

    if (cacheRow) {
      const ageMin = (Date.now() - new Date(cacheRow.computed_at as string).getTime()) / 60_000
      if (ageMin < CACHE_TTL_MIN) {
        return NextResponse.json({
          ...(cacheRow.data as object),
          _cached: true,
          _cached_at: cacheRow.computed_at,
        })
      }
    }
  }

  const { count: invCount } = await db
    .from('device_inventory')
    .select('*', { count: 'exact', head: true })

  if (!invCount) {
    return NextResponse.json({
      totalImported: 0, totalUniqImei: 0, totalRepaired: 0, overallRepairRate: 0,
      byProduct: [], message: 'Chua co du lieu inventory.',
    })
  }

  const [overviewRes, byProductRes] = await Promise.all([
    db.rpc('device_inventory_overview'),
    db.rpc('device_inventory_failure_stats'),
  ])

  if (overviewRes.error) {
    return NextResponse.json({
      error: `RPC error: ${overviewRes.error.message}`,
    }, { status: 500 })
  }
  if (byProductRes.error) {
    return NextResponse.json({ error: byProductRes.error.message }, { status: 500 })
  }

  type ORow = { total_imported: number; total_uniq_imei: number; total_repaired: number }
  type PRow = {
    product_name: string
    total_imported: number; total_repaired: number
    total_supplier: number; total_scrap: number
    repair_rate: number; supplier_rate: number; scrap_rate: number
  }

  const ov = ((overviewRes.data as ORow[])?.[0]) ?? { total_imported: 0, total_uniq_imei: 0, total_repaired: 0 }
  const bp = (byProductRes.data as PRow[]) ?? []

  const totalUniq = Number(ov.total_uniq_imei)
  const totalRep  = Number(ov.total_repaired)

  const result = {
    totalImported:     Number(ov.total_imported),
    totalUniqImei:     totalUniq,
    totalRepaired:     totalRep,
    overallRepairRate: totalUniq > 0 ? Math.round(totalRep / totalUniq * 1000) / 10 : 0,
    byProduct: bp.map(p => ({
      product_name:   p.product_name,
      total_imported: Number(p.total_imported),
      total_repaired: Number(p.total_repaired),
      total_supplier: Number(p.total_supplier),
      total_scrap:    Number(p.total_scrap),
      repair_rate:    Number(p.repair_rate)   || 0,
      supplier_rate:  Number(p.supplier_rate) || 0,
      scrap_rate:     Number(p.scrap_rate)    || 0,
    })),
  }

  await db.from('device_inventory_stats_cache').upsert({
    id: 'singleton', data: result, computed_at: new Date().toISOString(),
  })

  return NextResponse.json(result)
}
