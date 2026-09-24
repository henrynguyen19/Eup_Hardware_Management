'use client'

import { useState, useRef, useEffect } from 'react'

// ── 6 trường mặc định hiển thị ───────────────────────────────
const DEFAULT_FIELDS = [
  'ProductName',
  'Car_Number',
  'Car_Unicode',
  'MachineBarCode',
  'SimBarCode',
  'CHKTime',
]

// ── Nhãn thân thiện cho từng trường ──────────────────────────
const FIELD_LABELS: Record<string, string> = {
  ProductName:    'Sản phẩm',
  Car_Number:     'Số xe',
  Car_Unicode:    'Unicode xe',
  MachineBarCode: 'Barcode máy',
  SimBarCode:     'Barcode SIM',
  CHKTime:        'Ngày kiểm tra',
}

type CarRecord = Record<string, unknown>

export default function CarListTab() {
  const [custImid, setCustImid]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [records, setRecords]       = useState<CarRecord[]>([])
  const [allFields, setAllFields]   = useState<string[]>([])
  const [checked, setChecked]       = useState<Set<string>>(new Set(DEFAULT_FIELDS))
  const [searched, setSearched]     = useState(false)
  const [dropdownOpen, setDropdown] = useState(false)
  const inputRef   = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // ── Tìm kiếm ────────────────────────────────────────────────
  async function handleSearch() {
    const imid = custImid.trim()
    if (!imid) { inputRef.current?.focus(); return }
    setLoading(true); setError(''); setRecords([]); setSearched(true)
    try {
      const res = await fetch('/api/crm/car-info', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cust_imid: imid }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error ?? 'Lỗi không xác định'); setLoading(false); return }

      const rows: CarRecord[] = d.data ?? []
      setRecords(rows)

      // Lấy tất cả field từ response (giữ DEFAULT_FIELDS trước, còn lại theo thứ tự xuất hiện)
      const seen = new Set<string>()
      const fields: string[] = []
      DEFAULT_FIELDS.forEach(f => { seen.add(f); fields.push(f) })
      rows.forEach(row => Object.keys(row).forEach(k => {
        if (!seen.has(k)) { seen.add(k); fields.push(k) }
      }))
      setAllFields(fields)
      // Giữ checked hiện tại, chỉ thêm DEFAULT_FIELDS nếu chưa có
      setChecked(prev => {
        const next = new Set(prev)
        DEFAULT_FIELDS.forEach(f => next.add(f))
        return next
      })
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  // ── Toggle field ─────────────────────────────────────────────
  function toggleField(field: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(field) ? next.delete(field) : next.add(field)
      return next
    })
  }

  function selectAll()   { setChecked(new Set(allFields)) }
  function selectDefault() { setChecked(new Set(DEFAULT_FIELDS)) }

  // ── Cột hiển thị (theo thứ tự allFields, lọc checked) ───────
  const visibleFields = allFields.filter(f => checked.has(f))

  // ── Export Excel (SheetJS qua CDN) ───────────────────────────
  async function exportExcel() {
    if (records.length === 0) return

    // Load SheetJS on-demand
    // @ts-ignore
    if (!window.XLSX) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('Không tải được SheetJS'))
        document.head.appendChild(s)
      })
    }
    // @ts-ignore
    const XLSX = window.XLSX

    const headers = visibleFields.map(f => FIELD_LABELS[f] ?? f)
    const rows = records.map(row =>
      visibleFields.map(f => {
        const v = row[f]
        return v === null || v === undefined ? '' : String(v)
      })
    )

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

    // Auto column width
    const colWidths = visibleFields.map((f, i) => {
      const maxLen = Math.max(
        (FIELD_LABELS[f] ?? f).length,
        ...records.map(r => String(r[f] ?? '').length)
      )
      return { wch: Math.min(maxLen + 2, 40) }
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách xe')
    XLSX.writeFile(wb, `DanhSachXe_${custImid}_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-800 mb-1">🚗 Tải danh sách xe theo khách hàng</h2>
        <p className="text-xs text-gray-500 mb-4">Nhập mã khách hàng (Cust_IMID) để lấy danh sách xe từ CRM</p>

        {/* Input + Search */}
        <div className="flex gap-3 items-end">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1">Cust_IMID</label>
            <input
              ref={inputRef}
              type="text"
              value={custImid}
              onChange={e => setCustImid(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Nhập mã khách hàng..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? '⏳ Đang tải...' : '🔍 Tìm kiếm'}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* ── Kết quả ── */}
      {searched && !loading && records.length === 0 && !error && (
        <div className="text-center py-10 text-gray-400 text-sm">
          Không tìm thấy xe nào cho Cust_IMID: <strong>{custImid}</strong>
        </div>
      )}

      {records.length > 0 && (
        <>
          {/* ── Field selector dropdown ── */}
          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdown(o => !o)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:border-gray-400 transition min-w-[180px] justify-between"
              >
                <span>📋 Chọn cột ({checked.size}/{allFields.length})</span>
                <span className="text-gray-400 text-xs">{dropdownOpen ? '▲' : '▼'}</span>
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-64 py-2 max-h-80 overflow-y-auto">
                  {/* Quick actions */}
                  <div className="flex gap-2 px-3 pb-2 border-b border-gray-100 mb-1">
                    <button onClick={selectDefault}
                      className="flex-1 text-xs py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">
                      Mặc định
                    </button>
                    <button onClick={selectAll}
                      className="flex-1 text-xs py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">
                      Tất cả
                    </button>
                    <button onClick={() => setChecked(new Set())}
                      className="flex-1 text-xs py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">
                      Bỏ hết
                    </button>
                  </div>

                  {allFields.map(f => {
                    const isDefault = DEFAULT_FIELDS.includes(f)
                    const isOn = checked.has(f)
                    return (
                      <label key={f}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleField(f)}
                          className="w-4 h-4 rounded accent-blue-600"
                        />
                        <span className={`text-sm flex-1 ${isOn ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                          {FIELD_LABELS[f] ?? f}
                        </span>
                        {isDefault && (
                          <span className="text-[10px] text-blue-500 font-semibold">mặc định</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tags của các trường đang chọn */}
            <div className="flex flex-wrap gap-1.5">
              {visibleFields.map(f => (
                <span key={f}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full">
                  {FIELD_LABELS[f] ?? f}
                  <button onClick={() => toggleField(f)} className="hover:text-red-500 leading-none">×</button>
                </span>
              ))}
            </div>
          </div>

          {/* ── Bảng + nút xuất ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700 shrink-0">
                {records.length} xe — Cust_IMID: <span className="text-blue-600">{custImid}</span>
              </p>
              <div className="flex-1" />
              <button
                onClick={exportExcel}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition shrink-0"
              >
                📥 Xuất Excel
              </button>
            </div>

            {visibleFields.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Chưa chọn trường nào để hiển thị</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-400 w-8">#</th>
                      {visibleFields.map(f => (
                        <th key={f} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                          {FIELD_LABELS[f] ?? f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((row, i) => (
                      <tr key={i} className={`border-t border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-blue-50/30 transition`}>
                        <td className="px-3 py-2 text-right text-gray-400">{i + 1}</td>
                        {visibleFields.map(f => (
                          <td key={f} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate" title={String(row[f] ?? '')}>
                            {row[f] === null || row[f] === undefined ? (
                              <span className="text-gray-300">—</span>
                            ) : String(row[f])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
