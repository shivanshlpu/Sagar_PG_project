import { NavLink } from 'react-router-dom';
import {
  Home,
  DoorOpen,
  Banknote,
  Zap,
  MessageSquareWarning,
  LayoutDashboard,
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
        /* ADMIN BOTTOM BAR: Exactly the 6 requested items in exact order */
        <>
          <NavLink
            to="/admin"
            end
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '9.5px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              minWidth: 0,
              height: '100%',
              padding: '4px 2px',
              transition: 'color 150ms ease',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            })}
          >
            <Home size={19} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1.1 }}>Home</span>
          </NavLink>

          <NavLink
            to="/admin/rooms"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '9.5px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              minWidth: 0,
              height: '100%',
              padding: '4px 2px',
              transition: 'color 150ms ease',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            })}
          >
            <DoorOpen size={19} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1.1 }}>Room & Bed</span>
          </NavLink>

          <NavLink
            to="/admin/rent"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '9.5px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              minWidth: 0,
              height: '100%',
              padding: '4px 2px',
              transition: 'color 150ms ease',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            })}
          >
            <Banknote size={19} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1.1 }}>Rent Tracking</span>
          </NavLink>



          <NavLink
            to="/admin/electricity"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '9.5px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              minWidth: 0,
              height: '100%',
              padding: '4px 2px',
              transition: 'color 150ms ease',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            })}
          >
            <Zap size={19} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1.1 }}>Electricity Bills</span>
          </NavLink>

          <NavLink
            to="/admin/complaints"
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '9.5px',
              fontWeight: isActive ? 700 : 500,
              flex: 1,
              minWidth: 0,
              height: '100%',
              padding: '4px 2px',
              transition: 'color 150ms ease',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            })}
          >
            <MessageSquareWarning size={19} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1.1 }}>Complaints</span>
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
