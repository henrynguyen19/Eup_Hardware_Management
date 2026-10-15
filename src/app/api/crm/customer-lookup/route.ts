/**
 * POST /api/crm/customer-lookup
 * Body: { plates: string[] }
 *
 * Flow:
 *  1. Gọi GetCustomerByInfo cho từng biển số (batch 5) → lấy Cust_ID
 *  2. Gom nhóm biển số theo Cust_ID
 *  3. Với từng Cust_ID → gọi GetCarInfo → lấy Car_Unicode, Car_Tel, Car_Number, Car_IsCheck
 *  4. Trả về danh sách kết quả theo biển số gốc
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser, invalidateCRMSession } from '@/lib/crm-session'
import { callCrmSoap } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 60

// ── CRM types ────────────────────────────────────────────────────────────────

interface CustomerByInfoRow {
  Cust_ID:         string | number
  Cust_IMID?:      string | number
  CustName?:       string
  Cust_Name?:      string
  MachineBarCode?: string
  // ... other fields we ignore
  [key: string]: unknown
}

interface CarInfoRow {
  Car_Number:   string
  Car_Unicode?: string
  Car_Tel?:     string
  Car_IsCheck?: number | boolean | string
  CHKTime?:     string
  // ... other fields
  [key: string]: unknown
}

// ── Batch helper ──────────────────────────────────────────────────────────────

async function batchAll<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { plates?: string[] }
    const rawPlates = body.plates ?? []
    if (!Array.isArray(rawPlates) || rawPlates.length === 0) {
      return NextResponse.json({ error: 'Thiếu danh sách biển số' }, { status: 400 })
    }

    // Normalize + deduplicate
    const plates = [...new Set(rawPlates.map(p => p.trim().toUpperCase()).filter(Boolean))]
    if (plates.length > 500) {
      return NextResponse.json({ error: 'Tối đa 500 biển số mỗi lần' }, { status: 400 })
    }

    const { sessionId, identity } = await getCRMSessionForUser(user.id)

    // ── Step 1: GetCustomerByInfo cho từng biển số ────────────────────────────
    // Map: plate → { cust_id, cust_imid, cust_name }
    const plateToCustomer = new Map<string, { cust_id: string; cust_imid: string; cust_name: string; machine_bar_code: string } | null>()
    let debugRawCustomerFields: string[] = []

    await batchAll(plates, 5, async (plate) => {
      try {
        const rows = await callCrmSoap<CustomerByInfoRow>(
          'GetCustomerByInfo',
          { QueryStr: plate, QueryType: 'CarNumber', Cust_HaveTax: null },
          sessionId,
          identity,
          15_000
        )
        const first = rows?.[0] ?? null
        // Capture raw field names from first successful result for debugging
        if (first && debugRawCustomerFields.length === 0) {
          debugRawCustomerFields = Object.keys(first)
          console.log('[customer-lookup] GetCustomerByInfo raw fields:', debugRawCustomerFields)
          console.log('[customer-lookup] GetCustomerByInfo first row:', JSON.stringify(first))
        }
        if (first) {
          // Try common field name variants for MachineBarCode
          const barcode = first.MachineBarCode ?? first.Machine_BarCode ?? first.Barcode ?? first.BarCode ?? first.Machine_Barcode ?? ''
          plateToCustomer.set(plate, {
            cust_id:          String(first.Cust_ID   ?? ''),
            cust_imid:        String(first.Cust_IMID ?? first.Cust_ID ?? ''),
            cust_name:        String(first.Cust_Name ?? first.CustName ?? ''),
            machine_bar_code: String(barcode),
          })
        } else {
          plateToCustomer.set(plate, null)
        }
      } catch {
        plateToCustomer.set(plate, null)
      }
    })

    // ── Step 2: Gom nhóm biển số theo Cust_IMID ──────────────────────────────
    const custImidToPlates = new Map<string, string[]>()
    for (const [plate, info] of plateToCustomer.entries()) {
      if (!info || !info.cust_imid) continue
      if (!custImidToPlates.has(info.cust_imid)) custImidToPlates.set(info.cust_imid, [])
      custImidToPlates.get(info.cust_imid)!.push(plate)
    }

    // ── Step 3: GetCarInfo cho từng Cust_IMID ────────────────────────────────
    // Map: plate → car info
    const plateToCarInfo = new Map<string, Pick<CarInfoRow, 'Car_Unicode' | 'Car_Tel' | 'Car_Number' | 'Car_IsCheck' | 'CHKTime'>>()

    const custImids = [...custImidToPlates.keys()]
    await batchAll(custImids, 3, async (custImid) => {
      try {
        const cars = await callCrmSoap<CarInfoRow>(
          'GetCarInfo',
          { Cust_IMID: custImid, teamId: -1 },
          sessionId,
          identity,
          15_000
        )
        for (const car of (cars ?? [])) {
          const num = (car.Car_Number ?? '').trim().toUpperCase()
          if (custImidToPlates.get(custImid)?.includes(num)) {
            plateToCarInfo.set(num, {
              Car_Unicode: car.Car_Unicode ?? '',
              Car_Tel:     car.Car_Tel     ?? '',
              Car_Number:  car.Car_Number  ?? '',
              Car_IsCheck: car.Car_IsCheck,
              CHKTime:     car.CHKTime     ?? '',
            })
          }
        }
      } catch {
        // ignore per-customer errors
      }
    })

    // ── Debug: collect raw field keys from first found result ────────────────
    const debugFirstRaw = (() => {
      for (const [, info] of plateToCustomer.entries()) {
        if (info) return info
      }
      return null
    })()

    // ── Step 4: Assemble results ──────────────────────────────────────────────
    const results = plates.map(plate => {
      const customer = plateToCustomer.get(plate) ?? null
      const car      = plateToCarInfo.get(plate)  ?? null
      return {
        plate,
        found:            !!customer,
        cust_id:          customer?.cust_id          ?? null,
        cust_imid:        customer?.cust_imid        ?? null,
        cust_name:        customer?.cust_name        ?? null,
        machine_bar_code: customer?.machine_bar_code ?? null,
        car_unicode:      car?.Car_Unicode ?? null,
        car_tel:          car?.Car_Tel     ?? null,
        chk_time:         car?.CHKTime     ?? null,
        car_is_check:     car?.Car_IsCheck != null
          ? Boolean(Number(car.Car_IsCheck))
          : null,
      }
    })

    return NextResponse.json({ ok: true, results, total: results.length, _debug_customer_fields: debugRawCustomerFields })

  } catch (err) {
    const msg = String(err)
    console.error('[crm/customer-lookup]', msg)
    if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('login')) {
      const supabase = createSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await invalidateCRMSession(user.id)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
