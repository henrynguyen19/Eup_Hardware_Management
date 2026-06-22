import SidebarNav from './SidebarNav'

interface Props {
  userEmail: string
  permissions: string[]
  children: React.ReactNode
}

export default function AppShell({ userEmail, permissions, children }: Props) {
  const isAdmin       = permissions.includes('admin:users')
  const canHoTro      = permissions.includes('ho_tro:read') || isAdmin
  const canChatLuong  = permissions.includes('chat_luong:read') || isAdmin

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SidebarNav
        userEmail={userEmail}
        isAdmin={isAdmin}
        canHoTro={canHoTro}
        canChatLuong={canChatLuong}
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
