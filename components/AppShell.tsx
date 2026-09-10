import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  header: ReactNode
  mobileNavigation: ReactNode
  floatingCart?: ReactNode
  children: ReactNode
}

export default function AppShell({ sidebar, header, mobileNavigation, floatingCart, children }: AppShellProps) {
  return (
    <div className="fl-app-shell">
      {sidebar}
      <div className="fl-app-frame">
        {header}
        <div className="fl-app-content">{children}</div>
      </div>
      {mobileNavigation}
      {floatingCart}
    </div>
  )
}
