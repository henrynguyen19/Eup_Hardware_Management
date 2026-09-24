'use client'

import { useState, useRef, useEffect, useMemo } from 'react'

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
  SimBarCode:     'SĐT SIM',
  CHKTime:        'Ngày kiểm tra',
}

type CarRecord = Record<string, unknown>
type SimCategory = '9' | '10' | '11' | 'other'

// ── Chuẩn hóa số điện thoại ──────────────────────────────────
function normalizePhone(raw: string): string {
  const s = raw.trim().replace(/\D/g, '')
  if (s.length === 9)  return '0' + s
  if (s.length === 10) return '0' + s
  if (s.length === 11 && s.startsWith('84')) return '0' + s.slice(2)
  return s
}

function simCategory(raw: string): SimCategory {
  const s = raw.trim().replace(/\D/g, '')
  if (s.length === 9)  return '9'
  if (s.length === 10) return '10'
  if (s.length === 11) return '11'
  return 'other'
}

export default function CarListTab() {
  const [custImid, setCustImid]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [records, setRecords]       = useState<CarRecord[]>([])
  const [allFields, setAllFields]   = useState<string[]>([])
  const [checked, setChecked]       = useState<Set<string>>(new Set(DEFAULT_FIELDS))
  const [searched, setSearched]     = useState(false)
  const [dropdownOpen, setDropdown] = useState(false)
  const [simFilter, setSimFilter]   = useState<'all' | SimCategory>('all')
  // ── Filter từng cột: field → keyword ─────────────────────────
  const [colFilters, setColFilters] = useState<Record<string, string>>({})

  const inputRef    = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdown(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // ── Tìm kiếm ────────────────────────────────────────────────
  async function handleSearch() {
    const imid = custImid.trim()
    if (!imid) { inputRef.current?.focus(); return }
    setLoading(true); setError(''); setRecords([]); setSearched(true)
    setSimFilter('all'); setColFilters({})
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

      const seen = new Set<string>()
      const fields: string[] = []
      DEFAULT_FIELDS.forEach(f => { seen.add(f); fields.push(f) })
      rows.forEach(row => Object.keys(row).forEach(k => {
        if (!seen.has(k)) { seen.add(k); fields.push(k) }
      }))
      setAllFields(fields)
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
  function selectAll()     { setChecked(new Set(allFields)) }
  function selectDefault() { setChecked(new Set(DEFAULT_FIELDS)) }

  const visibleFields = allFields.filter(f => checked.has(f))
  const hasSimField   = records.length > 0 && allFields.includes('SimBarCode')

  // ── Hiển thị giá trị ô ───────────────────────────────────────
  function cellValue(row: CarRecord, field: string): string {
    const raw = row[field]
    if (raw === null || raw === undefined) return ''
    if (field === 'SimBarCode') return normalizePhone(String(raw))
    return String(raw)
  }

  // ── Thống kê loại SIM (trên toàn bộ records gốc) ─────────────
  const simStats = useMemo(() => {
    if (!hasSimField) return null
    const counts: Record<string, number> = { '9': 0, '10': 0, '11': 0, 'other': 0 }
    records.forEach(r => counts[simCategory(String(r['SimBarCode'] ?? ''))]++)
    return counts
  }, [records, hasSimField])

  // ── Kiểm tra có filter cột nào đang active không ─────────────
  const hasColFilter = Object.values(colFilters).some(v => v.trim() !== '')

  // ── Áp dụng tất cả filter ────────────────────────────────────
  const filteredRecords = useMemo(() => {
    let rows = records

    // 1. Filter SIM category
    if (hasSimField && simFilter !== 'all') {
      rows = rows.filter(r => simCategory(String(r['SimBarCode'] ?? '')) === simFilter)
    }

    // 2. Filter từng cột (AND logic)
    for (const [field, kw] of Object.entries(colFilters)) {
      const q = kw.trim().toLowerCase()
      if (!q) continue
      rows = rows.filter(r => cellValue(r, field).toLowerCase().includes(q))
    }

    return rows
  }, [records, simFilter, colFilters, hasSimField])

  function setColFilter(field: string, val: string) {
    setColFilters(prev => ({ ...prev, [field]: val }))
  }

  function clearAllFilters() {
    setSimFilter('all')
    setColFilters({})
  }

  // ── Export Excel ─────────────────────────────────────────────
  async function exportExcel() {
    if (filteredRecords.length === 0) return
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
    const rows = filteredRecords.map(row => visibleFields.map(f => cellValue(row, f)))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = visibleFields.map(f => ({
      wch: Math.min(Math.max((FIELD_LABELS[f] ?? f).length, ...filteredRecords.map(r => cellValue(r, f).length)) + 2, 40)
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách xe')
    const suffix = simFilter !== 'all' ? `_sim${simFilter}so` : ''
    XLSX.writeFile(wb, `DanhSachXe_${custImid}${suffix}_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const activeFilterCount =
    (simFilter !== 'all' ? 1 : 0) +
    Object.values(colFilters).filter(v => v.trim()).length

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-800 mb-1">🚗 Tải danh sách xe theo khách hàng</h2>
        <p className="text-xs text-gray-500 mb-4">Nhập mã khách hàng (Cust_IMID) để lấy danh sách xe từ CRM</p>

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
          <button onClick={handleSearch} disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? '⏳ Đang tải...' : '🔍 Tìm kiếm'}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠️ {error}
          </div>
        )}
      </div>

      {searched && !loading && records.length === 0 && !error && (
        <div className="text-center py-10 text-gray-400 text-sm">
          Không tìm thấy xe nào cho Cust_IMID: <strong>{custImid}</strong>
        </div>
      )}

      {records.length > 0 && (
        <>
          {/* ── Filter SIM theo loại số ── */}
          {hasSimField && simStats && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium shrink-0">SĐT SIM:</span>
              {([
                { key: 'all', label: 'Tất cả', count: records.length,  color: 'bg-gray-700 text-white', inactive: 'bg-white border-gray-300 text-gray-600 hover:border-gray-400' },
                { key: '9',  label: '9 số',    count: simStats['9'],   color: 'bg-amber-500 text-white', inactive: 'bg-white border-amber-300 text-amber-700 hover:border-amber-400' },
                { key: '10', label: '10 số',   count: simStats['10'],  color: 'bg-blue-600 text-white',  inactive: 'bg-white border-blue-300 text-blue-700 hover:border-blue-400' },
                { key: '11', label: '11 số',   count: simStats['11'],  color: 'bg-purple-600 text-white', inactive: 'bg-white border-purple-300 text-purple-700 hover:border-purple-400' },
                ...(simStats['other'] > 0 ? [{ key: 'other', label: 'Khác', count: simStats['other'], color: 'bg-gray-400 text-white', inactive: 'bg-white border-gray-300 text-gray-500 hover:border-gray-400' }] : []),
              ] as { key: string; label: string; count: number; color: string; inactive: string }[]).map(btn =>
                btn.count === 0 ? null :
                <button key={btn.key}
                  onClick={() => setSimFilter(btn.key as typeof simFilter)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                    simFilter === btn.key ? btn.color + ' border-transparent' : btn.inactive + ' border'
                  }`}
                >
                  {btn.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    simFilter === btn.key ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
                  }`}>{btn.count}</span>
                </button>
              )}
              <span className="text-[10px] text-gray-400 ml-1 shrink-0">
                · 9→+0 &nbsp;|&nbsp; 10→+0 &nbsp;|&nbsp; 11 (84x)→bỏ84+0
              </span>
            </div>
          )}

          {/* ── Toolbar: field selector + clear + export ── */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Dropdown chọn cột */}
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
                  <div className="flex gap-2 px-3 pb-2 border-b border-gray-100 mb-1">
                    <button onClick={selectDefault} className="flex-1 text-xs py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">Mặc định</button>
                    <button onClick={selectAll}     className="flex-1 text-xs py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">Tất cả</button>
                    <button onClick={() => setChecked(new Set())} className="flex-1 text-xs py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">Bỏ hết</button>
                  </div>
                  {allFields.map(f => {
                    const isDefault = DEFAULT_FIELDS.includes(f)
                    const isOn = checked.has(f)
                    return (
                      <label key={f} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer select-none">
                        <input type="checkbox" checked={isOn} onChange={() => toggleField(f)}
                          className="w-4 h-4 rounded accent-blue-600" />
                        <span className={`text-sm flex-1 ${isOn ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                          {FIELD_LABELS[f] ?? f}
                        </span>
                        {isDefault && <span className="text-[10px] text-blue-500 font-semibold">mặc định</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tags cột đang chọn */}
            <div className="flex flex-wrap gap-1.5 flex-1">
              {visibleFields.map(f => (
                <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full">
                  {FIELD_LABELS[f] ?? f}
                  <button onClick={() => toggleField(f)} className="hover:text-red-500 leading-none">×</button>
                </span>
              ))}
            </div>

            {/* Nút xóa filter */}
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters}
                className="flex items-center gap-1 px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition shrink-0">
                ✕ Xóa filter ({activeFilterCount})
              </button>
            )}

            <button onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition shrink-0">
              📥 Xuất Excel ({filteredRecords.length})
            </button>
          </div>

          {/* ── Bảng kết quả ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2 text-xs text-gray-500">
              Hiển thị <strong className="text-gray-800">{filteredRecords.length}</strong> / {records.length} xe
              {activeFilterCount > 0 && (
                <span className="text-orange-500">· đang lọc {activeFilterCount} điều kiện</span>
              )}
            </div>

            {visibleFields.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Chưa chọn trường nào để hiển thị</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    {/* Hàng tiêu đề */}
                    <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-400 w-8">#</th>
                      {visibleFields.map(f => (
                        <th key={f} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                          {FIELD_LABELS[f] ?? f}
                          {f === 'SimBarCode' && (
                            <span className="ml-1 text-[9px] text-blue-400 normal-case font-normal">(đã chuẩn hóa)</span>
                          )}
                        </th>
                      ))}
                    </tr>
                    {/* Hàng filter — 1 ô input mỗi cột */}
                    <tr className="bg-yellow-50/60 border-t border-yellow-100">
                      <td className="px-2 py-1.5 text-center text-gray-400 text-[10px]">
                        🔍
                      </td>
                      {visibleFields.map(f => {
                        const val = colFilters[f] ?? ''
                        return (
                          <td key={f} className="px-2 py-1.5">
                            <input
                              type="text"
                              value={val}
                              onChange={e => setColFilter(f, e.target.value)}
                              placeholder={`Lọc ${FIELD_LABELS[f] ?? f}...`}
                              className={`w-full min-w-[80px] border rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300 transition ${
                                val ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'
                              }`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={visibleFields.length + 1} className="text-center py-8 text-gray-400 text-sm">
                          Không có dữ liệu khớp với bộ lọc
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((row, i) => (
                        <tr key={i} className={`border-t border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-blue-50/30 transition`}>
                          <td className="px-3 py-2 text-right text-gray-400">{i + 1}</td>
                          {visibleFields.map(f => {
                            const raw = row[f]
                            const display = cellValue(row, f)
                            const isPhone = f === 'SimBarCode' && raw != null
                            const cat = isPhone ? simCategory(String(raw)) : null
                            const phoneColor = cat === '9' ? 'text-amber-700' : cat === '10' ? 'text-blue-700' : cat === '11' ? 'text-purple-700' : 'text-gray-700'
                            // Highlight nếu cột đang có filter
                            const filterKw = (colFilters[f] ?? '').trim().toLowerCase()
                            const highlight = filterKw && display.toLowerCase().includes(filterKw)
                            return (
                              <td key={f}
                                className={`px-3 py-2 whitespace-nowrap max-w-[200px] truncate ${
                                  isPhone ? phoneColor + ' font-medium' : 'text-gray-700'
                                } ${highlight ? 'bg-yellow-50' : ''}`}
                                title={isPhone ? `Gốc: ${String(raw)}` : String(raw ?? '')}>
                                {display || <span className="text-gray-300">—</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
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
