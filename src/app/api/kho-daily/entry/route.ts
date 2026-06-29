import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (o.message) return String(o.message)
    if (o.details) return `${o.code}: ${o.details}`
    return JSON.stringify(e)
  }
  return String(e)
}

interface DeviceQty  { device: string; qty: number }
interface ThuHoiItem { loai: string; device: string; qty: number }
interface OtherTask  { task: string; device: string; qty: number }

// POST /api/kho-daily/entry — manual data entry from web form
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      person_name,
      entry_date,
      week_label,
      thanh_pham_devices = [] as DeviceQty[],
      hang_gui_vp_devices = [] as DeviceQty[],
      xuat_kho_devices    = [] as DeviceQty[],
      thu_hoi_details     = [] as ThuHoiItem[],
      other_tasks         = [] as OtherTask[],
    } = body

    if (!person_name || !entry_date) {
      return NextResponse.json({ error: 'Thiếu person_name hoặc entry_date' }, { status: 400 })
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
      return NextResponse.json({ error: 'entry_date phải có dạng YYYY-MM-DD' }, { status: 400 })
    }

    // Calculate totals
    const thanh_pham_total = (thanh_pham_devices as DeviceQty[]).reduce((s: number, x: DeviceQty) => s + (x.qty || 0), 0)
    const hang_gui_vp_total = (hang_gui_vp_devices as DeviceQty[]).reduce((s: number, x: DeviceQty) => s + (x.qty || 0), 0)
    const xuat_kho_total = (xuat_kho_devices as DeviceQty[]).reduce((s: number, x: DeviceQty) => s + (x.qty || 0), 0)
    const thu_hoi_total = (thu_hoi_details as ThuHoiItem[]).reduce((s: number, x: ThuHoiItem) => s + (x.qty || 0), 0)
    const other_total = (other_tasks as OtherTask[]).reduce((s: number, x: OtherTask) => s + (x.qty || 0), 0)

    const record = {
      person_name,
      entry_date,
      week_label: week_label || null,
      thanh_pham_devices,
      hang_gui_vp_devices,
      xuat_kho_devices,
      thu_hoi_details,
      other_tasks,
      thanh_pham_total,
      hang_gui_vp_total,
      xuat_kho_total,
      thu_hoi_total,
      other_total,
      updated_at: new Date().toISOString(),
    }

    const client = sb()
    const { error } = await client
      .from('kho_daily_records')
      .upsert(record, { onConflict: 'person_name,entry_date' })

    if (error) {
      return NextResponse.json({ error: errMsg(error) }, { status: 500 })
    }

    return NextResponse.json({ ok: true, totals: { thanh_pham_total, hang_gui_vp_total, xuat_kho_total, thu_hoi_total, other_total } })
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}
