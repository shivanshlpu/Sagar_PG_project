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

  const adminDrawerItems = [
    { to: '/admin', icon: LayoutDashboard, label: t('nav.home', 'Home'), end: true },
    { to: '/admin/tenants', icon: Users, label: t('nav.tenants', 'Tenants') },
    { to: '/admin/rooms', icon: DoorOpen, label: t('nav.rooms', 'Rooms & Beds') },
    { to: '/admin/rent', icon: Banknote, label: t('nav.rent', 'Rent') },
    { to: '/admin/payments', icon: CreditCard, label: t('nav.payments', 'Payments') },
    { to: '/admin/electricity', icon: Zap, label: t('nav.electricity', 'Electricity') },
    { to: '/admin/complaints', icon: MessageSquareWarning, label: t('nav.complaints', 'Complaints') },
    { to: '/admin/announcements', icon: Megaphone, label: t('nav.announcements', 'Notices') },
    { to: '/admin/assets', icon: Package, label: t('nav.assets', 'Assets') },
    { to: '/admin/reports', icon: BarChart3, label: t('nav.reports', 'Reports') },
    { to: '/admin/settings', icon: Settings, label: t('nav.settings', 'Settings') },
  ];


  return (
    <>
      {/* Slide-up "More Options / All Features" Drawer */}
      {isAdmin && showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
              padding: '16px 16px 88px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-xl)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            {/* Drag Handle */}
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--color-border)', margin: '0 auto 12px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  All Features & Modules
                </span>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                  Tap any option to navigate directly
                </p>
              </div>
              <button
                onClick={() => setShowMore(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px' }}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* 4-column compact grid for all features */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {adminDrawerItems.map((item) => (
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
                    gap: '6px',
                    padding: '10px 4px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface-alt)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <item.icon size={20} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: '10px', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                    {item.label}
                  </span>
                </button>
              ))}

              {/* PG AI Button in drawer */}
              <button
                onClick={() => {
                  setShowMore(false);
                  setIsAIOpen(true);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 4px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(15, 118, 110, 0.3)',
                  backgroundColor: 'rgba(15, 118, 110, 0.08)',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Bot size={20} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
                  PG AI
                </span>
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'flex', gap: '10px' }}>
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
                  gap: '6px',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                }}
              >
                <User size={15} /> Profile
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
                  gap: '6px',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-danger-light)',
                  backgroundColor: 'var(--color-danger-light)',
                  color: 'var(--color-danger)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                }}
              >
                <LogOut size={15} /> Logout
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
          justifyContent: isAdmin ? 'flex-start' : 'space-around',
          overflowX: isAdmin ? 'auto' : 'visible',
          WebkitOverflowScrolling: 'touch',
          padding: isAdmin ? '0 6px' : '0',
          gap: isAdmin ? '2px' : '0',
          zIndex: 997,
          boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
        }}
      >
        {isAdmin ? (
          /* ADMIN NAVIGATION BAR — HORIZONTALLY SCROLLABLE DOCK WITH ALL MODULES */
          <>
            <NavLink
              to="/admin"
              end
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <LayoutDashboard size={19} />
              <span>{t('nav.home', 'Home')}</span>
            </NavLink>

            <NavLink
              to="/admin/tenants"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <Users size={19} />
              <span>{t('nav.tenants', 'Tenants')}</span>
            </NavLink>

            <NavLink
              to="/admin/rooms"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <DoorOpen size={19} />
              <span>{t('nav.rooms', 'Rooms')}</span>
            </NavLink>

            <NavLink
              to="/admin/rent"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <Banknote size={19} />
              <span>{t('nav.rent', 'Rent')}</span>
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
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(15, 118, 110, 0.35)',
                  marginTop: '-8px',
                }}
              >
                <Bot size={18} />
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
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <CreditCard size={19} />
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
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <Zap size={19} />
              <span>{t('nav.electricity', 'Electricity')}</span>
            </NavLink>

            <NavLink
              to="/admin/complaints"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <MessageSquareWarning size={19} />
              <span>{t('nav.complaints', 'Complaints')}</span>
            </NavLink>

            <NavLink
              to="/admin/announcements"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <Megaphone size={19} />
              <span>{t('nav.announcements', 'Notices')}</span>
            </NavLink>

            <NavLink
              to="/admin/assets"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <Package size={19} />
              <span>{t('nav.assets', 'Assets')}</span>
            </NavLink>

            <NavLink
              to="/admin/reports"
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <BarChart3 size={19} />
              <span>{t('nav.reports', 'Reports')}</span>
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
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                minWidth: '58px',
                flexShrink: 0,
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
              })}
            >
              <Settings size={19} />
              <span>{t('nav.settings', 'Settings')}</span>
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
              gap: '3px',
              background: 'none',
              border: 'none',
              color: showMore ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '10px',
              fontWeight: showMore ? 700 : 500,
              minWidth: '58px',
              flexShrink: 0,
              height: '100%',
              padding: '0 4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Menu size={19} />
            <span>{t('nav.more', 'More')}</span>
          </button>
        )}
      </nav>

      {/* AI Assistant Modal - ADMIN ONLY */}
      {isAdmin && <AIAssistantModal isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />}
    </>
  );
}
