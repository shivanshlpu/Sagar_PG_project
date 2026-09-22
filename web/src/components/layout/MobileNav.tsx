import { NavLink } from 'react-router-dom';
import {
  CreditCard,
  Zap,
  Settings,
  Menu,
  LayoutDashboard,
  MessageSquareWarning,
  Wifi,
  Megaphone,
  Bell,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';

export function MobileNav() {
  const { user } = useAuth();
  const { t } = useLanguage();

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        backgroundColor: 'var(--color-bg-surface)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 997,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
      }}
    >
      {isAdmin ? (
        /* ADMIN BOTTOM BAR: Exactly Payments, Electricity, Settings, and Sidebar Menu button */
        <>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-sidebar'))}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              flex: 1,
              height: '100%',
              cursor: 'pointer',
              transition: 'color 150ms ease',
            }}
            aria-label="Open sidebar menu"
          >
            <Menu size={20} />
            <span>Menu</span>
          </button>

          <NavLink
            to="/admin/payments"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
            })}
          >
            <CreditCard size={20} />
            <span>{t('nav.payments', 'Payments')}</span>
          </NavLink>

          <NavLink
            to="/admin/electricity"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
            })}
          >
            <Zap size={20} />
            <span>{t('nav.electricity', 'Electricity')}</span>
          </NavLink>

          <NavLink
            to="/admin/settings"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
            })}
          >
            <Settings size={20} />
            <span>{t('nav.settings', 'Settings')}</span>
          </NavLink>
        </>
      ) : (
        /* TENANT NAVIGATION BAR - 5 direct buttons */
        <>
          <NavLink
            to="/tenant"
            end
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
              whiteSpace: 'nowrap',
            })}
          >
            <LayoutDashboard size={20} />
            <span>{t('nav.home', 'Home')}</span>
          </NavLink>

          <NavLink
            to="/tenant/complaints"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
              whiteSpace: 'nowrap',
            })}
          >
            <MessageSquareWarning size={20} />
            <span>{t('nav.complaints', 'Complaints')}</span>
          </NavLink>

          <NavLink
            to="/tenant/wifi"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
              whiteSpace: 'nowrap',
            })}
          >
            <Wifi size={20} />
            <span>{t('nav.wifi_short', 'Wi-Fi')}</span>
          </NavLink>

          <NavLink
            to="/tenant/announcements"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
              whiteSpace: 'nowrap',
            })}
          >
            <Megaphone size={20} />
            <span>{t('nav.notices', 'Notices')}</span>
          </NavLink>

          <NavLink
            to="/tenant/notifications"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              flex: 1,
              height: '100%',
              transition: 'color 150ms ease',
              whiteSpace: 'nowrap',
            })}
          >
            <Bell size={20} />
            <span>{t('nav.alerts', 'Alerts')}</span>
          </NavLink>
        </>
      )}
    </nav>
  );
}
