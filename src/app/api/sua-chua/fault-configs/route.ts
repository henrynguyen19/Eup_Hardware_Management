import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Canonical defaults — match Google Sheets exactly
const DEFAULT_FAULT_TYPES_BY_STATUS: Record<string, string[]> = {
  da_sua: [
    'POWER', 'POWER connector', 'GSM', 'GPS', 'RFID', 'BUZZER', 'ACC',
    'RS232', 'I/O', 'UPDATE', 'Lỗi cấu hình', 'Lỗi Sim', 'Lỗi audio',
    'Lỗi IR', 'Lỗi thấu kính', 'Lỗi video cable', 'Lỗi thẻ nhớ',
    'Lỗi màn hình hiển thị', 'Lost camera signal',
  ],
  gui_bao_hanh: [
    'POWER', 'GSM', 'GPS', 'RFID', 'BUZZER', 'ACC', 'RS232', 'I/O',
    'UPDATE', 'Lỗi cấu hình', 'Lỗi Sim', 'Lỗi audio', 'Lỗi IR',
    'Lỗi thấu kính', 'Lỗi video cable', 'Lỗi thẻ nhớ',
    'Lỗi màn hình hiển thị', 'Lost camera signal', 'Lỗi Loa', 'không xác định',
  ],
  khong_loi: [
    'Installation (lắp đặt)', 'Power', 'Unuse (xóa xe)', 'RS232', 'Buzzer',
    'Change vehicles', 'ACC', 'RFID', 'GSM', 'GPS', 'Roaming', 'Temperature',
    'Config', 'Sim-card', 'audio', 'IR', 'Lens', 'video cable', 'SD card',
    'Lỗi màn hình hiển thị', 'Lost camera signal',
  ],
  hong_han: [
    'burnt components', 'RS232', 'POWER', 'Không nhận thẻ',
    'Oxidation', 'Broken', 'Lỗi nhiệt',
  ],
  cho_sua: [
    'POWER', 'POWER connector', 'GSM', 'GPS', 'RFID', 'BUZZER', 'ACC',
    'RS232', 'I/O', 'UPDATE', 'Lỗi cấu hình', 'Lỗi Sim', 'Lỗi audio',
    'Lỗi IR', 'Lỗi thấu kính', 'Lỗi video cable', 'Lỗi thẻ nhớ',
    'Lỗi màn hình hiển thị', 'Lost camera signal', 'Không xác định',
  ],
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('repair_fault_configs')
      .select('status_type, fault_type, sort_order')
      .order('sort_order')

    if (error) throw error

    // Auto-seed defaults if table is empty
    if (!data || data.length === 0) {
      const rows: Array<{ status_type: string; fault_type: string; sort_order: number }> = []
      for (const [status, faults] of Object.entries(DEFAULT_FAULT_TYPES_BY_STATUS)) {
        faults.forEach((ft, i) => rows.push({ status_type: status, fault_type: ft, sort_order: i }))
      }
      await supabase.from('repair_fault_configs').insert(rows)
      return NextResponse.json({ configs: DEFAULT_FAULT_TYPES_BY_STATUS })
    }

    // Group by status_type preserving sort_order
    const configs: Record<string, string[]> = {}
    for (const row of data) {
      if (!configs[row.status_type]) configs[row.status_type] = []
      configs[row.status_type].push(row.fault_type)
    }
    return NextResponse.json({ configs })
  } catch {
    // Fallback to defaults if table doesn't exist yet
    return NextResponse.json({ configs: DEFAULT_FAULT_TYPES_BY_STATUS })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { status_type, fault_type } = await req.json()
    if (!status_type || !fault_type?.trim()) {
      return NextResponse.json({ error: 'Thiếu status_type hoặc fault_type' }, { status: 400 })
    }

    // Get current max sort_order for this status
    const { data: existing } = await supabase
      .from('repair_fault_configs')
      .select('sort_order')
      .eq('status_type', status_type)
      .order('sort_order', { ascending: false })
      .limit(1)

    const sort_order = (existing && existing.length > 0) ? (existing[0].sort_order + 1) : 0

    const { error } = await supabase
      .from('repair_fault_configs')
      .insert({ status_type, fault_type: fault_type.trim(), sort_order })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { status_type, fault_type } = await req.json()
    if (!status_type || !fault_type) {
      return NextResponse.json({ error: 'Thiếu status_type hoặc fault_type' }, { status: 400 })
    }

    const { error } = await supabase
      .from('repair_fault_configs')
      .delete()
      .eq('status_type', status_type)
      .eq('fault_type', fault_type)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
