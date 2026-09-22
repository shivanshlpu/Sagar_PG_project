import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input } from '../components/ui/FormField';
import { api } from '../lib/api';
import { ArrowLeft, Mail, KeyRound, ShieldCheck, CheckCircle2 } from 'lucide-react';

type Step = 'email' | 'otp' | 'newPassword' | 'success';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>('email');
  const [email, setEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [maskedPhone, setMaskedPhone] = React.useState('');
  const [resetToken, setResetToken] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (res.success) {
        setMaskedPhone((res.data as any)?.maskedPhone || '');
        setStep('otp');
      } else {
        setError(res.error || 'Failed to send OTP');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await api('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
      if (res.success) {
        setResetToken((res.data as any)?.resetToken || '');
        setStep('newPassword');
      } else {
        setError(res.error || 'Invalid OTP');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword }),
      });
      if (res.success) {
        setStep('success');
      } else {
        setError(res.error || 'Failed to reset password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const stepConfig = {
    email: { icon: <Mail size={28} />, title: 'Forgot Password', subtitle: 'Enter your email to receive an OTP on WhatsApp' },
    otp: { icon: <ShieldCheck size={28} />, title: 'Verify OTP', subtitle: `OTP sent to WhatsApp (${maskedPhone})` },
    newPassword: { icon: <KeyRound size={28} />, title: 'New Password', subtitle: 'Create a strong new password' },
    success: { icon: <CheckCircle2 size={28} />, title: 'Password Reset!', subtitle: 'Your password has been changed successfully' },
  };

  const current = stepConfig[step];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Back button */}
        <Link to="/login" style={backLinkStyle}>
          <ArrowLeft size={16} /> Back to Login
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={iconCircleStyle}>{current.icon}</div>
          <h1 style={titleStyle}>{current.title}</h1>
          <p style={subtitleStyle}>{current.subtitle}</p>
        </div>

        {/* Progress dots */}
        <div style={progressStyle}>
          {(['email', 'otp', 'newPassword', 'success'] as Step[]).map((s, i) => (
            <div
              key={s}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor:
                  s === step ? 'var(--color-primary)' :
                  (['email', 'otp', 'newPassword', 'success'].indexOf(step) > i ? 'var(--color-success)' : 'var(--color-border)'),
                transition: 'background-color 0.3s',
              }}
            />
          ))}
        </div>

        <Card padding="lg">
          {error && <div style={errorBannerStyle}>{error}</div>}

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={handleRequestOtp}>
              <FormField label="Email" required>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>
              <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '8px' }}>
                Send OTP via WhatsApp
              </Button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp}>
              <FormField label="Enter 6-digit OTP" required>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: 700 }}
                  required
                />
              </FormField>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                Check your WhatsApp for the OTP. It expires in 5 minutes.
              </p>
              <Button type="submit" fullWidth isLoading={isLoading} disabled={otp.length !== 6}>
                Verify OTP
              </Button>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                style={textBtnStyle}
              >
                Didn't receive it? Try again
              </button>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === 'newPassword' && (
            <form onSubmit={handleResetPassword}>
              <FormField label="New Password" required>
                <Input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </FormField>
              <FormField label="Confirm Password" required>
                <Input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </FormField>
              <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '8px' }}>
                Reset Password
              </Button>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
                You can now log in with your new password.
              </p>
              <Button fullWidth onClick={() => navigate('/login')}>
                Go to Login
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Styles ──
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-bg-base)',
  padding: '24px',
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-size-sm)',
  textDecoration: 'none',
  marginBottom: '20px',
};

const iconCircleStyle: React.CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  margin: '0 auto 12px',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xl)',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  marginBottom: '4px',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-size-sm)',
};

const progressStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '8px',
  marginBottom: '20px',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-danger-light)',
  color: 'var(--color-danger)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
};

const textBtnStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  marginTop: '12px',
  background: 'none',
  border: 'none',
  color: 'var(--color-primary)',
  fontSize: 'var(--font-size-sm)',
  cursor: 'pointer',
  padding: '8px',
};
