import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiGet, apiPost } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input } from '../components/ui/FormField';
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

const joinSchema = z
  .object({
    full_name: z.string().min(2, 'Full name is required'),
    email: z.string().email('Valid email is required'),
    phone: z.string().min(10, 'Valid 10-digit phone number is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type JoinForm = z.infer<typeof joinSchema>;

export default function TenantJoin() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [pgInfo, setPgInfo] = React.useState<{ pgName: string; address?: string } | null>(null);
  const [isValidating, setIsValidating] = React.useState(true);
  const [inviteError, setInviteError] = React.useState('');
  const [submitError, setSubmitError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinForm>({
    resolver: zodResolver(joinSchema),
  });

  // Validate the invite code on load
  React.useEffect(() => {
    async function validateCode() {
      if (!code) {
        setInviteError('No invite code provided.');
        setIsValidating(false);
        return;
      }

      try {
        const res = await apiGet<{ pgName: string; address?: string }>(`/tenants/join-info/${code}`);
        if (res.success && res.data) {
          setPgInfo(res.data);
        } else {
          setInviteError(res.error || 'This invite link is invalid or has expired.');
        }
      } catch {
        setInviteError('Failed to verify invite link. Please check your connection.');
      } finally {
        setIsValidating(false);
      }
    }

    validateCode();
  }, [code]);

  const onSubmit = async (data: JoinForm) => {
    if (!code) return;

    try {
      setIsSubmitting(true);
      setSubmitError('');

      const res = await apiPost(`/tenants/join/${code}`, {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        password: data.password,
      });

      if (res.success) {
        setIsSuccess(true);
      } else {
        setSubmitError(res.error || 'Registration failed. Please try again.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Loading state */}
        {isValidating && (
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div className="skeleton" style={{ width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto 16px' }} />
              <div className="skeleton" style={{ width: '180px', height: '20px', margin: '0 auto 8px' }} />
              <div className="skeleton" style={{ width: '240px', height: '14px', margin: '0 auto' }} />
            </div>
          </Card>
        )}

        {/* Invalid / Expired invite */}
        {!isValidating && inviteError && (
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-danger-light)',
                  color: 'var(--color-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <AlertTriangle size={28} />
              </div>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: '8px' }}>
                Invalid Invite Link
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', marginBottom: '24px' }}>
                {inviteError}
              </p>
              <Button onClick={() => navigate('/login')} fullWidth>
                Back to Login
              </Button>
            </div>
          </Card>
        )}

        {/* Success state */}
        {!isValidating && !inviteError && isSuccess && (
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-success-light)',
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle2 size={28} />
              </div>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: '8px' }}>
                Registration Complete!
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', marginBottom: '24px' }}>
                Welcome to <strong>{pgInfo?.pgName}</strong>. Your account has been registered. You can now sign in to your tenant portal.
              </p>
              <Button onClick={() => navigate('/login')} fullWidth>
                Sign In to Tenant Portal
              </Button>
            </div>
          </Card>
        )}

        {/* Active registration form */}
        {!isValidating && !inviteError && !isSuccess && (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <img
                src="/app-logo.png"
                alt="PG Portal Logo"
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  objectFit: 'cover',
                  display: 'inline-block',
                  marginBottom: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  border: '1.5px solid rgba(255,255,255,0.8)',
                }}
              />
              <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                {pgInfo?.pgName || 'PG Portal'}
              </h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                You have been invited to register as a tenant
              </p>
            </div>

            <Card padding="lg">
              <form onSubmit={handleSubmit(onSubmit)}>
                {submitError && <div style={errorBannerStyle}>{submitError}</div>}

                <FormField label="Full Name" error={errors.full_name?.message} required>
                  <Input placeholder="Enter your full name" error={!!errors.full_name} {...register('full_name')} />
                </FormField>

                <FormField label="Email Address" error={errors.email?.message} required>
                  <Input type="email" placeholder="you@example.com" error={!!errors.email} {...register('email')} />
                </FormField>

                <FormField label="Phone Number" error={errors.phone?.message} required>
                  <Input type="tel" placeholder="10-digit mobile number" error={!!errors.phone} {...register('phone')} />
                </FormField>

                <FormField label="Create Password" error={errors.password?.message} required>
                  <Input type="password" placeholder="At least 8 characters" error={!!errors.password} {...register('password')} />
                </FormField>

                <FormField label="Confirm Password" error={errors.confirmPassword?.message} required>
                  <Input type="password" placeholder="Re-enter password" error={!!errors.confirmPassword} {...register('confirmPassword')} />
                </FormField>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    marginBottom: '16px',
                  }}
                >
                  <ShieldCheck size={14} style={{ color: 'var(--color-primary)' }} />
                  <span>Your password is encrypted with salted bcrypt security.</span>
                </div>

                <Button type="submit" fullWidth isLoading={isSubmitting}>
                  {isSubmitting ? 'Registering Account...' : 'Join PG'}
                </Button>
              </form>

              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Already registered?{' '}
                <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
                  Sign In
                </Link>
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-bg-base)',
  padding: '24px 16px',
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-danger-light)',
  color: 'var(--color-danger)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
};
