import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input } from '../components/ui/FormField';
import { Badge } from '../components/ui/Badge';
import { api } from '../lib/api';
import { User, Lock, Mail, Phone, Building2, Shield, CheckCircle2, KeyRound } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  // Change password state
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.success) {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(res.error || 'Failed to change password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = (user as any)?.user_metadata?.full_name || (user as any)?.tenant?.name || user?.email?.split('@')[0] || 'User';
  const phone = (user as any)?.tenant?.phone || (user as any)?.user_metadata?.phone || 'Not provided';
  const pgName = user?.pgName || (user as any)?.tenant?.pg?.name || 'Sagar PG';

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          My Profile
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Manage your account information and security settings.
        </p>
      </div>

      <div style={gridStyle}>
        {/* Account Info Card */}
        <Card padding="lg">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={avatarStyle}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {displayName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <Badge variant={user?.role === 'admin' ? 'info' : 'success'}>
                  <Shield size={12} style={{ marginRight: '4px' }} />
                  {user?.role === 'admin' ? 'PG Owner / Admin' : 'Tenant'}
                </Badge>
              </div>
            </div>
          </div>

          <div style={infoListStyle}>
            <div style={infoItemStyle}>
              <div style={infoIconStyle}><Mail size={16} /></div>
              <div>
                <div style={infoLabelStyle}>Email Address</div>
                <div style={infoValueStyle}>{user?.email}</div>
              </div>
            </div>

            <div style={infoItemStyle}>
              <div style={infoIconStyle}><Phone size={16} /></div>
              <div>
                <div style={infoLabelStyle}>Phone Number</div>
                <div style={infoValueStyle}>{phone}</div>
              </div>
            </div>

            <div style={infoItemStyle}>
              <div style={infoIconStyle}><Building2 size={16} /></div>
              <div>
                <div style={infoLabelStyle}>Property / PG</div>
                <div style={infoValueStyle}>{pgName}</div>
              </div>
            </div>

            <div style={infoItemStyle}>
              <div style={infoIconStyle}><User size={16} /></div>
              <div>
                <div style={infoLabelStyle}>Account Role</div>
                <div style={{ ...infoValueStyle, textTransform: 'capitalize' }}>{user?.role}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Change Password Card */}
        <Card padding="lg">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ ...infoIconStyle, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              <KeyRound size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Change Password
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                Enter your current password and choose a new one.
              </p>
            </div>
          </div>

          {error && <div style={errorBannerStyle}>{error}</div>}

          {success && (
            <div style={successBannerStyle}>
              <CheckCircle2 size={16} /> Password changed successfully!
            </div>
          )}

          <form onSubmit={handleChangePassword} style={{ marginTop: '16px' }}>
            <FormField label="Current Password" required>
              <Input
                type="password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </FormField>

            <FormField label="New Password" required>
              <Input
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </FormField>

            <FormField label="Confirm New Password" required>
              <Input
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </FormField>

            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
              style={{ marginTop: '12px' }}
            >
              <Lock size={16} style={{ marginRight: '6px' }} /> Update Password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: '24px',
  maxWidth: '1000px',
  margin: '0 auto',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: '24px',
  alignItems: 'start',
};

const avatarStyle: React.CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  backgroundColor: 'var(--color-primary)',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  fontWeight: 700,
  flexShrink: 0,
};

const infoListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const infoItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const infoIconStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-secondary)',
  flexShrink: 0,
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
  fontWeight: 500,
};

const infoValueStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  fontWeight: 600,
  marginTop: '1px',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-danger-light)',
  color: 'var(--color-danger)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
  marginTop: '12px',
};

const successBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-success-light)',
  color: 'var(--color-success)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
  marginTop: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};
