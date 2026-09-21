import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  DoorOpen,
  Users,
  Banknote,
  Zap,
  CreditCard,
  MessageSquareWarning,
  Megaphone,
  Package,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, key: 'nav.home', defaultLabel: 'Dashboard', end: true },
  { to: '/admin/rooms', icon: DoorOpen, key: 'nav.rooms', defaultLabel: 'Rooms' },
  { to: '/admin/tenants', icon: Users, key: 'nav.tenants', defaultLabel: 'Tenants' },
  { to: '/admin/rent', icon: Banknote, key: 'nav.rent', defaultLabel: 'Rent' },
  { to: '/admin/electricity', icon: Zap, key: 'nav.electricity', defaultLabel: 'Electricity' },
  { to: '/admin/payments', icon: CreditCard, key: 'nav.payments', defaultLabel: 'Payments' },
  { to: '/admin/complaints', icon: MessageSquareWarning, key: 'nav.complaints', defaultLabel: 'Complaints' },
  { to: '/admin/announcements', icon: Megaphone, key: 'nav.announcements', defaultLabel: 'Announcements' },
  { to: '/admin/assets', icon: Package, key: 'nav.assets', defaultLabel: 'Assets' },
  { to: '/admin/reports', icon: BarChart3, key: 'nav.reports', defaultLabel: 'Reports' },
  { to: '/admin/settings', icon: Settings, key: 'nav.settings', defaultLabel: 'Settings' },
];

export function Sidebar() {
  const { user, pg } = useAuth();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = React.useState(false);
  const location = useLocation();

  return (
    <aside
      style={{
        width: collapsed ? '64px' : '240px',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo/Brand */}
      <div style={{
        padding: collapsed ? '16px 12px' : '16px 20px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        minHeight: '56px',
      }}>
        {!collapsed && (
          <span style={{
            fontSize: 'var(--font-size-md)',
            fontWeight: 700,
            color: 'var(--color-primary)',
            letterSpacing: '-0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '160px',
          }} title={user?.pgName || pg?.name || 'Sagar PG'}>
            {user?.pgName || pg?.name || 'Sagar PG'}
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--color-text-muted)',
            display: 'flex',
            borderRadius: 'var(--radius-sm)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map((item) => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-primary-light)' : 'transparent',
                transition: 'all 150ms ease',
              }}
              title={collapsed ? t(item.key, item.defaultLabel) : undefined}
            >
              <item.icon size={20} />
              {!collapsed && <span>{t(item.key, item.defaultLabel)}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
