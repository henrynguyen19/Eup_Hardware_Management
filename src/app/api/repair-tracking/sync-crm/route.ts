/**
 * POST /api/repair-tracking/sync-crm
 * Đồng bộ dữ liệu sửa chữa từ CRM vào bảng repair_items.
 * Body: { startTime: "YYYY-MM-DD HH:mm:ss", endTime: "...", staffName?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser, crmLoginRaw, getCRMCredentials } from '@/lib/crm-session'

export const runtime     = 'nodejs'
export const maxDuration = 60

const CRM_URL = 'https://slt.ctms.vn/Eup_Java_CRM_SOAP/CRMEup_Servlet_SOAP'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CRM field types ───────────────────────────────────────────
interface RepairRecord {
  Repair_ID:             number
  Device_ID:             number
  Device_Code:           string
  Unicode:               string
  ProductName:           string
  Repair_Description:    string
  RepairMan:             string
  RepairFinishMan:       string
  Repair_FinishReasonID: string
  Repair_Status:         number
  Repair_Status_String:  string
  Repair_InDate:         string   // ngày gửi vào kho sửa
  Repair_OutDate:        string   // ngày hoàn thành
  Repair_InsertDate:     string   // ngày tạo record (nhận về kho tổng)
  WareHouseName:         string
}

// ── Map CRM → our enums ───────────────────────────────────────
function mapStatus(r: RepairRecord): 'cho_gui' | 'da_gui' | 'da_sua_xong' {
  if (r.Repair_OutDate && r.Repair_OutDate.trim()) return 'da_sua_xong'
  if (r.Repair_InDate  && r.Repair_InDate.trim())  return 'da_gui'
  return 'cho_gui'
}

function mapFinishReason(r: RepairRecord): string | null {
  if (!r.Repair_OutDate?.trim()) return null
  const id  = String(r.Repair_FinishReasonID || '').trim()
  const str = (r.Repair_Status_String || '').toLowerCase()

  // Map by FinishReasonID first (nếu biết), else by string
  if (id === '1' || str.includes('sửa xong') || str.includes('sua xong'))           return 'sua_xong'
  if (id === '2' || (str.includes('bình thường') || str.includes('binh thuong')))   return 'khong_loi_bt'
  if (id === '4' || str.includes('bo mạch') || str.includes('bo mach'))             return 'loai_bo_bo_mach'
  if (id === '3' || str.includes('loại bỏ') || str.includes('loai bo'))             return 'loai_bo'
  if (id === '5' || str.includes('supplier') || str.includes('hãng'))               return 'send_supplier'
  // fallback
  if (r.Repair_OutDate?.trim()) return 'sua_xong'
  return null
}

function mapDestination(reason: string | null): string | null {
  if (!reason) return null
  if (reason === 'sua_xong' || reason === 'khong_loi_bt') return 'old_device'
  if (reason === 'loai_bo'  || reason === 'loai_bo_bo_mach') return 'scrap'
  if (reason === 'send_supplier') return 'supplier'
  return null
}

function parseDate(s: string | null): string | null {
  if (!s?.trim()) return null
  // CRM format: "YYYY-MM-DD HH:mm:ss" hoặc "YYYY-MM-DDTHH:mm:ss"
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function mapRecord(r: RepairRecord) {
  const status       = mapStatus(r)
  const finish_reason = mapFinishReason(r)
  const destination  = mapDestination(finish_reason)
  const imei         = (r.Unicode || r.Device_Code || '').trim()

  return {
    crm_repair_id:   r.Repair_ID,
    imei:            imei || `CRM-${r.Device_ID}`,
    product_name:    (r.ProductName || 'Unknown').trim(),
    notes:           r.Repair_Description?.trim() || null,
    status,
    repair_warehouse: (r.WareHouseName || null),
    finish_reason:   finish_reason as string | null,
    destination:     destination as string | null,
    // Timestamps
    received_at:     parseDate(r.Repair_InsertDate) ?? new Date().toISOString(),
    sent_at:         parseDate(r.Repair_InDate),
    completed_at:    parseDate(r.Repair_OutDate),
    // Người thực hiện (name only — không có user_id từ CRM)
    sender_name:     r.RepairMan?.trim()       || null,
    completer_name:  r.RepairFinishMan?.trim() || null,
  }
}

// ── Gọi CRM SOAP ─────────────────────────────────────────────
async function callGetDeviceRepair(
  sessionId:  string,
  identity:   string,
  startTime:  string,
  endTime:    string,
  deviceCode?: string,
): Promise<{ records: RepairRecord[]; rawJson: unknown }> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetDeviceRepair')
  const param: Record<string, string> = {
    StartTime:  startTime,
    EndTime:    endTime,
    searchType: '0',
  }
  if (deviceCode) param['Device_Code'] = deviceCode
  form.append('Param', JSON.stringify(param))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  console.log('[repair/sync-crm] Calling GetDeviceRepair:', { sessionId: sessionId.substring(0,16), identity, startTime, endTime })

  const resp = await fetch(CRM_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    signal:  AbortSignal.timeout(55_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const raw = await resp.text()
  if (!raw?.trim()) throw new Error('CRM trả về body rỗng')
  const json = JSON.parse(raw)
  console.log('[repair/sync-crm] CRM response status:', json.status, 'result count:', Array.isArray(json.result) ? json.result.length : 'N/A', 'error:', json.error)
  if (!json.status) throw new Error(json.error || 'CRM status=0')
  return { records: json.result ?? [], rawJson: { status: json.status, error: json.error, resultCount: Array.isArray(json.result) ? json.result.length : 0 } }
}

// ── POST handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const db = sb()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('repair_tracking:write') && !perms.includes('admin:users')) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    startTime?: string
    endTime?:   string
    staffName?: string
    mode?:      'incremental' | 'full' | 'refresh_in_repair' | 'refresh_selected'
    imeis?:     string[]   // dùng cho refresh_selected
    // incremental      = 7 ngày gần nhất
    // full             = 30 ngày (theo date range)
    // refresh_in_repair = chỉ refresh các thiết bị đang da_gui (dùng sent_at range)
    // refresh_selected  = refresh danh sách IMEI cụ thể (stale devices)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date)   =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 00:00:00`
  const now = new Date()
  const ago30 = new Date(now.getTime() - 30 * 86400000)

  // Default = 30 ngày, override bên dưới
  let startTime: string = fmt(ago30)
  let endTime:   string = fmt(now).replace('00:00:00', '23:59:59')

  if (body.startTime) {
    // Người dùng chọn khoảng thời gian thủ công
    startTime = body.startTime
    endTime   = body.endTime ?? fmt(now).replace('00:00:00', '23:59:59')
  } else if (body.mode === 'full') {
    // Full sync — 30 ngày (dùng default đã set)
  } else if (body.mode === 'refresh_selected') {
    // Refresh danh sách IMEI cụ thể (thiết bị quá 7 ngày chờ/sửa)
    const imeis = (body.imeis ?? []).filter(Boolean).slice(0, 50)
    if (imeis.length === 0) {
      return NextResponse.json({ ok: true, total: 0, upserted: 0, message: 'Không có IMEI nào được chọn' })
    }

    let sessionId: string, identity: string
    try {
      const session = await getCRMSessionForUser(user.id)
      sessionId = session.sessionId
      identity  = session.identity
    } catch (e) {
      return NextResponse.json({ error: `Lỗi CRM session: ${String(e)}` }, { status: 400 })
    }

    const FAR_PAST   = '1989-12-31 17:00:00'
    const endTimeNow = fmt(now).replace('00:00:00', '23:59:59')

    let allRecords: RepairRecord[] = []
    const failedImeis: string[] = []
    for (const imei of imeis) {
      try {
        const res = await callGetDeviceRepair(sessionId, identity, FAR_PAST, endTimeNow, imei)
        allRecords = allRecords.concat(res.records)
      } catch (e) {
        console.warn(`[repair/sync-crm] refresh_selected skip ${imei}:`, e)
        failedImeis.push(imei)
      }
    }

    if (allRecords.length === 0) {
      return NextResponse.json({ ok: true, total: 0, upserted: 0, message: 'CRM không trả về dữ liệu', failed: failedImeis })
    }

    const selRows  = allRecords.map(mapRecord)
    const selCrmIds = selRows.map(r => r.crm_repair_id) as number[]
    const selDbMap  = new Map<number, string>()
    for (let i = 0; i < selCrmIds.length; i += 500) {
      const { data } = await db.from('repair_items').select('crm_repair_id, status')
        .in('crm_repair_id', selCrmIds.slice(i, i + 500))
      for (const row of (data ?? [])) if (row.crm_repair_id) selDbMap.set(row.crm_repair_id as number, row.status as string)
    }

    let selInserted = 0, selUpdated = 0, selSkipped = 0
    const selErrors: string[] = []
    const selInsert: typeof selRows = [], selUpdate: typeof selRows = []

    for (const row of selRows) {
      const dbStatus = selDbMap.get(row.crm_repair_id)
      if (!dbStatus)                                          selInsert.push(row)
      else if (dbStatus === row.status)                       selSkipped++
      else if (dbStatus === 'cho_gui' || dbStatus === 'da_gui') selUpdate.push(row)
      else if (dbStatus === 'da_sua_xong' && (row.status === 'cho_gui' || row.status === 'da_gui')) selInsert.push(row)
      else selSkipped++
    }

    for (let i = 0; i < selInsert.length; i += 100) {
      const { error } = await db.from('repair_items').insert(selInsert.slice(i, i + 100))
      if (error) { const { error: e2 } = await db.from('repair_items').upsert(selInsert.slice(i, i + 100), { onConflict: 'crm_repair_id', ignoreDuplicates: true }); if (e2) selErrors.push(e2.message); else selInserted += selInsert.slice(i,i+100).length } else selInserted += selInsert.slice(i,i+100).length
    }
    for (const row of selUpdate) {
      const { error } = await db.from('repair_items').update({
        status: row.status, sent_at: row.sent_at, completed_at: row.completed_at,
        finish_reason: row.finish_reason, destination: row.destination, notes: row.notes,
        repair_warehouse: row.repair_warehouse, sender_name: row.sender_name, completer_name: row.completer_name,
      }).eq('crm_repair_id', row.crm_repair_id)
      if (error) selErrors.push(`update ${row.crm_repair_id}: ${error.message}`); else selUpdated++
    }

    return NextResponse.json({
      ok: selErrors.length === 0, total: allRecords.length,
      inserted: selInserted, updated: selUpdated, skipped: selSkipped,
      upserted: selInserted + selUpdated, imeiChecked: imeis.length,
      failed: failedImeis.length > 0 ? failedImeis : undefined,
      errors: selErrors.length > 0 ? selErrors.slice(0, 5) : undefined,
    })
  } else if (body.mode === 'refresh_in_repair') {
    // Chế độ đặc biệt: query từng thiết bị theo Device_Code
    // Không dùng date range rộng → tránh timeout, chính xác hơn
    const { data: pendingDevices } = await db
      .from('repair_items')
      .select('imei, crm_repair_id')
      .in('status', ['cho_gui', 'da_gui'])
      .not('imei', 'like', 'CRM-%')
      .order('received_at', { ascending: false })
      .limit(40)  // max 40 thiết bị / lần để tránh timeout

    if (!pendingDevices || pendingDevices.length === 0) {
      return NextResponse.json({ ok: true, total: 0, upserted: 0, message: 'Không có thiết bị nào đang chờ/sửa' })
    }

    // Lấy CRM session
    let sessionId: string, identity: string
    try {
      const session = await getCRMSessionForUser(user.id)
      sessionId = session.sessionId
      identity  = session.identity
    } catch (e) {
      return NextResponse.json({ error: `Lỗi CRM session: ${String(e)}` }, { status: 400 })
    }

    const FAR_PAST = '1989-12-31 17:00:00'
    const endTimeNow = fmt(now).replace('00:00:00', '23:59:59')
    const uniqueImeis = [...new Set(pendingDevices.map(d => d.imei).filter(Boolean))]

    let allRecords: RepairRecord[] = []
    for (const imei of uniqueImeis) {
      try {
        const res = await callGetDeviceRepair(sessionId, identity, FAR_PAST, endTimeNow, imei)
        allRecords = allRecords.concat(res.records)
      } catch (e) {
        console.warn(`[repair/sync-crm] refresh skip ${imei}:`, e)
      }
    }

    if (allRecords.length === 0) {
      return NextResponse.json({ ok: true, total: 0, upserted: 0, message: 'CRM không trả về dữ liệu' })
    }

    const rows = allRecords.map(mapRecord)
    const crmIds = rows.map(r => r.crm_repair_id) as number[]
    let upserted = 0
    const errors: string[] = []

    // Upsert
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error } = await db.from('repair_items').upsert(batch, { onConflict: 'crm_repair_id', ignoreDuplicates: false })
      if (error) {
        // Fallback: update từng record
        for (const row of batch) {
          const { error: e2 } = await db.from('repair_items')
            .update({ status: row.status, sent_at: row.sent_at, completed_at: row.completed_at,
                      finish_reason: row.finish_reason, destination: row.destination,
                      notes: row.notes, repair_warehouse: row.repair_warehouse,
                      sender_name: row.sender_name, completer_name: row.completer_name })
            .eq('crm_repair_id', row.crm_repair_id)
          if (e2) errors.push(`${row.crm_repair_id}: ${e2.message}`)
          else upserted++
        }
      } else { upserted += batch.length }
    }

    return NextResponse.json({ ok: errors.length === 0, total: allRecords.length, upserted,
      imeiChecked: uniqueImeis.length, errors: errors.length > 0 ? errors.slice(0,5) : undefined })
  } else {
    // Incremental (default): tìm Repair_InsertDate mới nhất trong DB → sync từ đó
    const { data: latestRow } = await db
      .from('repair_items')
      .select('received_at')
      .order('received_at', { ascending: false })
      .limit(1)
      .single()

    if (latestRow?.received_at) {
      // Incremental nhanh: lùi 7 ngày để bắt record mới + tránh bỏ sót múi giờ
      // Giới hạn 7 ngày để tránh timeout — thiết bị da_gui cũ dùng mode 'refresh_in_repair'
      const latestDate = new Date(latestRow.received_at)
      latestDate.setDate(latestDate.getDate() - 7)
      // Không lùi quá 14 ngày dù latestRow cũ
      const cap14 = new Date(now.getTime() - 14 * 86400000)
      startTime = fmt(latestDate < cap14 ? cap14 : latestDate)
      console.log(`[repair/sync-crm] incremental 7d từ ${startTime}`)
    } else {
      // DB trống — sync 30 ngày gần nhất
      const ago30 = new Date(now.getTime() - 30 * 86400000)
      startTime = fmt(ago30)
    }
    endTime = fmt(now).replace('00:00:00', '23:59:59')
  }

  // Lấy CRM session
  let sessionId: string, identity: string
  try {
    if (body.staffName && perms.includes('admin:users')) {
      const { data: mapping } = await db
        .from('user_crm_mapping')
        .select('crm_account, crm_password, crm_staff_id')
        .ilike('crm_nick_name', body.staffName)
        .single()
      if (!mapping?.crm_account) throw new Error(`Không tìm thấy mapping cho ${body.staffName}`)
      const login = await crmLoginRaw(mapping.crm_account, mapping.crm_password)
      if (!login.ok || !login.detectedSessionId) throw new Error(`Login CRM thất bại`)
      sessionId = login.detectedSessionId
      identity  = login.detectedIdentity ?? String(mapping.crm_staff_id)
    } else {
      const session = await getCRMSessionForUser(user.id)
      sessionId = session.sessionId
      identity  = session.identity
    }
  } catch (e) {
    return NextResponse.json({ error: `Lỗi CRM session: ${String(e)}` }, { status: 400 })
  }

  // Gọi CRM
  let records: RepairRecord[]
  let rawDebug: unknown
  try {
    const res = await callGetDeviceRepair(sessionId, identity, startTime, endTime)
    records  = res.records
    rawDebug = res.rawJson
  } catch (e) {
    return NextResponse.json({ error: `Lỗi CRM: ${String(e)}` }, { status: 500 })
  }

  if (records.length === 0) {
    return NextResponse.json({
      ok: true, total: 0, upserted: 0,
      startTime, endTime,
      message: 'Không có dữ liệu trong khoảng thời gian này',
      debug: rawDebug,
    })
  }

  // Map records
  const rows = records.map(mapRecord)
  const crmIds = rows.map(r => r.crm_repair_id) as number[]

  let inserted = 0, updated = 0, skipped = 0
  const errors: string[] = []

  // ── Lấy trạng thái hiện tại trong DB cho tất cả crm_repair_id ──
  const dbStatusMap = new Map<number, string>()
  for (let i = 0; i < crmIds.length; i += 500) {
    const { data } = await db
      .from('repair_items')
      .select('crm_repair_id, status')
      .in('crm_repair_id', crmIds.slice(i, i + 500))
    for (const row of (data ?? [])) {
      if (row.crm_repair_id) dbStatusMap.set(row.crm_repair_id as number, row.status as string)
    }
  }

  // ── Smart merge: phân loại từng record ────────────────────────
  const toInsert: typeof rows = []
  const toUpdate: typeof rows = []

  for (const row of rows) {
    const dbStatus = dbStatusMap.get(row.crm_repair_id)

    if (!dbStatus) {
      // Chưa có trong DB → insert mới
      toInsert.push(row)
    } else if (dbStatus === row.status) {
      // Trạng thái giống nhau → bỏ qua
      skipped++
    } else if (dbStatus === 'cho_gui' || dbStatus === 'da_gui') {
      // Đang chờ/sửa + trạng thái thay đổi → cập nhật tiến trình
      toUpdate.push(row)
    } else {
      // DB đã da_sua_xong: kiểm tra trạng thái mới từ CRM
      if (row.status === 'cho_gui' || row.status === 'da_gui') {
        // Thiết bị đã sửa xong nhưng CRM lại có trạng thái đang chờ/sửa
        // → đây là vòng đời sửa chữa mới, thêm record mới
        toInsert.push(row)
      } else {
        // Cả hai đều đã sửa xong → bỏ qua
        skipped++
      }
    }
  }

  // ── Insert record mới ──────────────────────────────────────────
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    const { error } = await db.from('repair_items').insert(batch)
    if (error) {
      // Thử upsert nếu insert bị conflict (unique index tồn tại)
      const { error: e2 } = await db.from('repair_items')
        .upsert(batch, { onConflict: 'crm_repair_id', ignoreDuplicates: true })
      if (e2) errors.push(`insert: ${e2.message}`)
      else inserted += batch.length
    } else {
      inserted += batch.length
    }
  }

  // ── Update record đang tiến triển ─────────────────────────────
  for (const row of toUpdate) {
    const { error } = await db
      .from('repair_items')
      .update({
        status:           row.status,
        sent_at:          row.sent_at,
        completed_at:     row.completed_at,
        finish_reason:    row.finish_reason,
        destination:      row.destination,
        notes:            row.notes,
        repair_warehouse: row.repair_warehouse,
        sender_name:      row.sender_name,
        completer_name:   row.completer_name,
      })
      .eq('crm_repair_id', row.crm_repair_id)
    if (error) errors.push(`update ${row.crm_repair_id}: ${error.message}`)
    else updated++
  }

  console.log(`[repair/sync-crm] insert=${inserted} update=${updated} skip=${skipped} errors=${errors.length}`)

  return NextResponse.json({
    ok:       errors.length === 0,
    total:    records.length,
    inserted,
    updated,
    skipped,
    upserted: inserted + updated,
    startTime,
    endTime,
    errors:   errors.length > 0 ? errors.slice(0, 5) : undefined,
  })

  } catch (err) {
    console.error('[repair/sync-crm] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
