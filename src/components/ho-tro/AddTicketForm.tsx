'use client'

import { useState, useMemo } from 'react'
import type { StaffConfig } from '@/lib/staff-sheets'

// ── Constants ─────────────────────────────────────────────────────
const CATEGORIES = ['hardware', 'fuelsensor', 'arrowware']

const DEVICE_OPTIONS = [
  'VN88 2G', 'VN88 4G', 'VN88 4GH', 'S168', 'DVR',
  'FUEL', 'Go168', 'MT99', 'C43', 'H5', 'BW',
  'RFID', 'ADAS', 'GPS', 'GSM',
]

const ERROR_OPTIONS = [
  'SP', 'NC', 'PW', 'ACC', 'IO', 'SS', 'DMS',
  'ADAS', 'GPS', 'GSM', 'FS100', 'SOJI', 'RFID',
]

const FLAGS = [
  { value: 'F',  label: '#F — Follow up' },
  { value: 'N',  label: '#N — New/Mới' },
  { value: 'L',  label: '#L — Lên lịch' },
]

const STATUSES = ['Unprocessing', 'Processing', 'Close case']

const REQUEST_TYPES = ['Xử lý vấn đề', 'Xử lý lỗi', 'Kiểm tra', 'Tư vấn', 'Khác']

const DIRECTIONS = ['Vào', 'Ra'] as const

const SALES_ALIASES = ['Alice', 'Clara', 'Soda', 'Winter', 'Mango', 'Canary', 'Khác']

// ── Types ─────────────────────────────────────────────────────────
interface FormData {
  code:          string
  company:       string
  date:          string
  contactPerson: string
  requestType:   string
  salesAlias:    string
  direction:     'Vào' | 'Ra'
  content:       string
  status:        string
  assignee:      string
  salesMan:      string
  assistant:     string
  category:      string
  devices:       string[]
  errors:        string[]
  flag:          string
  licensePlate:  string
  notes:         string
  km:            string
  startPoint:    string
  endPoint:      string
}

const EMPTY_FORM: FormData = {
  code: '', company: '', date: new Date().toISOString().slice(0, 10),
  contactPerson: '', requestType: 'Xử lý vấn đề', salesAlias: '',
  direction: 'Vào', content: '', status: 'Unprocessing',
  assignee: '', salesMan: '', assistant: '',
  category: 'hardware', devices: [], errors: [],
  flag: '', licensePlate: '', notes: '', km: '', startPoint: '', endPoint: '',
}

// ── Helper ────────────────────────────────────────────────────────
function buildPreview(f: FormData): string {
  const parts: string[] = []
  if (f.category) parts.push(`#${f.category}`)
  for (const d of f.devices) parts.push(`#${d.toLowerCase().replace(/\s+/g, '')}`)
  for (const e of f.errors)   parts.push(`#${e.toLowerCase()}`)
  if (f.assignee) parts.push(f.assignee.toLowerCase())
  if (f.date) {
    const [, m, d] = f.date.split('-')
    parts.push(`${parseInt(d)}/${parseInt(m)}`)
  }
  if (f.flag)          parts.push(`#${f.flag}`)
  if (f.licensePlate)  parts.push(f.licensePlate)
  if (f.notes)         parts.push(f.notes)
  return parts.join(' ')
}

// ── Sub-components ────────────────────────────────────────────────
function ChipSelect({ label, options, selected, onToggle, color = 'blue' }: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (val: string) => void
  color?: string
}) {
  const active: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-700 border-blue-400',
    orange: 'bg-orange-100 text-orange-700 border-orange-400',
    purple: 'bg-purple-100 text-purple-700 border-purple-400',
  }
  const inactive = 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition ${
              selected.includes(opt) ? (active[color] ?? active.blue) : inactive
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white'
const SELECT = INPUT + ' appearance-none'

// ── Main Form ─────────────────────────────────────────────────────
interface Props {
  allStaff: StaffConfig[]
  onClose: () => void
  onSuccess?: (msg: string) => void
}

export default function AddTicketForm({ allStaff, onClose, onSuccess }: Props) {
  const [form, setForm]       = useState<FormData>(EMPTY_FORM)
  const [submitting, setSubmit] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const preview = useMemo(() => buildPreview(form), [form])

  function set(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleChip(field: 'devices' | 'errors', value: string) {
    setForm(prev => {
      const arr = prev[field]
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value],
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.assignee) { setError('Chọn nhân viên xử lý'); return }
    if (!form.company)  { setError('Nhập tên khách hàng'); return }
    if (!form.content)  { setError('Nhập nội dung yêu cầu'); return }

    setSubmit(true)
    setError(null)
    try {
      const res  = await fetch('/api/ho-tro/add-ticket', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Lỗi không xác định')
      onSuccess?.(json.message ?? 'Đã ghi thành công')
      setForm({ ...EMPTY_FORM, assignee: form.assignee, date: form.date })
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setSubmit(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Nhập liệu yêu cầu kỹ thuật</h2>
            <p className="text-xs text-gray-400">Dữ liệu sẽ được ghi vào Google Sheet tương ứng</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold transition">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Row 1: Code + Date + Direction */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mã ticket (CRM)">
              <input className={INPUT} placeholder="VD: 25786" value={form.code} onChange={e => set('code', e.target.value)} />
            </Field>
            <Field label="Ngày" required>
              <input type="date" className={INPUT} value={form.date} onChange={e => set('date', e.target.value)} />
            </Field>
            <Field label="Chiều">
              <select className={SELECT} value={form.direction} onChange={e => set('direction', e.target.value as 'Vào' | 'Ra')}>
                {DIRECTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </Field>
          </div>

          {/* Row 2: Company + Contact */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên khách hàng" required>
              <input className={INPUT} placeholder="Tên công ty / cá nhân" value={form.company} onChange={e => set('company', e.target.value)} />
            </Field>
            <Field label="Người liên hệ">
              <input className={INPUT} placeholder="VD: Anh Tuấn" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
            </Field>
          </div>

          {/* Row 3: Type + Sales + Assignee + Status */}
          <div className="grid grid-cols-4 gap-3">
            <Field label="Loại yêu cầu">
              <select className={SELECT} value={form.requestType} onChange={e => set('requestType', e.target.value)}>
                {REQUEST_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Trợ lý (alias)">
              <select className={SELECT} value={form.salesAlias} onChange={e => set('salesAlias', e.target.value)}>
                <option value="">-- Chọn --</option>
                {SALES_ALIASES.map(a => <option key={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Nhân viên xử lý" required>
              <select className={SELECT} value={form.assignee} onChange={e => set('assignee', e.target.value)}>
                <option value="">-- Chọn --</option>
                {allStaff.map(s => <option key={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Trạng thái">
              <select className={SELECT} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* Content */}
          <Field label="Nội dung yêu cầu" required>
            <textarea
              className={INPUT + ' resize-none'}
              rows={3}
              placeholder="Mô tả chi tiết yêu cầu từ khách hàng..."
              value={form.content}
              onChange={e => set('content', e.target.value)}
            />
          </Field>

          {/* Hashtag section */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Thông tin kỹ thuật (hashtag)</p>

            {/* Category */}
            <div className="flex gap-3 items-center">
              <span className="text-xs text-gray-500 w-16 flex-shrink-0">Danh mục:</span>
              <div className="flex gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('category', c)}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition ${
                      form.category === c
                        ? 'bg-teal-100 text-teal-700 border-teal-400'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    #{c}
                  </button>
                ))}
              </div>
            </div>

            <ChipSelect
              label="Thiết bị (chọn nhiều)"
              options={DEVICE_OPTIONS}
              selected={form.devices}
              onToggle={v => toggleChip('devices', v)}
              color="blue"
            />

            <ChipSelect
              label="Loại lỗi (chọn nhiều)"
              options={ERROR_OPTIONS}
              selected={form.errors}
              onToggle={v => toggleChip('errors', v)}
              color="orange"
            />

            <div className="grid grid-cols-3 gap-3">
              <Field label="Flag">
                <select className={SELECT} value={form.flag} onChange={e => set('flag', e.target.value)}>
                  <option value="">-- Không có --</option>
                  {FLAGS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Biển số xe">
                <input className={INPUT} placeholder="VD: 50H-294.39" value={form.licensePlate} onChange={e => set('licensePlate', e.target.value)} />
              </Field>
              <Field label="Ghi chú thêm">
                <input className={INPUT} placeholder="Nội dung thêm vào hashtag..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Hashtag preview */}
          {preview && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-500 font-medium mb-1">Preview cột Reply (hashtag):</p>
              <p className="text-sm font-mono text-blue-800 break-all">{preview}</p>
            </div>
          )}

          {/* Optional fields */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 select-none">
              ▸ Thêm thông tin (SalesMan, di chuyển...)
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field label="SalesMan">
                <input className={INPUT} placeholder="Tên kinh doanh" value={form.salesMan} onChange={e => set('salesMan', e.target.value)} />
              </Field>
              <Field label="km">
                <input type="number" className={INPUT} placeholder="Km di chuyển" value={form.km} onChange={e => set('km', e.target.value)} />
              </Field>
              <Field label="Assistant">
                <input className={INPUT} placeholder="Tên trợ lý" value={form.assistant} onChange={e => set('assistant', e.target.value)} />
              </Field>
              <Field label="Điểm xuất phát">
                <input className={INPUT} placeholder="Địa điểm" value={form.startPoint} onChange={e => set('startPoint', e.target.value)} />
              </Field>
              <Field label="Điểm kết thúc">
                <input className={INPUT} placeholder="Địa điểm" value={form.endPoint} onChange={e => set('endPoint', e.target.value)} />
              </Field>
            </div>
          </details>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition font-medium flex items-center gap-2"
            >
              {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {submitting ? 'Đang ghi...' : 'Ghi lên Google Sheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
