import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  DoorOpen,
  Users,
  Banknote,
  Zap,
  MessageSquareWarning,
  Megaphone,
  Package,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Bot,
  User,
  LogOut,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { AIAssistantModal } from '../ai/AIAssistantModal';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, key: 'nav.home', defaultLabel: 'Dashboard', end: true },
  { to: '/admin/rooms', icon: DoorOpen, key: 'nav.rooms', defaultLabel: 'Rooms & Beds' },
  { to: '/admin/tenants', icon: Users, key: 'nav.tenants', defaultLabel: 'Tenants' },
  { to: '/admin/rent', icon: Banknote, key: 'nav.rent', defaultLabel: 'Rent Tracking' },
  { to: '/admin/electricity', icon: Zap, key: 'nav.electricity', defaultLabel: 'Electricity' },
  { to: '/admin/complaints', icon: MessageSquareWarning, key: 'nav.complaints', defaultLabel: 'Complaints' },
  { to: '/admin/announcements', icon: Megaphone, key: 'nav.announcements', defaultLabel: 'Announcements' },
  { to: '/admin/assets', icon: Package, key: 'nav.assets', defaultLabel: 'Assets' },
  { to: '/admin/reports', icon: BarChart3, key: 'nav.reports', defaultLabel: 'Reports' },
  { to: '/admin/settings', icon: Settings, key: 'nav.settings', defaultLabel: 'Settings' },
];

export function Sidebar() {
  const { user, pg, logout } = useAuth();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isAIOpen, setIsAIOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Listen to mobile toggle events
  React.useEffect(() => {
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    const handleOpen = () => setIsMobileOpen(true);
    const handleClose = () => setIsMobileOpen(false);

    window.addEventListener('toggle-mobile-sidebar', handleToggle);
    window.addEventListener('open-mobile-sidebar', handleOpen);
    window.addEventListener('close-mobile-sidebar', handleClose);

    return () => {
      window.removeEventListener('toggle-mobile-sidebar', handleToggle);
      window.removeEventListener('open-mobile-sidebar', handleOpen);
      window.removeEventListener('close-mobile-sidebar', handleClose);
    };
  }, []);

  // Close mobile sidebar on route change
  React.useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Desktop Sidebar (visible on screens >= 768px) */}
      <aside
        className="desktop-sidebar"
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
        <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
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

      {/* Mobile Slide-Over Drawer (for screens < 768px) */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 999,
            display: 'flex',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '280px',
              maxWidth: '85vw',
              height: '100vh',
              backgroundColor: 'var(--color-bg-surface)',
              borderRight: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 18px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: '60px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--color-primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary)',
                }}>
                  <Building2 size={18} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--color-primary)',
                    letterSpacing: '-0.02em',
                  }}>
                    {user?.pgName || pg?.name || 'Sagar PG'}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                    Admin Panel
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  color: 'var(--color-text-muted)',
                }}
                aria-label="Close sidebar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav list with all items */}
            <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {navItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setIsMobileOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '11px 14px',
                      borderRadius: 'var(--radius-md)',
                      textDecoration: 'none',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      backgroundColor: isActive ? 'var(--color-primary-light)' : 'transparent',
                    }}
                  >
                    <item.icon size={19} />
                    <span>{t(item.key, item.defaultLabel)}</span>
                  </NavLink>
                );
              })}

              {/* PG AI Button in mobile sidebar */}
              <button
                onClick={() => {
                  setIsMobileOpen(false);
                  setIsAIOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  backgroundColor: 'rgba(15, 118, 110, 0.08)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginTop: '6px',
                }}
              >
                <Bot size={19} />
                <span>PG AI Assistant</span>
              </button>
            </nav>

            {/* Bottom: Profile & Logout */}
            <div style={{
              padding: '12px 14px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              gap: '8px',
            }}>
              <button
                onClick={() => {
                  setIsMobileOpen(false);
                  navigate('/profile');
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <User size={15} /> Profile
              </button>
              <button
                onClick={() => {
                  setIsMobileOpen(false);
                  logout();
                  navigate('/login');
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-danger-light)',
                  backgroundColor: 'var(--color-danger-light)',
                  color: 'var(--color-danger)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AIAssistantModal */}
      <AIAssistantModal isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />
    </>
  );
}
