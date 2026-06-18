'use client'

import { useEffect, useState } from 'react'

interface FeatureRow {
  feature_key: string
  value: string
  notes: string | null
}

// Nhãn tiếng Việt cho từng feature_key
const FEATURE_LABELS: Record<string, { label: string; icon: string }> = {
  qcvn06:            { label: 'QCVN 06:2024/BCA',              icon: '📋' },
  qcvn31:            { label: 'QCVN 31:2014/BGTVT',            icon: '📋' },
  nd10:              { label: 'Nghị Định 10/2020',              icon: '📋' },
  rfid:              { label: 'Quẹt thẻ lái xe (RFID)',         icon: '💳' },
  rfid_auto_logout:  { label: 'Tự động đăng xuất RFID',        icon: '🔐' },
  speed_alert:       { label: 'Cảnh báo quá tốc độ',           icon: '⚡' },
  cam_max:           { label: 'Số camera tối đa',               icon: '📷' },
  fuel_sensor:       { label: 'Cảm biến dầu',                  icon: '⛽' },
  fuel_sensor_dual:  { label: 'Cảm biến dầu đôi',              icon: '⛽' },
  temp_sensor:       { label: 'Cảm biến nhiệt độ',             icon: '🌡️' },
  concrete_sensor:   { label: 'Cảm biến bê tông',              icon: '🏗️' },
  collision_sensor:  { label: 'Cảm biến va chạm',              icon: '💥' },
  trailer_etag:      { label: 'Cảm biến rơmooc etag',          icon: '🔗' },
  sos:               { label: 'Nút SOS',                        icon: '🆘' },
  telematics_l1:     { label: 'Telematics Level 1',             icon: '📊' },
  telematics_l2:     { label: 'Telematics Level 2 (DMS/ADAS)', icon: '🤖' },
  dms:               { label: 'DMS (Giám sát người lái)',       icon: '👁️' },
  adas:              { label: 'ADAS (Hỗ trợ lái nâng cao)',    icon: '🚗' },
  low_power:         { label: 'Tiết kiệm điện',                icon: '🔋' },
  smartbox_required: { label: 'Yêu cầu SmartBox',              icon: '📦' },
}

const VALUE_OPTIONS = [
  { value: '✔',       label: '✔ Hỗ trợ'  },
  { value: '✗',       label: '✗ Không'    },
  { value: 'optional',label: '~ Tuỳ chọn' },
  { value: '0',       label: '📷 0 camera' },
  { value: '2',       label: '📷 Tối đa 2' },
  { value: '4',       label: '📷 Tối đa 4' },
]

const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Tiêu chuẩn pháp lý',  keys: ['qcvn06','qcvn31','nd10'] },
  { label: 'RFID & Tốc độ',        keys: ['rfid','rfid_auto_logout','speed_alert','sos'] },
  { label: 'Camera & Cảm biến',    keys: ['cam_max','fuel_sensor','fuel_sensor_dual','temp_sensor','concrete_sensor','collision_sensor','trailer_etag'] },
  { label: 'Telematics / AI',       keys: ['telematics_l1','telematics_l2','dms','adas'] },
  { label: 'Khác',                  keys: ['low_power','smartbox_required'] },
]

function valueDisplay(val: string) {
  if (val === '✔') return { label: '✔ Hỗ trợ',    cls: 'bg-green-100 text-green-700' }
  if (val === '✗') return { label: '✗ Không',      cls: 'bg-gray-100 text-gray-400' }
  if (val === 'optional') return { label: '~ Tuỳ chọn', cls: 'bg-amber-100 text-amber-700' }
  if (!isNaN(Number(val))) {
    const n = Number(val)
    if (n === 0) return { label: '✗ Không', cls: 'bg-gray-100 text-gray-400' }
    return { label: `📷 Tối đa ${val}`, cls: 'bg-blue-100 text-blue-700' }
  }
  return { label: val, cls: 'bg-gray-100 text-gray-600' }
}

interface EditState {
  feature_key: string
  value: string
  notes: string
  isNew?: boolean
}

interface Props {
  equipmentId: string
  canWrite: boolean
}

export default function DeviceFeaturesTab({ equipmentId, canWrite }: Props) {
  const [features, setFeatures] = useState<FeatureRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<EditState | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRow, setNewRow] = useState<{ feature_key: string; value: string; notes: string }>({
    feature_key: '', value: '✔', notes: ''
  })

  const load = () => {
    setLoading(true)
    fetch(`/api/kho/equipment/${encodeURIComponent(equipmentId)}/features`)
      .then(r => r.json())
      .then(d => setFeatures(d.features ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [equipmentId])

  async function upsert(key: string, value: string, notes: string) {
    setSaving(true); setError(null)
    const res = await fetch(`/api/kho/equipment/${encodeURIComponent(equipmentId)}/features`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key, value, notes: notes || null }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error); return false }
    return true
  }

  async function del(key: string) {
    if (!confirm(`Xoá tính năng "${key}"?`)) return
    setSaving(true); setError(null)
    const res = await fetch(`/api/kho/equipment/${encodeURIComponent(equipmentId)}/features`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error); return }
    load()
  }

  async function saveEdit() {
    if (!editing) return
    const ok = await upsert(editing.feature_key, editing.value, editing.notes)
    if (ok) { setEditing(null); load() }
  }

  async function saveNew() {
    if (!newRow.feature_key.trim()) { setError('Cần nhập feature_key'); return }
    const ok = await upsert(newRow.feature_key.trim(), newRow.value, newRow.notes)
    if (ok) {
      setShowAddForm(false)
      setNewRow({ feature_key: '', value: '✔', notes: '' })
      load()
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
      Đang tải tính năng...
    </div>
  )

  const featureMap = Object.fromEntries(features.map(f => [f.feature_key, f]))
  const shownKeys  = new Set<string>()

  return (
    <div className="space-y-4 pb-4">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {GROUPS.map(group => {
        const rows = group.keys.map(k => featureMap[k]).filter(Boolean)
        if (rows.length === 0) return null
        rows.forEach(r => shownKeys.add(r.feature_key))

        return (
          <div key={group.label}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1.5">
              {group.label}
            </p>
            <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {rows.map(feat => {
                const meta = FEATURE_LABELS[feat.feature_key] ?? { label: feat.feature_key, icon: '•' }
                const isEditing = editing?.feature_key === feat.feature_key

                if (isEditing && canWrite) {
                  return (
                    <div key={feat.feature_key} className="bg-blue-50 px-3 py-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.icon}</span>
                        <span className="text-sm font-medium text-gray-700 flex-1">{meta.label}</span>
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={editing.value}
                          onChange={e => setEditing({ ...editing, value: e.target.value })}
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                        >
                          {VALUE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                          {!VALUE_OPTIONS.find(o => o.value === editing.value) && (
                            <option value={editing.value}>{editing.value}</option>
                          )}
                        </select>
                        <input
                          type="text"
                          placeholder="Ghi chú..."
                          value={editing.notes}
                          onChange={e => setEditing({ ...editing, notes: e.target.value })}
                          className="flex-[2] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
                        >
                          Huỷ
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving ? 'Đang lưu...' : 'Lưu'}
                        </button>
                      </div>
                    </div>
                  )
                }

                const disp = valueDisplay(feat.value)
                return (
                  <div key={feat.feature_key} className="flex items-center px-3 py-2 gap-2 group hover:bg-gray-50/80">
                    <span className="text-base w-6 flex-shrink-0">{meta.icon}</span>
                    <span className="text-sm text-gray-700 flex-1">{meta.label}</span>
                    <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ' + disp.cls}>
                      {disp.label}
                    </span>
                    {feat.notes && (
                      <span className="text-xs text-gray-400 max-w-[150px] truncate" title={feat.notes}>
                        {feat.notes}
                      </span>
                    )}
                    {canWrite && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                        <button
                          onClick={() => setEditing({ feature_key: feat.feature_key, value: feat.value, notes: feat.notes ?? '' })}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                          title="Sửa"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => del(feat.feature_key)}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"
                          title="Xoá"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Các key chưa thuộc nhóm */}
      {features.filter(f => !shownKeys.has(f.feature_key)).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1.5">Thông tin khác</p>
          <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {features.filter(f => !shownKeys.has(f.feature_key)).map(feat => {
              const disp = valueDisplay(feat.value)
              const isEditing = editing?.feature_key === feat.feature_key
              if (isEditing && canWrite) {
                return (
                  <div key={feat.feature_key} className="bg-blue-50 px-3 py-2.5 space-y-2">
                    <span className="text-xs font-mono text-gray-500">{feat.feature_key}</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editing.value}
                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                        placeholder="Giá trị"
                      />
                      <input
                        type="text"
                        placeholder="Ghi chú..."
                        value={editing.notes}
                        onChange={e => setEditing({ ...editing, notes: e.target.value })}
                        className="flex-[2] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg">Huỷ</button>
                      <button onClick={saveEdit} disabled={saving} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={feat.feature_key} className="flex items-center px-3 py-2 gap-2 group hover:bg-gray-50/80">
                  <span className="text-xs font-mono text-gray-400 flex-1">{feat.feature_key}</span>
                  <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-medium ' + disp.cls}>{disp.label}</span>
                  {feat.notes && <span className="text-xs text-gray-400 max-w-[150px] truncate">{feat.notes}</span>}
                  {canWrite && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <button onClick={() => setEditing({ feature_key: feat.feature_key, value: feat.value, notes: feat.notes ?? '' })} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600">✏️</button>
                      <button onClick={() => del(feat.feature_key)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500">🗑️</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Thêm mới */}
      {canWrite && (
        <div>
          {showAddForm ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700">Thêm tính năng mới</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="feature_key (vd: nd10, cam_max...)"
                  value={newRow.feature_key}
                  onChange={e => setNewRow({ ...newRow, feature_key: e.target.value })}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-mono"
                  list="known-keys"
                />
                <datalist id="known-keys">
                  {Object.keys(FEATURE_LABELS).map(k => <option key={k} value={k} />)}
                </datalist>
                <select
                  value={newRow.value}
                  onChange={e => setNewRow({ ...newRow, value: e.target.value })}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                >
                  {VALUE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Ghi chú (tuỳ chọn)..."
                value={newRow.notes}
                onChange={e => setNewRow({ ...newRow, notes: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAddForm(false); setError(null) }}
                  className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  onClick={saveNew}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : '+ Thêm'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowAddForm(true); setEditing(null) }}
              className="w-full text-xs py-2.5 border border-dashed border-gray-300 text-gray-500 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Thêm tính năng
            </button>
          )}
        </div>
      )}

      {features.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-6 text-gray-400 text-sm gap-2">
          <span className="text-3xl">⚙️</span>
          Chưa có dữ liệu tính năng.
        </div>
      )}
    </div>
  )
}
