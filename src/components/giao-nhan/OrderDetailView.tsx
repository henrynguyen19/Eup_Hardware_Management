'use client'
import { useState, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface DonItem {
  id: string; device_name: string; quantity: number
  device_serials?: string[]; combo_name?: string
  customer_codes?: string[]
}
interface DonHang {
  id: string; order_code: string; status: string; office: string
  orderer_name?: string; orderer_email?: string
  recipient_info?: string; notes?: string; tracking_code?: string
  expected_date?: string; expected_ship_date?: string
  created_at: string; status_updated_by?: string; status_updated_at?: string
  giao_hang_don_items: DonItem[]
}

// ─── Config ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  cho_xu_ly:  { label: 'Chờ xử lý',  dot: 'bg-amber-400',  badge: 'bg-amber-50  text-amber-700  border-amber-200' },
  dang_xu_ly: { label: 'Đang xử lý', dot: 'bg-blue-500',   badge: 'bg-blue-50   text-blue-700   border-blue-200'  },
  da_gui:     { label: 'Đã gửi',     dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-200'},
  da_nhan:    { label: 'Đã nhận',    dot: 'bg-green-500',  badge: 'bg-green-50  text-green-700  border-green-200' },
  da_huy:     { label: 'Hủy',        dot: 'bg-red-400',    badge: 'bg-red-50    text-red-700    border-red-200'   },
}
const VALID_STATUSES = ['cho_xu_ly', 'dang_xu_ly', 'da_gui', 'da_nhan', 'da_huy']

function isNoImeiAccessory(name: string) {
  const n = name.toLowerCase()
  return /dây nguồn|cáp nguồn|power cable/.test(n) ||
    /thẻ nhớ|microsd|sd card/.test(n) || /đầu đọc/.test(n) ||
    /viettel|vinaphone|m2m|3mbipts|data_\d|gps_m2m/.test(n)
}
function isCrmBarcodedOptional(name: string) {
  const n = name.toLowerCase()
  return /thẻ nhớ|microsd|sd card/.test(n) || /đầu đọc/.test(n) ||
    /viettel|vinaphone|m2m|3mbipts|data_\d|gps_m2m/.test(n)
}
function isPhysicalOnlyAccessory(name: string) {
  return /dây nguồn|cáp nguồn|power cable/i.test(name)
}

// ─── Print functions (self-contained) ────────────────────────────────────────
function printLabel(order: DonHang) {
  const items = order.giao_hang_don_items
  const mainItems = items.filter(i => !isNoImeiAccessory(i.device_name))
  const recipParts = (order.recipient_info ?? '').split('—').map(s => s.trim())
  const recipName = recipParts[1] ?? ''
  const recipPhone = recipParts[2] ?? ''
  const recipAddr = recipParts.slice(3).join(', ').trim()
  const rows = mainItems.map(item => {
    const serials = (item.device_serials ?? []).filter(Boolean)
    return `<tr><td>${item.device_name}</td><td>${item.quantity}</td><td style="font-family:monospace;font-size:10px">${serials.join('<br>')}</td></tr>`
  }).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;width:400px;padding:12px}
    .code{font-weight:bold;font-size:14px;margin-bottom:4px}.meta{font-size:10px;color:#666;margin-bottom:8px}
    .recip{font-size:12px;font-weight:600;margin:8px 0 2px}.addr{font-size:10px;color:#444}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:10px}
    td,th{border:1px solid #ccc;padding:3px 4px}th{background:#f0f0f0}
    @media print{@page{size:400px auto;margin:0}body{width:100%}}
  </style></head><body>
  <div class="code">${order.order_code}</div>
  <div class="meta">Người đặt: ${order.orderer_name || order.orderer_email} · VP: ${order.office} · ${new Date().toLocaleDateString('vi-VN')}</div>
  <div class="recip">👤 ${recipName || order.recipient_info || ''}</div>
  ${recipPhone ? `<div class="addr">📞 ${recipPhone}</div>` : ''}
  ${recipAddr ? `<div class="addr">📍 ${recipAddr}</div>` : ''}
  <table><thead><tr><th>Thiết bị</th><th>SL</th><th>Serial / IMEI</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>window.print()</script></body></html>`
  const w = window.open('', '_blank', 'width=480,height=700')
  if (w) { w.document.write(html); w.document.close() }
}

async function printHandover(order: DonHang) {
  const items = order.giao_hang_don_items
  const now = new Date()
  const dateStr = now.toLocaleDateString('vi-VN')
  const recipParts = (order.recipient_info ?? '').split('—').map(s => s.trim())
  const recipOffice = recipParts[0] ?? ''
  const recipName   = recipParts[1] ?? ''
  const recipPhone  = recipParts[2] ?? ''
  const recipAddr   = recipParts.slice(3).join(', ').trim()
  const khoNhan = recipName ? `${recipName}${recipOffice ? ` (${recipOffice})` : ''}` : (recipOffice || order.office || '')

  const mainItems  = items.filter(i => !i.combo_name)
  const comboItems = items.filter(i =>  i.combo_name)
  const allRows    = [...mainItems, ...comboItems]

  // Auto-fetch SIM/thẻ nhớ từ GetCarList
  const extraSerials: Record<string, string[]> = {}
  const mainDevices = mainItems.filter(i => !isNoImeiAccessory(i.device_name) && (i.device_serials?.filter(Boolean).length ?? 0) > 0)
  const missingAcc  = comboItems.filter(i => isCrmBarcodedOptional(i.device_name) && !(i.device_serials?.filter(Boolean).length))
  if (mainDevices.length > 0 && missingAcc.length > 0) {
    try {
      const barcodes = mainDevices.flatMap(i => (i.device_serials ?? []).filter(Boolean))
      if (barcodes.length > 0) {
        const res = await fetch('/api/giao-hang/car-accessories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcodes, stockupKind: '0' }),
        })
        if (res.ok) {
          const data = await res.json() as { ok: boolean; results: Array<{ byKind: Record<number, Array<{ code: string }>> }> }
          if (data.ok) {
            for (const acc of missingAcc) {
              const isSim = /viettel|vinaphone|sim|m2m|3mbipts|data_\d|gps_m2m/.test(acc.device_name.toLowerCase())
              const isMem = /thẻ nhớ|microsd|sd card|đầu đọc|ổ cứng|hdd|ssd/.test(acc.device_name.toLowerCase())
              const kind  = isSim ? 3 : isMem ? 2 : -1
              if (kind === -1) continue
              const codes = data.results.flatMap(r => (r.byKind[kind] ?? []).slice(0,1).map(e => e.code))
              if (codes.length > 0) extraSerials[acc.id] = codes
            }
          }
        }
      }
    } catch { /* fallback */ }
  }

  const getSerials = (item: DonItem) => {
    const saved = (item.device_serials ?? []).filter(Boolean)
    return saved.length > 0 ? saved : (extraSerials[item.id] ?? [])
  }
  const makeRow = (stt: number, item: DonItem, si: number) => {
    const s = getSerials(item)
    return `<tr>
      <td style="text-align:center">${stt}</td>
      <td>${item.device_name}${item.combo_name ? ` <span style="font-size:10px;color:#777">[${item.combo_name}]</span>` : ''}</td>
      <td style="font-family:monospace;font-size:10px;color:${s[si]?'#000':'#ccc'}">${s[si]??''}</td>
      <td>Kho EUP Hardware</td><td>${khoNhan}</td>
      <td style="text-align:center">1</td></tr>`
  }

  const comboNames = [...new Set(comboItems.map(i => i.combo_name).filter(Boolean))]
  const sortGroup = (its: DonItem[]) => [
    ...its.filter(i => !isNoImeiAccessory(i.device_name)),
    ...its.filter(i => isCrmBarcodedOptional(i.device_name)),
    ...its.filter(i => isPhysicalOnlyAccessory(i.device_name)),
  ]

  let stt = 0
  const rowLines: string[] = []
  for (const item of mainItems.filter(i => !i.combo_name)) {
    stt++; const s = stt
    for (let si = 0; si < item.quantity; si++) rowLines.push(makeRow(s, item, si))
  }
  for (const cn of comboNames) {
    const group = sortGroup(items.filter(i => i.combo_name === cn))
    const maxQty = Math.max(...group.map(i => i.quantity))
    const stts: Record<string, number> = {}
    for (const item of group) { stt++; stts[item.id] = stt }
    for (let si = 0; si < maxQty; si++)
      for (const item of group)
        if (si < item.quantity) rowLines.push(makeRow(stts[item.id], item, si))
  }

  const totalQty = allRows.reduce((a, i) => a + i.quantity, 0)
  const handoverDate = order.expected_date ? new Date(order.expected_date).toLocaleDateString('vi-VN') : dateStr

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<title>Biên bản bàn giao – ${order.order_code}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:12px;color:#111;background:#fff}
.page{width:210mm;min-height:297mm;margin:0 auto;padding:12mm 15mm 15mm}
.header-state{text-align:center;line-height:1.6;margin-bottom:4px}
.title-wrap{display:flex;justify-content:space-between;align-items:flex-start;margin:10px 0 6px}
.title-center{flex:1;text-align:center}.title{font-size:15px;font-weight:bold;text-transform:uppercase}
.subtitle{font-size:11.5px}.parties{margin:8px 0 6px;font-size:12px;line-height:1.8}
table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
th{border:1px solid #333;padding:5px 4px;text-align:center;font-weight:bold;background:#f5f5f5}
td{border:1px solid #555;padding:4px 4px;vertical-align:middle}
.footer-note{font-size:10.5px;margin-top:10px;line-height:1.7}.footer-note li{margin-left:16px}
.sign-wrap{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;text-align:center;font-size:12px}
.sign-title{font-weight:bold}.sign-space{height:55px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:8mm 12mm 10mm}@page{size:A4;margin:0}}</style></head>
<body><div class="page">
<div class="header-state"><div style="font-weight:bold;font-size:13px">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
<div style="font-style:italic;font-size:11.5px">Độc lập – Tự do – Hạnh phúc</div>
<div style="font-size:10px;margin-top:1px">───────────────</div></div>
<div class="title-wrap"><div style="width:80px"></div>
<div class="title-center"><div class="title">Biên bản bàn giao thiết bị</div><div class="subtitle">(Nội bộ)</div></div>
<div style="font-size:11px;white-space:nowrap">${handoverDate}</div></div>
<div class="parties">
<div><b>BÊN GIAO:</b> ${order.orderer_name || order.orderer_email || 'Nhân viên kho EUP'}</div>
<div><b>BÊN NHẬN:</b> ${khoNhan || '...................................'}</div></div>
<table><thead><tr><th style="width:32px">STT</th><th style="text-align:left">Tên thiết bị</th>
<th style="width:140px">Mã thiết bị</th><th style="width:100px">Kho Chuyển</th>
<th style="width:130px">Kho Nhận</th><th style="width:38px">SL</th></tr></thead>
<tbody>${rowLines.join('')}
${Array.from({length:Math.max(0,20-totalQty)},()=>`<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}
</tbody></table>
<div class="footer-note">Người nhận bàn giao có trách nhiệm quản lý, sử dụng thiết bị đúng mục đích:
<ul><li>Thiết bị dự phòng quá 2 tháng không sử dụng cần gửi trả công ty.</li>
<li>Thiết bị cũ sau khi bảo hành cần gửi về công ty trong vòng 14 ngày kể từ ngày tháo xuống.</li>
<li>Nếu xảy ra mất thiết bị phải bồi thường: nhân viên ½ giá bán, kỹ thuật thuê ngoài 100% giá bán.</li>
</ul>Biên bản lập thành 02 bản, mỗi bên giữ 01 bản.</div>
<div class="sign-wrap"><div><div class="sign-title">BÊN BÀN GIAO</div><div class="sign-space"></div><div>${order.orderer_name||''}</div></div>
<div><div class="sign-title">BÊN NHẬN</div><div class="sign-space"></div><div>${recipName||''}</div></div></div>
<div style="margin-top:10px;font-size:8px;color:#bbb;text-align:center">
Biên bản tạo tự động từ EUP Hardware Management · ${dateStr} · ${order.order_code}</div>
</div><script>window.onload=()=>window.print()</script></body></html>`
  const w = window.open('', '_blank', 'width=850,height=1100')
  if (w) { w.document.write(html); w.document.close() }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrderDetailView({
  order: initialOrder, isKho, isAdmin, userEmail,
}: {
  order: DonHang; isKho: boolean; isAdmin: boolean; userEmail: string
}) {
  const [order, setOrder] = useState<DonHang>(initialOrder)
  const [updating, setUpdating] = useState(false)
  const [crmResults, setCrmResults] = useState<Array<{serial:string;ok:boolean;transferred:boolean;sourceStock:string;destStock:string;productName:string;updateMan:string;updateTime:string;error?:string}>>([])
  const [crmChecking, setCrmChecking] = useState(false)

  const reload = useCallback(async () => {
    const r = await fetch(`/api/giao-hang/don-hang?id=${order.id}`)
    const d = await r.json()
    if (d.orders?.[0]) setOrder(d.orders[0])
  }, [order.id])

  async function updateStatus(status: string) {
    setUpdating(true)
    await fetch('/api/giao-hang/don-hang', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: order.id, status }),
    })
    await reload()
    setUpdating(false)
  }

  async function checkCRM() {
    const serials = order.giao_hang_don_items.flatMap(i => i.device_serials ?? []).filter(Boolean)
    if (serials.length === 0) return
    setCrmChecking(true)
    try {
      const r = await fetch('/api/giao-hang/batch-crm-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serials }),
      })
      const d = await r.json()
      if (d.ok) setCrmResults(d.results)
    } finally { setCrmChecking(false) }
  }

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.cho_xu_ly
  const recipParts = (order.recipient_info ?? '').split('—').map(s => s.trim())
  const recipName  = recipParts[1] ?? ''
  const recipPhone = recipParts[2] ?? ''
  const recipAddr  = recipParts.slice(3).join(', ').trim()

  // Nhóm items
  const mainItems  = order.giao_hang_don_items.filter(i => !i.combo_name)
  const comboItems = order.giao_hang_don_items.filter(i =>  i.combo_name)
  const comboNames = [...new Set(comboItems.map(i => i.combo_name).filter(Boolean))]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-bold text-indigo-700">{order.order_code}</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cfg.badge}`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
                </span>
              </div>
              <div className="mt-2 text-sm text-gray-500 space-y-0.5">
                <div>👤 Người đặt: <span className="font-medium text-gray-700">{order.orderer_name || order.orderer_email}</span> · {order.office}</div>
                {order.recipient_info && <div>📦 Giao cho: <span className="font-medium text-gray-700">{recipName || order.recipient_info.split('—')[0]}</span>{recipPhone && ` · ${recipPhone}`}</div>}
                {recipAddr && <div>📍 {recipAddr}</div>}
                {order.expected_ship_date && <div>🚚 Ngày gửi: <span className="text-amber-600 font-medium">{order.expected_ship_date}</span></div>}
                {order.tracking_code && <div>📮 Mã vận đơn: <span className="font-mono text-violet-700">{order.tracking_code}</span></div>}
                {order.notes && <div className="italic">📝 {order.notes}</div>}
              </div>
            </div>
            <a href="/giao-nhan" className="text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap">← Quay lại</a>
          </div>
        </div>

        {/* Danh sách thiết bị */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-700 text-sm">📋 Thiết bị trong đơn</div>
          <div className="divide-y divide-gray-50">
            {/* Standalone items */}
            {mainItems.filter(i => !i.combo_name).map(item => (
              <div key={item.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{item.device_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Số lượng: {item.quantity}</div>
                  </div>
                  {(item.device_serials?.filter(Boolean).length ?? 0) > 0 && (
                    <div className="text-right">
                      {item.device_serials!.filter(Boolean).map(s => (
                        <div key={s} className="font-mono text-xs text-gray-600 bg-gray-50 rounded px-1.5 py-0.5 mb-0.5">{s}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Combo groups */}
            {comboNames.map(cn => {
              const group = order.giao_hang_don_items.filter(i => i.combo_name === cn)
              return (
                <div key={cn} className="px-5 py-3">
                  <div className="text-xs font-semibold text-amber-600 mb-2">📦 {cn}</div>
                  <div className="space-y-2">
                    {group.map(item => (
                      <div key={item.id} className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 text-sm">{item.device_name}</div>
                          <div className="text-xs text-gray-400">×{item.quantity}</div>
                        </div>
                        {(item.device_serials?.filter(Boolean).length ?? 0) > 0 ? (
                          <div className="text-right">
                            {item.device_serials!.filter(Boolean).slice(0, 5).map(s => (
                              <div key={s} className="font-mono text-[10px] text-gray-600 bg-gray-50 rounded px-1 py-0.5 mb-0.5">{s}</div>
                            ))}
                            {(item.device_serials!.filter(Boolean).length ?? 0) > 5 && (
                              <div className="text-[10px] text-gray-400">+{item.device_serials!.filter(Boolean).length - 5} nữa…</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-300 italic">chưa có mã</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* CRM results */}
        {crmResults.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
            <div className="text-sm font-semibold text-blue-700 mb-2">📡 Kết quả kiểm tra CRM</div>
            {crmResults.map(r => (
              <div key={r.serial} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-gray-700 shrink-0">{r.serial}</span>
                {r.ok ? r.transferred
                  ? <span className="text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✅ → {r.destStock || r.productName}</span>
                  : <span className="text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">⏳ {r.sourceStock}</span>
                  : <span className="text-red-500">❌ {r.error}</span>}
                {r.ok && r.updateTime && <span className="text-gray-400">{r.updateMan} · {r.updateTime}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          {/* Status */}
          {isKho && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cập nhật trạng thái</div>
              <div className="flex gap-2 flex-wrap">
                {VALID_STATUSES.map(k => {
                  const c = STATUS_CONFIG[k]
                  const active = order.status === k
                  return (
                    <button key={k} onClick={() => updateStatus(k)} disabled={active || updating}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        active ? `${c.badge} border-current ring-2 ring-offset-1 ring-current/30 cursor-default`
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700'
                      }`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />{c.label}{active && ' ✓'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap items-center pt-2 border-t border-gray-100">
            {order.giao_hang_don_items.some(i => (i.device_serials ?? []).length > 0) && (
              <button onClick={checkCRM} disabled={crmChecking}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 transition-all">
                {crmChecking ? '⏳ Đang check…' : '📡 Kiểm tra CRM'}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button onClick={() => printLabel(order)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all">
                🏷️ In nhãn
              </button>
              <button onClick={() => { void printHandover(order) }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 transition-all">
                📋 Biên bản bàn giao
              </button>
            </div>
          </div>

          {/* Warehouse check link */}
          {isKho && order.status === 'cho_xu_ly' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              ⚠️ Đơn chưa kiểm tra kho. <a href="/giao-nhan" className="font-semibold underline">Quay lại trang chính</a> để dùng chức năng Kiểm tra CRM.
            </div>
          )}

          {order.status_updated_by && (
            <div className="text-xs text-gray-400">
              Cập nhật bởi <span className="font-medium">{order.status_updated_by}</span>
              {order.status_updated_at && <> lúc {new Date(order.status_updated_at).toLocaleString('vi-VN')}</>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
