'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react'
import { AppSettings } from '@/types/equipment'

interface Props {
  open: boolean
  onClose: () => void
  settings: AppSettings
}

interface ParsedRow {
  equipment_id: string
  name: string
  category: string
  vendor: string
  status: string
  tags: string[]
  notes: string
  net_weight?: number
  error?: string
}

// 簡易 CSV 解析（支援雙引號跳脫）
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else { inQuotes = !inQuotes }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    rows.push(cells)
  }
  return rows
}

function csvToRows(text: string, settings: AppSettings): ParsedRow[] {
  // 去除 Excel UTF-8 BOM（﻿），否則第一欄 header 比對會thất bại
  const raw = parseCSV(text.replace(/^﻿/, ''))
  if (raw.length < 2) return []

  // 第一列為 header；去除（必填）/（選填）等修飾詞，支援Trung bình文範本與英文 header 並存
  const headers = raw[0].map(h => h.trim().toLowerCase().replace(/[（(][^）)]*[）)]/g, '').trim())

  // header tên對應（支援Trung bình英文）
  function col(row: string[], ...names: string[]): string {
    for (const name of names) {
      const idx = headers.indexOf(name)
      if (idx !== -1) return row[idx]?.trim() ?? ''
    }
    return ''
  }

  const validStatuses = settings.statuses

  return raw.slice(1).map(cols => {
    const equipment_id = col(cols, 'equipment_id', 'Mã thiết bị')
    const name = col(cols, 'name', 'Tên thiết bị')
    const category = col(cols, 'category', 'Danh mục')
    const vendor = col(cols, 'vendor', 'Nhà cung cấp')
    const status = col(cols, 'status', 'Trạng thái')
    const tagsRaw = col(cols, 'tags', 'Tags')
    const notes = col(cols, 'notes', 'Ghi chú')
    const netWeightRaw = col(cols, 'net_weight', 'Khối lượng tịnh', 'Khối lượng tịnh(kg)', 'Khối lượng tịnh (kg)')

    const tags = tagsRaw ? tagsRaw.split('|').map(t => t.trim()).filter(Boolean) : []
    const net_weight = netWeightRaw ? parseFloat(netWeightRaw) : undefined

    let error: string | undefined
    if (!equipment_id) error = 'Mã thiết bị là bắt buộc'
    else if (!name) error = 'Tên thiết bị là bắt buộc'
    else if (status && !validStatuses.includes(status)) error = `Trạng thái「${status}」無效，請填 ${validStatuses.join(' 或 ')}`
    else if (netWeightRaw && (isNaN(net_weight!) || net_weight! < 0)) error = `Khối lượng tịnh「${netWeightRaw}」Định dạng sai，請填數字`

    return {
      equipment_id,
      name,
      category,
      vendor,
      status: status || validStatuses[0],
      tags,
      notes,
      net_weight,
      error,
    }
  })
}

type Step = 'upload' | 'preview' | 'done'

interface ImportResult {
  inserted: number
  updated: number
  skipped: string[]
  errors: string[]
}

export default function BatchImportDialog({ open, onClose, settings }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')

  const validRows = rows.filter(r => !r.error)
  const invalidRows = rows.filter(r => r.error)

  function handleClose() {
    setStep('upload')
    setRows([])
    setResult(null)
    setFileName('')
    onClose()
  }

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { alert('請upload .csv 檔案'); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = csvToRows(text, settings)
      if (parsed.length === 0) { alert('CSV Không có dữ liệu hợp lệ，請xác nhậnđịnh dạng'); return }
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }, [settings])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const res = await fetch('/api/cards/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })
      const data = await res.json()
      setResult(data)
      setStep('done')
      if (data.inserted > 0 || data.updated > 0) router.refresh()
    } catch {
      alert('Nhậpthất bại，vui lòng thử lại')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ddd4]">
          <h2 className="text-lg font-semibold text-[#3d2b1a]">批次NhậpThiết bị</h2>
          <button onClick={handleClose} className="text-[#a08060] hover:text-[#7a5230] transition-colors focus:outline-none">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step: upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="text-sm text-[#6b4c2e] space-y-1">
                <p>upload CSV 檔案，一次Thêm mới多mụcThiết bị。tải xuống範本填入dữ liệu後再upload即可。</p>
              </div>

              {/* Field legend */}
              <div className="rounded-xl border border-[#e8ddd4] bg-[#faf6f0] px-4 py-3 text-sm space-y-1">
                <p className="font-medium text-[#7a5230] mb-1.5">欄位說明</p>
                <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[#5a3c1e]">
                  <span><span className="font-medium">Mã thiết bị</span>（必填）</span>
                  <span><span className="font-medium">Tên thiết bị</span>（必填）</span>
                  <span className="text-[#8a6a4a]">Danh mục（選填）</span>
                  <span className="text-[#8a6a4a]">Nhà cung cấp（選填）</span>
                  <span className="text-[#8a6a4a]">Trạng thái（選填，預設「現役」）</span>
                  <span className="text-[#8a6a4a]">Tags（選填，用 <code className="bg-[#ede5db] px-1 rounded text-xs">|</code> 分隔）</span>
                  <span className="text-[#8a6a4a]">Ghi chú（選填）</span>
                  <span className="text-[#8a6a4a]">Khối lượng tịnhkg（選填）</span>
                </div>
              </div>

              {/* Download template */}
              <a
                href="/batch-import-template.csv"
                download="Thiết bị批次Nhập範本.csv"
                className="inline-flex items-center gap-2 text-sm text-[#7a5230] hover:text-[#5a3010] font-medium"
              >
                <Download className="h-4 w-4" />
                tải xuống CSV 範本
              </a>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-[#7a5230] bg-[#faf6f0]' : 'border-[#d5c4b0] hover:border-[#c49a72] hover:bg-[#faf6f0]'
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-[#c49a72] mx-auto mb-3" />
                <p className="text-[#7a5230] font-medium">點擊或拖曳 CSV 檔案至此</p>
                <p className="text-[#a08060] text-sm mt-1">僅支援 .csv định dạng，UTF-8 編碼</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-[#a08060]" />
                <span className="text-[#6b4c2e]">{fileName}</span>
                <span className="text-[#c49a72]">·</span>
                <span className="text-emerald-600 font-medium">{validRows.length} mục可Nhập</span>
                {invalidRows.length > 0 && (
                  <>
                    <span className="text-[#c49a72]">·</span>
                    <span className="text-red-500 font-medium">{invalidRows.length} mục有錯誤（將跳過）</span>
                  </>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#e8ddd4]">
                <table className="w-full text-sm">
                  <thead className="bg-[#faf6f0] text-[#7a5230]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium w-8">#</th>
                      <th className="px-3 py-2 text-left font-medium">Mã thiết bị</th>
                      <th className="px-3 py-2 text-left font-medium">Tên thiết bị</th>
                      <th className="px-3 py-2 text-left font-medium">Danh mục</th>
                      <th className="px-3 py-2 text-left font-medium">Nhà cung cấp</th>
                      <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                      <th className="px-3 py-2 text-left font-medium">Tags</th>
                      <th className="px-3 py-2 text-left font-medium w-32">Ghi chú</th>
                      <th className="px-3 py-2 text-left font-medium">Khối lượng tịnh (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0e8e0]">
                    {rows.map((row, i) => (
                      <tr key={i} className={row.error ? 'bg-red-50' : 'bg-white hover:bg-[#faf6f0]'}>
                        <td className="px-3 py-2 text-[#a08060]">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-[#3d2b1a]">{row.equipment_id || <span className="text-red-400">（空）</span>}</td>
                        <td className="px-3 py-2 text-[#3d2b1a]">{row.name || <span className="text-red-400">（空）</span>}</td>
                        <td className="px-3 py-2 text-[#6b4c2e]">{row.category}</td>
                        <td className="px-3 py-2 text-[#6b4c2e]">{row.vendor}</td>
                        <td className="px-3 py-2 text-[#6b4c2e]">{row.status}</td>
                        <td className="px-3 py-2 text-[#8a6a4a] text-xs">{row.tags.join('、')}</td>
                        <td className="px-3 py-2 text-[#8a6a4a] truncate max-w-[8rem]" title={row.notes}>{row.notes}</td>
                        <td className="px-3 py-2 text-[#8a6a4a]">{row.net_weight ?? '—'}</td>
                        {row.error && (
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1 text-red-500 text-xs whitespace-nowrap">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              {row.error}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-800">NhậpHoàn thành</p>
                  <p className="text-sm text-emerald-700 mt-0.5">thành côngThêm mới {result.inserted} mụcThiết bị</p>
                  {result.updated > 0 && (
                    <p className="text-sm text-emerald-700 mt-0.5">Cập nhật {result.updated} mụcThiết bị</p>
                  )}
                </div>
              </div>
              {result.skipped.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-sm">
                  <p className="font-medium text-amber-800 mb-1">跳過（Mã thiết bị đã tồn tại）{result.skipped.length} mục</p>
                  <p className="text-amber-700 font-mono text-xs">{result.skipped.join('、')}</p>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-sm">
                  <p className="font-medium text-red-800 mb-1">寫入thất bại {result.errors.length} mục</p>
                  <ul className="text-red-700 text-xs space-y-0.5">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e8ddd4] bg-[#faf6f0] rounded-b-2xl">
          {step === 'upload' && (
            <button onClick={handleClose} className="text-sm text-[#a08060] hover:text-[#7a5230]">Hủy</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="text-sm text-[#a08060] hover:text-[#7a5230]">
                重新upload
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-[#7a5230] hover:bg-[#6a4520] text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors focus:outline-none"
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                xác nhậnNhập {validRows.length} mục
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={handleClose}
              className="ml-auto px-5 py-2 bg-[#7a5230] hover:bg-[#6a4520] text-white text-sm font-medium rounded-lg transition-colors focus:outline-none"
            >
              Hoàn thành
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
