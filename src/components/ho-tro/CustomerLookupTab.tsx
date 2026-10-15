'use client'

import { useState, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LookupResult {
  plate:            string
  found:            boolean
  cust_id:          string | null
  cust_imid:        string | null
  cust_name:        string | null
  machine_bar_code: string | null
  car_unicode:      string | null
  car_tel:          string | null
  chk_time:         string | null
  car_is_check:     boolean | null
}

type SignalFilter = 'all' | '3d' | '5d' | '7d'

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr.replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / 86_400_000
}

interface SheetData {
  name:    string
  headers: string[]
  rows:    string[][]
}

// ── Excel parser (SheetJS from CDN) ──────────────────────────────────────────

async function loadXLSX() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).XLSX) return (window as any).XLSX
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload  = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).XLSX
}

async function parseExcel(file: File): Promise<SheetData[]> {
  const XLSX = await loadXLSX()
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map((name: string) => {
    const ws  = wb.Sheets[name]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any
    const headers = (raw[0] ?? []).map(String)
    const rows    = raw.slice(1).map(r => r.map(String))
    return { name, headers, rows }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomerLookupTab() {
  // Input mode
  const [mode, setMode] = useState<'manual' | 'excel'>('manual')
  const [manualText, setManualText] = useState('')

  // Excel state
  const [sheets, setSheets]         = useState<SheetData[]>([])
  const [selSheet, setSelSheet]     = useState(0)
  const [selCol, setSelCol]         = useState(0)
  const [fileName, setFileName]     = useState('')
  const [parseError, setParseError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Results
  const [results, setResults]         = useState<LookupResult[]>([])
  const [loading, setLoading]         = useState(false)
  const [apiError, setApiError]       = useState('')
  const [searched, setSearched]       = useState(false)
  const [debugFields, setDebugFields] = useState<string[]>([])

  // Filter
  const [filterText, setFilterText]     = useState('')
  const [filterFound, setFilterFound]   = useState<'all' | 'found' | 'notfound'>('all')
  const [filterSignal, setFilterSignal] = useState<SignalFilter>('all')

  // ── Parse Excel ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setParseError('')
    setSheets([])
    setFileName(file.name)
    try {
      const parsed = await parseExcel(file)
      setSheets(parsed)
      setSelSheet(0)
      setSelCol(0)
    } catch (e) {
      setParseError(`Không đọc được file: ${String(e)}`)
    }
  }, [])

  // ── Collect plates ─────────────────────────────────────────────────────────
  const getPlates = useCallback((): string[] => {
    if (mode === 'manual') {
      return manualText
        .split(/[\n,;]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
    }
    // Excel mode
    const sheet = sheets[selSheet]
    if (!sheet) return []
    return sheet.rows
      .map(r => (r[selCol] ?? '').trim().toUpperCase())
      .filter(Boolean)
  }, [mode, manualText, sheets, selSheet, selCol])

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const plates = getPlates()
    if (plates.length === 0) return

    setLoading(true)
    setApiError('')
    setResults([])
    setSearched(true)
    setFilterText('')
    setFilterFound('all')
    setFilterSignal('all')

    try {
      const res = await fetch('/api/crm/customer-lookup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plates }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Lỗi không xác định')
      setResults(json.results ?? [])
      setDebugFields(json._debug_customer_fields ?? [])
    } catch (e) {
      setApiError(String(e))
    } finally {
      setLoading(false)
    }
  }, [getPlates])

  // ── Derived ────────────────────────────────────────────────────────────────
  const plates       = getPlates()
  const currentSheet = sheets[selSheet]

  const SIGNAL_DAYS: Record<SignalFilter, number> = { all: 0, '3d': 3, '5d': 5, '7d': 7 }

  const filtered = results.filter(r => {
    if (filterFound === 'found'    && !r.found) return false
    if (filterFound === 'notfound' &&  r.found) return false
    if (filterSignal !== 'all') {
      const days = daysSince(r.chk_time)
      if (days == null || days < SIGNAL_DAYS[filterSignal]) return false
    }
    if (filterText) {
      const q = filterText.toUpperCase()
      return (
        r.plate.includes(q)                              ||
        (r.cust_name       ?? '').toUpperCase().includes(q) ||
        (r.car_tel         ?? '').includes(filterText)   ||
        (r.car_unicode     ?? '').toUpperCase().includes(q) ||
        (r.machine_bar_code ?? '').toUpperCase().includes(q)
      )
    }
    return true
  })

  const foundCount    = results.filter(r =>  r.found).length
  const notFoundCount = results.filter(r => !r.found).length

  // ── Shared row builder ─────────────────────────────────────────────────────
  const EXPORT_HEADERS = ['Biển số', 'Mã KH', 'Tên KH', 'MachineBarCode', 'Thiết bị (Unicode)', 'SĐT', 'Thời gian cuối (CHKTime)', 'Số ngày mất TH', 'Kích hoạt']

  const toRow = useCallback((r: LookupResult) => {
    const days = daysSince(r.chk_time)
    return [
      r.plate,
      r.cust_id          ?? '',
      r.cust_name        ?? '',
      r.machine_bar_code ?? '',
      r.car_unicode      ?? '',
      r.car_tel          ?? '',
      r.chk_time         ?? '',
      days != null ? days.toFixed(1) : '',
      r.car_is_check == null ? '' : r.car_is_check ? 'Có' : 'Không',
    ]
  }, [])

  // ── Copy table to clipboard ────────────────────────────────────────────────
  const copyTable = useCallback(() => {
    const rows = filtered.map(r => toRow(r).join('\t'))
    navigator.clipboard.writeText([EXPORT_HEADERS.join('\t'), ...rows].join('\n'))
  }, [filtered, toRow, EXPORT_HEADERS])

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines  = [
      EXPORT_HEADERS.map(escape).join(','),
      ...filtered.map(r => toRow(r).map(escape).join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `tra-cuu-kh-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered, toRow, EXPORT_HEADERS])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Input panel ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Tra cứu thông tin khách hàng theo biển số
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2">
          {(['manual', 'excel'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-xs rounded-lg font-medium border transition ${
                mode === m
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}>
              {m === 'manual' ? '✏️ Nhập tay' : '📊 Upload Excel'}
            </button>
          ))}
        </div>

        {/* Manual input */}
        {mode === 'manual' && (
          <div>
            <p className="text-[10px] text-gray-400 mb-1">
              Nhập biển số (mỗi biển một dòng, hoặc cách nhau bằng dấu phẩy/chấm phẩy)
            </p>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={5}
              placeholder={"LA0145\nBD12345\nTP67890"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
        )}

        {/* Excel input */}
        {mode === 'excel' && (
          <div className="space-y-3">
            <div>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 text-sm bg-gray-50 border border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition font-medium text-gray-600">
                📂 {fileName ? fileName : 'Chọn file Excel (.xlsx / .xls / .csv)'}
              </button>
              {parseError && <p className="text-xs text-red-500 mt-1">{parseError}</p>}
            </div>

            {sheets.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {/* Sheet selector */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Sheet</p>
                  <select
                    value={selSheet}
                    onChange={e => { setSelSheet(Number(e.target.value)); setSelCol(0) }}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Column selector */}
                {currentSheet && currentSheet.headers.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Cột chứa biển số</p>
                    <select
                      value={selCol}
                      onChange={e => setSelCol(Number(e.target.value))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                      {currentSheet.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Cột ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Preview */}
                {currentSheet && (
                  <div className="text-xs text-gray-500 self-end pb-1.5">
                    {plates.length} biển số từ cột &quot;
                    {currentSheet.headers[selCol] || `Cột ${selCol + 1}`}&quot;
                    {plates.length > 0 && (
                      <span className="ml-2 text-gray-400">
                        (VD: {plates.slice(0, 3).join(', ')}{plates.length > 3 ? '...' : ''})
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={loading || plates.length === 0}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {loading ? '⏳ Đang tra cứu...' : `🔍 Tra cứu ${plates.length > 0 ? `(${plates.length} biển)` : ''}`}
          </button>
          {plates.length > 500 && (
            <p className="text-xs text-orange-500">⚠️ Tối đa 500 biển số mỗi lần</p>
          )}
        </div>

        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
            {apiError}
          </div>
        )}

        {debugFields.length > 0 && (
          <details className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <summary className="text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer">
              🔍 Debug — Fields từ GetCustomerByInfo ({debugFields.length} trường)
            </summary>
            <p className="mt-1 text-[11px] font-mono text-gray-600 break-all">
              {debugFields.join(' | ')}
            </p>
          </details>
        )}
      </div>

      {/* ── Results ── */}
      {searched && results.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Summary + filter bar */}
          <div className="px-4 pt-4 pb-3 space-y-2.5 border-b border-gray-50">
            {/* Row 1: found filter + text search + actions */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['all',      `Tất cả (${results.length})`,    ''],
                ['found',    `Tìm thấy (${foundCount})`,      'bg-emerald-100 text-emerald-800'],
                ['notfound', `Không thấy (${notFoundCount})`, 'bg-red-100 text-red-700'],
              ] as const).map(([val, label, cls]) => (
                <button key={val} onClick={() => setFilterFound(val)}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition ${
                    filterFound === val
                      ? (cls || 'bg-gray-800 text-white border-gray-800')
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}>
                  {label}
                </button>
              ))}

              <input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="Lọc biển số, tên, SĐT..."
                className="border border-gray-200 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 w-48"
              />

              <div className="ml-auto flex gap-2">
                <button onClick={copyTable}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition">
                  📋 Sao chép
                </button>
                <button onClick={exportCSV}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition">
                  ⬇️ Xuất CSV
                </button>
              </div>
            </div>

            {/* Row 2: signal loss filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Mất tín hiệu &gt;</span>
              {([
                ['all', 'Tất cả',  ''],
                ['3d',  '3 ngày',  'bg-yellow-100 text-yellow-800'],
                ['5d',  '5 ngày',  'bg-orange-100 text-orange-800'],
                ['7d',  '7 ngày',  'bg-red-100 text-red-700'],
              ] as const).map(([val, label, cls]) => (
                <button key={val} onClick={() => setFilterSignal(val)}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition ${
                    filterSignal === val
                      ? (cls || 'bg-gray-800 text-white border-gray-800')
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}>
                  {label}
                  {val !== 'all' && ` (${results.filter(r => { const d = daysSince(r.chk_time); return d != null && d >= SIGNAL_DAYS[val as SignalFilter] }).length})`}
                </button>
              ))}
              <span className="text-[10px] text-gray-300 ml-1">{filtered.length} kết quả</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left font-semibold w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Biển số</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Mã KH</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tên khách hàng</th>
                  <th className="px-3 py-2.5 text-left font-semibold">MachineBarCode</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Thiết bị (Unicode)</th>
                  <th className="px-3 py-2.5 text-left font-semibold">SĐT</th>
                  <th className="px-3 py-2.5 text-left font-semibold">CHKTime</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Ngày mất TH</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Kích hoạt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => (
                  <tr key={r.plate} className={`hover:bg-gray-50 ${!r.found ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold text-gray-800">{r.plate}</span>
                      {!r.found && (
                        <span className="ml-2 text-[10px] text-red-400 bg-red-50 px-1.5 py-0.5 rounded">
                          Không tìm thấy
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 font-mono">{r.cust_id ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-700 font-medium">{r.cust_name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono">{r.machine_bar_code || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.car_unicode ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.car_tel ? (
                        <a href={`tel:${r.car_tel}`}
                          className="text-blue-600 hover:underline">{r.car_tel}</a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-[11px] whitespace-nowrap">{r.chk_time ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {(() => {
                        const d = daysSince(r.chk_time)
                        if (d == null) return <span className="text-gray-300">—</span>
                        const cls = d >= 7 ? 'text-red-600 font-bold'
                                  : d >= 5 ? 'text-orange-500 font-semibold'
                                  : d >= 3 ? 'text-yellow-600 font-semibold'
                                  : 'text-gray-500'
                        return <span className={cls}>{d.toFixed(1)}</span>
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.car_is_check == null ? (
                        <span className="text-gray-300">—</span>
                      ) : r.car_is_check ? (
                        <span className="text-emerald-600 font-semibold">✓</span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                      Không có kết quả khớp với bộ lọc
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {searched && !loading && results.length === 0 && !apiError && (
        <div className="text-center py-10 text-gray-400 text-sm">
          Không tìm thấy kết quả nào
        </div>
      )}
    </div>
  )
}
