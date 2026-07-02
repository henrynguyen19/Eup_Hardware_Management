'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

interface Guide {
  id: number
  title: string
  description: string | null
  device_model: string | null
  file_name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const EMPTY_FORM = { title: '', description: '', device_model: '', file_name: '', sort_order: 0, is_active: true }

export default function HuongDanLapDatPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'

  const [guides, setGuides] = useState<Guide[]>([])
  const [selected, setSelected] = useState<Guide | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoading, setIframeLoading] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  // Mobile: 'list' | 'viewer'
  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'viewer'>('list')

  // Modal state
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Guide | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load guides
  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/installation-guides${isAdmin ? '?all=1' : ''}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      const list: Guide[] = json.guides ?? []
      setGuides(list)
      // Auto-select first guide (only on first load) — sẽ gọi selectGuide sau khi state update
      if (list.length > 0) {
        setSelected(prev => {
          if (prev) return prev
          // Trigger pre-check sau khi set xong
          setTimeout(() => selectGuide(list[0]), 0)
          return list[0]
        })
      }
    } catch (e) {
      console.error('Failed to load guides:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function selectGuide(g: Guide) {
    setSelected(g)
    setIframeError(false)
    setIframeLoading(true)
    if (isMobile) setMobileView('viewer')
    // Pre-check: HEAD request để phát hiện 404 trước khi iframe load
    try {
      const res = await fetch(`/guides/${g.file_name}`, { method: 'HEAD' })
      if (!res.ok) {
        setIframeLoading(false)
        setIframeError(true)
      }
    } catch {
      setIframeLoading(false)
      setIframeError(true)
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setModal('add')
  }
  function openEdit(g: Guide) {
    setForm({ title: g.title, description: g.description ?? '', device_model: g.device_model ?? '', file_name: g.file_name, sort_order: g.sort_order, is_active: g.is_active })
    setEditingId(g.id)   // ← lưu đúng vào state
    setModal('edit')
  }

  async function saveForm() {
    setSaving(true)
    try {
      if (modal === 'add') {
        await fetch('/api/installation-guides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      } else {
        await fetch('/api/installation-guides', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...form }) })
      }
      setModal(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(g: Guide) {
    await fetch(`/api/installation-guides?id=${g.id}`, { method: 'DELETE' })
    setDeleteConfirm(null)
    if (selected?.id === g.id) setSelected(null)
    await load()
  }

  const guideUrl = selected ? `/guides/${selected.file_name}` : null

  // ── MODALS (dùng chung cho mobile + desktop) ─────────────────────
  function renderModals() {
    return (
      <>
        {modal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {modal === 'add' ? '➕ Thêm hướng dẫn mới' : '✏️ Chỉnh sửa hướng dẫn'}
                </h3>
                <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
              </div>
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={labelStyle}>
                  Tiêu đề <span style={{ color: '#ef4444' }}>*</span>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="VD: Hướng Dẫn Lắp Đặt Streamax H5 ADAS" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Model thiết bị
                  <input value={form.device_model} onChange={e => setForm(f => ({ ...f, device_model: e.target.value }))}
                    placeholder="VD: Streamax H5 + CA20S" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Tên file HTML <span style={{ color: '#ef4444' }}>*</span>
                  <input value={form.file_name} onChange={e => setForm(f => ({ ...f, file_name: e.target.value }))}
                    placeholder="VD: huong-dan-adas-h5.html" style={inputStyle} />
                  <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>File phải đặt vào <code>/public/guides/</code></span>
                </label>
                <label style={labelStyle}>
                  Mô tả ngắn
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3} placeholder="Mô tả nội dung hướng dẫn..."
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </label>
                <div style={{ display: 'flex', gap: 14 }}>
                  <label style={{ ...labelStyle, flex: 1 }}>
                    Thứ tự sắp xếp
                    <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: +e.target.value }))} style={inputStyle} />
                  </label>
                  <label style={{ ...labelStyle, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                      style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span>Hiển thị (active)</span>
                  </label>
                </div>
              </div>
              <div style={{ padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setModal(null)} style={btnSecStyle}>Hủy</button>
                <button onClick={saveForm} disabled={saving || !form.title || !form.file_name} style={btnPrimStyle}>
                  {saving ? '⏳ Đang lưu...' : (modal === 'add' ? '➕ Thêm mới' : '💾 Lưu')}
                </button>
              </div>
            </div>
          </div>
        )}
        {deleteConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🗑️</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Xác nhận xóa?</h3>
              <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 }}>
                Xóa hướng dẫn <strong>"{deleteConfirm.title}"</strong>?<br />Hành động này không thể hoàn tác.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => setDeleteConfirm(null)} style={btnSecStyle}>Hủy</button>
                <button onClick={() => doDelete(deleteConfirm)} style={{ ...btnPrimStyle, background: '#dc2626' }}>Xóa</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── MOBILE LAYOUT ───────────────────────────────────────────────
  if (isMobile) {
    if (mobileView === 'viewer' && selected) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#f3f4f6' }}>
          {/* Mobile viewer toolbar */}
          <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => setMobileView('list')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#374151', lineHeight: 1, padding: '0 4px' }}
            >←</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.title}
            </span>
            <a href={guideUrl!} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#1a56db', textDecoration: 'none', background: '#eff6ff', padding: '4px 8px', borderRadius: 6, fontWeight: 500, flexShrink: 0 }}>
              🔗 {vi ? 'Mở tab' : 'Open'}
            </a>
          </div>
          {/* iframe area */}
          <div style={{ flex: 1, position: 'relative' }}>
            {iframeLoading && !iframeError && (
              <div style={{ position: 'absolute', inset: 0, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13 }}>Đang tải...</div>
                </div>
              </div>
            )}
            {iframeError && (
              <div style={{ position: 'absolute', inset: 0, background: '#fef2f2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
                <div style={{ fontSize: 36 }}>⚠️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>File chưa có trên server</div>
                <code style={{ fontSize: 12, background: '#fee2e2', padding: '4px 8px', borderRadius: 4 }}>{selected.file_name}</code>
                <a href={guideUrl!} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '8px 16px', background: '#1a56db', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  🔗 Thử mở trực tiếp
                </a>
              </div>
            )}
            <iframe src={guideUrl!} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={selected.title}
              onLoad={() => { setIframeLoading(false); setIframeError(false) }}
              onError={() => { setIframeLoading(false); setIframeError(true) }}
            />
          </div>
        </div>
      )
    }

    // Mobile guide list
    return (
      <div style={{ background: '#f3f4f6', minHeight: 'calc(100vh - 56px)' }}>
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>🔧 {vi ? 'Hướng dẫn lắp đặt' : 'Installation Guides'}</span>
          {isAdmin && (
            <button onClick={openAdd} style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              + {vi ? 'Thêm' : 'Add'}
            </button>
          )}
        </div>
        {/* Guide cards */}
        <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Đang tải...</div>
          ) : guides.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
              {vi ? 'Chưa có hướng dẫn nào' : 'No guides yet'}
            </div>
          ) : guides.map(g => (
            <div key={g.id} onClick={() => selectGuide(g)}
              style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer', opacity: g.is_active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 28, lineHeight: 1.2, flexShrink: 0 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.4, marginBottom: 4 }}>
                    {g.title}
                    {!g.is_active && <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 4 }}>Ẩn</span>}
                  </div>
                  {g.device_model && (
                    <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{g.device_model}</span>
                  )}
                  {g.description && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>{g.description}</div>
                  )}
                </div>
                <span style={{ fontSize: 20, color: '#9ca3af', flexShrink: 0 }}>›</span>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(g)} style={{ flex: 1, padding: '6px 0', fontSize: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>✏️ Sửa</button>
                  <button onClick={() => setDeleteConfirm(g)} style={{ flex: 1, padding: '6px 0', fontSize: 12, background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', color: '#dc2626' }}>🗑️ Xóa</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Modals (reused from desktop) */}
        {renderModals()}
      </div>
    )
  }

  // ── DESKTOP LAYOUT ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: '#f3f4f6', minHeight: 500 }}>

      {/* ── LEFT SIDEBAR ── */}
      <div style={{
        width: sidebarOpen ? 300 : 48, flexShrink: 0,
        background: '#fff', borderRight: '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column', transition: 'width .2s', overflow: 'hidden'
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', lineHeight: 1, padding: 4 }}
            title={sidebarOpen ? 'Thu gọn' : 'Mở rộng'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          {sidebarOpen && (
            <>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827', flex: 1, whiteSpace: 'nowrap' }}>
                🔧 {vi ? 'Hướng dẫn lắp đặt' : 'Installation Guides'}
              </span>
              {isAdmin && (
                <button onClick={openAdd} style={{
                  background: '#1a56db', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'
                }}>+ {vi ? 'Thêm' : 'Add'}</button>
              )}
            </>
          )}
        </div>

        {/* Guide list */}
        {sidebarOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Đang tải...</div>
            ) : guides.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {vi ? 'Chưa có hướng dẫn nào' : 'No guides yet'}
                {isAdmin && <div style={{ marginTop: 8, fontSize: 12 }}>Nhấn + Thêm để thêm mới</div>}
              </div>
            ) : guides.map(g => (
              <div
                key={g.id}
                onClick={() => selectGuide(g)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: selected?.id === g.id ? '#eff6ff' : 'transparent',
                  borderLeft: `3px solid ${selected?.id === g.id ? '#1a56db' : 'transparent'}`,
                  transition: 'background .12s',
                  opacity: g.is_active ? 1 : 0.45
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 20, lineHeight: 1.3, flexShrink: 0 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4, marginBottom: 3 }}>
                      {g.title}
                      {!g.is_active && <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#991b1b', padding: '1px 5px',