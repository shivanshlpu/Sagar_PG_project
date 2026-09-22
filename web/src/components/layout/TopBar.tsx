import React from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { Bell, Search, LogOut, User, Bot, Languages, Moon, Sun, Settings, Download, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { AIAssistantModal } from '../ai/AIAssistantModal';

export function TopBar() {
  const { user, pg, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [isAIOpen, setIsAIOpen] = React.useState(false);
  const [isAppInstalled, setIsAppInstalled] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('pwa_installed') === 'true' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as any).standalone)
    );
  });

  React.useEffect(() => {
    const handleInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setIsAppInstalled(true);
    };
    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  return (
    <header className="topbar-header" style={headerStyle}>
      {/* Left: Upper Sidebar Option & Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexShrink: 1 }}>
        {/* Upper Sidebar Option (Mobile Menu / Sidebar Drawer Toggle) */}
        {user?.role === 'admin' && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-sidebar'))}
            className="mobile-menu-btn"
            style={{
              ...iconButtonStyle,
              width: '36px',
              height: '36px',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              flexShrink: 0,
            }}
            aria-label="Toggle sidebar menu"
            title="Open Sidebar"
          >
            <Menu size={20} />
          </button>
        )}

        <NavLink
          to={user?.role === 'admin' ? '/admin' : '/tenant'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            textDecoration: 'none',
            color: 'inherit',
          }}
          title={user?.role === 'admin' ? 'Admin Portal' : 'Tenant Portal'}
        >
          <span style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.2,
          }}>
            {user?.pgName || pg?.name || 'Sagar PG'}
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            fontWeight: 500,
            lineHeight: 1,
            marginTop: '2px',
          }}>
            {user?.role === 'admin' ? 'Admin Portal' : 'Tenant Portal'}
          </span>
        </NavLink>
      </div>

      {/* Center: Search (Desktop only) */}
      <div className="desktop-search-container" style={searchContainerStyle}>
        <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
        <input
          type="text"
          placeholder={t('search.placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* App Download / Install Prompt Button - hidden once installed */}
        {!isAppInstalled && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('show-pwa-install-prompt'))}
            style={{
              ...iconButtonStyle,
              width: '34px',
              height: '34px',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-primary-light)',
              border: '1px solid rgba(15, 118, 110, 0.2)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            title={language === 'hi' ? 'ऐप डाउनलोड करें' : 'Download App'}
            aria-label="Download App"
          >
            <Download size={17} />
          </button>
        )}

        {/* Language Switcher Toggle (Admin Only - Symbol Only) */}
        {user?.role === 'admin' && (
          <button
            onClick={toggleLanguage}
            style={{
              ...iconButtonStyle,
              width: '34px',
              height: '34px',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              color: 'var(--color-primary)',
            }}
            title={language === 'en' ? 'हिन्दी में बदलें (Switch to Hindi)' : 'Switch to English'}
            aria-label="Toggle Language"
          >
            <Languages size={17} />
          </button>
        )}

        {/* PG AI Quick Button (Desktop only - Admin only) */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setIsAIOpen(true)}
            className="desktop-ai-btn"
            style={{
              ...iconButtonStyle,
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              gap: '6px',
              padding: '6px 12px',
              fontWeight: 600,
              fontSize: 'var(--font-size-xs)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid rgba(15, 118, 110, 0.2)',
            }}
            title="Ask PG AI (PG सहायक)"
          >
            <Bot size={16} />
            <span>{t('ai.button')}</span>
          </button>
        )}

        {/* Notification Bell */}
        <button
          onClick={() => navigate(user?.role === 'admin' ? '/admin/notifications' : '/tenant/notifications')}
          style={{
            ...iconButtonStyle,
            width: '34px',
            height: '34px',
            justifyContent: 'center',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-surface-alt)',
          }}
          aria-label={t('notifications')}
        >
          <Bell size={18} />
        </button>

        {/* Profile Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="topbar-profile-btn"
            style={{
              ...iconButtonStyle,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <span
              className="desktop-user-email"
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-primary)',
                fontWeight: 500,
                maxWidth: '150px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.email}
            </span>
          </button>

          {showDropdown && (
            <div style={dropdownStyle}>
              <div style={dropdownHeaderStyle}>
                <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{user?.email}</p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize', marginTop: '2px' }}>
                  {user?.role} • {user?.pgName || pg?.name}
                </p>
              </div>

              {/* Theme toggle quick option */}
              <button
                onClick={toggleTheme}
                style={dropdownItemStyle}
              >
                {theme === 'dark' ? <Sun size={16} style={{ color: '#F59E0B' }} /> : <Moon size={16} />}
                <span>{theme === 'dark' ? (language === 'hi' ? 'लाइट मोड' : 'Light Mode') : (language === 'hi' ? 'डार्क मोड' : 'Dark Mode')}</span>
              </button>

              {user?.role === 'admin' && (
                <button
                  onClick={() => { navigate('/admin/settings?tab=appearance'); setShowDropdown(false); }}
                  style={dropdownItemStyle}
                >
                  <Settings size={16} /> {t('nav.settings')}
                </button>
              )}

              <button
                onClick={() => { navigate('/profile'); setShowDropdown(false); }}
                style={dropdownItemStyle}
              >
                <User size={16} /> {t('profile')}
              </button>
              <button
                onClick={() => { logout(); navigate('/login'); }}
                style={{ ...dropdownItemStyle, color: 'var(--color-danger)' }}
              >
                <LogOut size={16} /> {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant Modal - Admin only */}
      {user?.role === 'admin' && (
        <AIAssistantModal isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />
      )}
    </header>
  );
}

// -- Styles --

const headerStyle: React.CSSProperties = {
  height: '56px',
  backgroundColor: 'var(--color-bg-surface)',
  borderBottom: '1px solid var(--color-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 24px',
  position: 'sticky',
  top: 0,
  zIndex: 50,
};

const searchContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--color-bg-surface-alt)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 12px',
  width: '320px',
};

const searchInputStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  width: '100%',
  fontFamily: 'inherit',
};

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '8px',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-secondary)',
  display: 'flex',
  alignItems: 'center',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: '4px',
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-lg)',
  minWidth: '200px',
  zIndex: 100,
  overflow: 'hidden',
};

const dropdownHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border)',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  textAlign: 'left',
  fontFamily: 'inherit',
};
