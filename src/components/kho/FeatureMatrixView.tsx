'use client'

import React, { useEffect, useRef, useState } from 'react'

interface DeviceInfo { equipment_id: string; name: string; status: string; device_type: string }
interface CellVal { value: string; notes: string | null }
interface MatrixData {
  devices: DeviceInfo[]
  featureKeys: string[]
  matrix: Record<string, Record<string, CellVal>>
}
interface Props { isAdmin: boolean }

const STORAGE_KEY = 'kho_feature_order_v2'

function loadOrder(keys: string[]): string[] {
  try {
    const stored: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return [...stored.filter(k => keys.includes(k)), ...keys.filter(k => !stored.includes(k))]
  } catch { return keys }
}
function saveOrder(keys: string[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)) }

function renderValue(value: string) {
  const v = value.trim()
  const pos = ['co', 'yes', '1']
  const neg = ['khong', 'no', '0']
  if (v === '✔' || pos.includes(v.toLowerCase())) return (
    <span className="flex justify-center">
      <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold">✔</span>
    </span>
  )
  if (v === '✘' || neg.includes(v.toLowerCase())) return (
    <span className="flex justify-center"><span className="text-gray-300 text-base">&mdash;</span></span>
  )
  return (
    <span className="flex justify-center">
      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium leading-tight text-center max-w-[72px] break-words">{v}</span>
    </span>
  )
}

export default function FeatureMatrixView({ isAdmin }: Props) {
  const [data, setData]             = useState<MatrixData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [sortedKeys, setSortedKeys] = useState<string[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editVal, setEditVal]       = useState('')
  const [renaming, setRenaming]     = useState(false)
  const [renameErr, setRenameErr]   = useState<string | null>(null)
  const dragIdx = useRef<number | null>(null)
  const [dropIdx, setDropIdx]       = useState<number | null>(null)

  const loadData = () => {
    setLoading(true)
    fetch('/api/kho/features-matrix')
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); return }; setData(d); setSortedKeys(loadOrder(d.featureKeys)) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

  async function confirmRename(oldKey: string) {
    const newKey = editVal.trim()
    if (!newKey || newKey === oldKey) { setEditingKey(null); return }
    setRenaming(true); setRenameErr(null)
    try {
      const res = await fetch('/api/kho/features-matrix', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_key: oldKey, new_key: newKey }),
      })
      const json = await res.json()
      if (!res.ok) { setRenameErr(json.error ?? 'Loi'); return }
      setSortedKeys(prev => { const next = prev.map(k => k === oldKey ? newKey : k); saveOrder(next); return next })
      setEditingKey(null)
      loadData()
    } catch (e: unknown) { setRenameErr(e instanceof Error ? e.message : 'Loi mang') }
    finally { setRenaming(false) }
  }

  function handleDragStart(idx: number) { dragIdx.current = idx }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDropIdx(idx) }
  function handleDrop(targetIdx: number) {
    const src = dragIdx.current
    if (src === null || src === targetIdx) { dragIdx.current = null; setDropIdx(null); return }
    const next = [...sortedKeys]
    const [moved] = next.splice(src, 1)
    next.splice(targetIdx, 0, moved)
    setSortedKeys(next); saveOrder(next)
    dragIdx.current = null; setDropIdx(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Dang tai bang tinh nang...
    </div>
  )
  if (error) return <div className="text-red-500 text-sm bg-red-50 rounded-xl p-4 m-4">{error}</div>
  if (!data || data.devices.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <span className="text-4xl">⚙️</span>
      Chua co du lieu tinh nang.
    </div>
  )

  const devices = data.devices

  return (
    <div className="overflow-x-auto">
      {renameErr && (
        <div className="mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{renameErr}</div>
      )}
      <table className="w-full text-xs border-collapse" style={{ minWidth: `${220 + devices.length * 100}px` }}>
        <thead>
          <tr className="border-b-2 border-gray-200 bg-gray-50">
            {isAdmin && <th className="w-7 border-r border-gray-100" />}
            <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10 border-r border-gray-200" style={{ width: 200, minWidth: 160 }}>
              Tinh nang
            </th>
            {devices.map(dev => (
              <th key={dev.equipment_id} className="text-center px-3 py-3 font-semibold text-gray-800 border-l border-gray-100" style={{ minWidth: 88 }}>
                <div className="flex flex-col items-center gap-1">
                  <span>{dev.name}</span>
                  <span className={'text-[10px] font-normal px-2 py-0.5 rounded-full ' + (dev.status === 'Hien hanh' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')}>
                    {dev.status}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedKeys.map((key, idx) => {
            const isDragging = dragIdx.current === idx
            const isDropTarget = dropIdx === idx && dragIdx.current !== idx
            const isEditing = editingKey === key
            return (
              <tr
                key={key}
                draggable={isAdmin}
                onDragStart={() => isAdmin && handleDragStart(idx)}
                onDragOver={e => isAdmin && handleDragOver(e, idx)}
                onDrop={() => isAdmin && handleDrop(idx)}
                onDragEnd={() => { dragIdx.current = null; setDropIdx(null) }}
                className={
                  'border-b border-gray-100 transition-colors group ' +
                  (isDragging ? 'opacity-40 ' : '') +
                  (isDropTarget ? 'bg-violet-50 border-violet-300 ' : (idx % 2 === 0 ? 'bg-white ' : 'bg-gray-50/50 ')) +
                  (isAdmin ? 'cursor-grab' : '')
                }
              >
                {isAdmin && (
                  <td className="text-center w-7 border-r border-gray-100 text-gray-300 group-hover:text-gray-400 select-none" title="Keo sap xep">
                    &#8942;
                  </td>
                )}
                <td className="px-4 py-2.5 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                  {isAdmin && isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmRename(key); if (e.key === 'Escape') setEditingKey(null) }}
                        className="flex-1 border border-violet-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                        style={{ minWidth: 100 }}
                      />
                      <button onClick={() => confirmRename(key)} disabled={renaming} className="text-green-600 hover:text-green-700 font-bold text-sm px-1 disabled:opacity-40" title="Luu">✔</button>
                      <button onClick={() => setEditingKey(null)} className="text-gray-400 hover:text-gray-600 text-sm px-1" title="Huy">×</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 font-medium leading-snug">{key}</span>
                      {isAdmin && (
                        <button
                          onClick={() => { setEditingKey(key); setEditVal(key); setRenameErr(null) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-violet-600 text-[10px] px-1.5 py-0.5 rounded border border-transparent hover:border-violet-200 hover:bg-violet-50"
                          title="Sua ten tinh nang"
                        >✏️</button>
                      )}
                    </div>
                  )}
                </td>
                {devices.map(dev => {
                  const cell = data.matrix[dev.equipment_id]?.[key]
                  return (
                    <td key={dev.equipment_id} className="py-2.5 px-2 text-center border-l border-gray-100 align-middle" title={cell?.notes ?? undefined}>
                      {cell ? renderValue(cell.value) : <span className="text-gray-200 text-sm">&mdash;</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-100 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">✔</span>
          Co / Dat
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-300 text-base">&mdash;</span>
          Khong / N/A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">Gia tri</span>
          Thong so cu the
        </span>
        {isAdmin && <span className="ml-auto text-gray-300">Hover vao hang de sua ten · Keo de sap xep</span>}
      </div>
    </div>
  )
}
