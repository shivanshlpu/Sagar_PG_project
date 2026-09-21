import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Menu,
  X,
  DoorOpen,
  Banknote,
  Zap,
  Megaphone,
  Package,
  BarChart3,
  Settings,
  LogOut,
  User,
  Bot,
  MessageSquareWarning,
  Wifi,
  Bell,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { AIAssistantModal } from '../ai/AIAssistantModal';

export function MobileNav() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [showMore, setShowMore] = React.useState(false);
  const [isAIOpen, setIsAIOpen] = React.useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  const moreItems = isAdmin
    ? [
        { to: '/admin/rooms', icon: DoorOpen, label: t('nav.rooms', 'Rooms & Beds') },
        { to: '/admin/rent', icon: Banknote, label: t('nav.rent', 'Rent Tracking') },
        { to: '/admin/electricity', icon: Zap, label: t('nav.electricity', 'Electricity Bills') },
        { to: '/admin/announcements', icon: Megaphone, label: t('nav.announcements', 'Announcements') },
        { to: '/admin/assets', icon: Package, label: t('nav.assets', 'Assets') },
        { to: '/admin/reports', icon: BarChart3, label: t('nav.reports', 'Reports & Audit') },
        { to: '/admin/settings', icon: Settings, label: t('nav.settings', 'PG Settings') },
      ]
    : [
        { to: '/tenant/notifications', icon: Bell, label: t('nav.notifications', 'Notifications') },
        { to: '/profile', icon: User, label: t('profile', 'My Profile') },
      ];

  return (
    <>
      {/* Slide-up "More" Drawer */}
      {isAdmin && showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderTopLeftRadius: 'var(--radius-xl)',
              borderTopRightRadius: 'var(--radius-xl)',
              padding: '20px 20px 80px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-xl)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {isAdmin ? 'More Options' : 'More Features'}
              </span>
              <button
                onClick={() => setShowMore(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {moreItems.map((item) => (
                <button
                  key={item.to}
                  onClick={() => {
                    navigate(item.to);
                    setShowMore(false);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px 8px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface-alt)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <item.icon size={22} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 500, textAlign: 'center' }}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  navigate('/profile');
                  setShowMore(false);
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}
              >
                <User size={16} /> Profile
              </button>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-danger-light)',
                  backgroundColor: 'var(--color-danger-light)',
                  color: 'var(--color-danger)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 500,
                }}
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Navigation Bar */}
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
          /* ADMIN NAVIGATION BAR */
          <>
            <NavLink
              to="/admin"
              end
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 600 : 500,
                flex: 1,
                height: '100%',
                transition: 'color 150ms ease',
              })}
            >
              <LayoutDashboard size={20} />
              <span>{t('nav.home', 'Home')}</span>
            </NavLink>

            <NavLink
              to="/admin/tenants"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 600 : 500,
                flex: 1,
                height: '100%',
                transition: 'color 150ms ease',
              })}
            >
              <Users size={20} />
              <span>{t('nav.tenants', 'Tenants')}</span>
            </NavLink>

            {/* Central PG AI Button - ADMIN ONLY */}
            <button
              onClick={() => setIsAIOpen(true)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                flex: 1,
                height: '100%',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(15, 118, 110, 0.35)',
                  marginTop: '-12px',
                }}
              >
                <Bot size={20} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-primary)' }}>
                PG AI
              </span>
            </button>

            <NavLink
              to="/admin/payments"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 600 : 500,
                flex: 1,
                height: '100%',
                transition: 'color 150ms ease',
              })}
            >
              <CreditCard size={20} />
              <span>{t('nav.payments', 'Payments')}</span>
            </NavLink>
          </>
        ) : (
          /* TENANT NAVIGATION BAR - ALL 5 OPTIONS DIRECTLY, NO MORE BUTTON */
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

        {/* More Button (Admin Only) */}
        {isAdmin && (
          <button
            onClick={() => setShowMore(!showMore)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: showMore ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '10px',
              fontWeight: showMore ? 600 : 500,
              flex: 1,
              height: '100%',
              cursor: 'pointer',
            }}
          >
            <Menu size={20} />
            <span>{t('nav.more', 'More')}</span>
          </button>
        )}
      </nav>

      {/* AI Assistant Modal - ADMIN ONLY */}
      {isAdmin && <AIAssistantModal isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />}
    </>
  );
}
