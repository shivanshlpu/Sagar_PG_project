import React from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, AlertCircle, Building2, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select } from '../components/ui/FormField';
import { apiGet } from '../lib/api';

interface PublicPG {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  address?: string | null;
}

const registerSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'tenant']),
  phone: z.string().optional(),
  pg_name: z.string().optional(),
  pg_code: z.string().optional(),
  pg_id: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === 'admin' && !data.pg_name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pg_name'],
      message: 'PG name is required for admin accounts',
    });
  }
  if (data.role === 'tenant' && !data.pg_code?.trim() && !data.pg_id?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pg_code'],
      message: 'PG Property Code is required for tenant accounts',
    });
  }
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // PG validation states for tenant
  const [pgList, setPgList] = React.useState<PublicPG[]>([]);
  const [selectedPg, setSelectedPg] = React.useState<PublicPG | null>(null);
  const [isVerifyingPg, setIsVerifyingPg] = React.useState(false);
  const [pgVerifyError, setPgVerifyError] = React.useState<string | null>(null);
  const [showBrowseList, setShowBrowseList] = React.useState(false);

  const initialPgCode = (searchParams.get('pg') || searchParams.get('code') || '').toUpperCase().trim();
  const initialRole = initialPgCode ? 'tenant' : 'admin';

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: initialRole,
      full_name: '',
      email: '',
      password: '',
      phone: '',
      pg_name: '',
      pg_code: initialPgCode,
      pg_id: '',
    },
  });

  const selectedRole = watch('role');
  const watchedPgCode = watch('pg_code');

  // Verify PG by code
  const verifyPgCode = React.useCallback(async (code: string) => {
    if (!code || code.trim().length < 2) {
      setSelectedPg(null);
      setPgVerifyError(null);
      return;
    }
    try {
      setIsVerifyingPg(true);
      setPgVerifyError(null);
      const res = await apiGet<PublicPG>(`/auth/pg-info/${encodeURIComponent(code.trim().toUpperCase())}`);
      if (res.success && res.data) {
        setSelectedPg(res.data);
        setValue('pg_id', res.data.id);
        setValue('pg_code', res.data.code);
        setPgVerifyError(null);
      } else {
        setSelectedPg(null);
        setValue('pg_id', '');
        setPgVerifyError(res.error || 'Property not found or inactive');
      }
    } catch {
      setSelectedPg(null);
      setValue('pg_id', '');
      setPgVerifyError('Could not verify property code');
    } finally {
      setIsVerifyingPg(false);
    }
  }, [setValue]);

  // Load public PGs list for optional dropdown selection
  React.useEffect(() => {
    if (selectedRole === 'tenant') {
      apiGet<PublicPG[]>('/auth/pgs').then(res => {
        if (res.success && Array.isArray(res.data)) {
          setPgList(res.data);
        }
      }).catch(() => {});
    }
  }, [selectedRole]);

  // If initial URL had pg code, verify immediately
  React.useEffect(() => {
    if (initialPgCode) {
      setValue('role', 'tenant');
      setValue('pg_code', initialPgCode);
      verifyPgCode(initialPgCode);
    }
  }, [initialPgCode, setValue, verifyPgCode]);

  // Debounced verification when typing pg_code
  React.useEffect(() => {
    if (selectedRole !== 'tenant') return;
    if (!watchedPgCode || watchedPgCode === selectedPg?.code) return;

    const timer = setTimeout(() => {
      verifyPgCode(watchedPgCode);
    }, 500);

    return () => clearTimeout(timer);
  }, [watchedPgCode, selectedRole, selectedPg?.code, verifyPgCode]);

  const onSubmit = async (data: RegisterForm) => {
    try {
      setIsLoading(true);
      setError('');

      if (data.role === 'tenant' && !selectedPg && !data.pg_code?.trim()) {
        setError('Please enter or select a valid PG property code.');
        setIsLoading(false);
        return;
      }

      const result = await registerUser({
        email: data.email.trim(),
        password: data.password,
        role: data.role,
        full_name: data.full_name.trim(),
        phone: data.phone?.trim() || undefined,
        pg_name: data.role === 'admin' ? (data.pg_name?.trim() || undefined) : undefined,
        pg_code: data.role === 'tenant' ? (data.pg_code?.trim().toUpperCase() || selectedPg?.code) : undefined,
        pg_id: data.role === 'tenant' ? (data.pg_id?.trim() || selectedPg?.id) : undefined,
      });

      if (result.success) {
        navigate(data.role === 'admin' ? '/admin' : '/tenant');
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            color: 'var(--color-primary)',
            marginBottom: '8px',
          }}>
            PG Manager
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
            {selectedRole === 'tenant' ? 'Join your PG as a Tenant' : 'Create your admin account & property'}
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div style={errorBannerStyle}>{error}</div>
            )}

            <FormField label="Full Name" error={errors.full_name?.message} required>
              <Input
                placeholder="Enter your full name"
                error={!!errors.full_name}
                {...register('full_name')}
              />
            </FormField>

            <FormField label="Email" error={errors.email?.message} required>
              <Input
                type="email"
                placeholder="you@example.com"
                error={!!errors.email}
                {...register('email')}
              />
            </FormField>

            <FormField label="Password" error={errors.password?.message} required>
              <Input
                type="password"
                placeholder="Minimum 8 characters"
                error={!!errors.password}
                {...register('password')}
              />
            </FormField>

            <FormField label="Phone" error={errors.phone?.message}>
              <Input
                type="tel"
                placeholder="Phone number"
                {...register('phone')}
              />
            </FormField>

            <FormField label="Account Type" error={errors.role?.message} required>
              <Select
                options={[
                  { value: 'admin', label: 'PG Admin / Owner' },
                  { value: 'tenant', label: 'Tenant' },
                ]}
                error={!!errors.role}
                {...register('role')}
              />
            </FormField>

            {selectedRole === 'admin' && (
              <FormField label="PG / Property Name" error={errors.pg_name?.message} required>
                <Input
                  placeholder="e.g. Sunshine Living, Sagar PG"
                  error={!!errors.pg_name}
                  {...register('pg_name')}
                />
              </FormField>
            )}

            {selectedRole === 'tenant' && (
              <div style={{ marginTop: '8px', marginBottom: '16px' }}>
                <FormField
                  label="PG Property Code"
                  error={errors.pg_code?.message}
                  required
                >
                  <div style={{ position: 'relative' }}>
                    <Input
                      placeholder="e.g. SAG-101"
                      style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                      error={!!errors.pg_code}
                      {...register('pg_code')}
                      onChange={(e) => {
                        setValue('pg_code', e.target.value.toUpperCase());
                      }}
                    />
                    {isVerifyingPg && (
                      <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                        <Loader2 size={16} className="animate-spin" color="var(--color-primary)" />
                      </div>
                    )}
                  </div>
                </FormField>

                {/* Verified Property Card */}
                {selectedPg && (
                  <div style={verifiedBadgeStyle}>
                    <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#065f46' }}>
                        {selectedPg.name} <span style={{ fontSize: '11px', background: '#d1fae5', padding: '2px 6px', borderRadius: '4px' }}>{selectedPg.code}</span>
                      </div>
                      {(selectedPg.city || selectedPg.address) && (
                        <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                          {[selectedPg.address, selectedPg.city].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Property verification error */}
                {pgVerifyError && !selectedPg && (
                  <div style={verifyErrorStyle}>
                    <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
                    <span>{pgVerifyError}. Ask your PG owner for their property code.</span>
                  </div>
                )}

                {/* Optional browse list */}
                {pgList.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowBrowseList(!showBrowseList)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Building2 size={14} />
                      {showBrowseList ? 'Hide available properties' : 'Or select from active properties'}
                    </button>

                    {showBrowseList && (
                      <div style={browseListContainerStyle}>
                        {pgList.map((pg) => (
                          <div
                            key={pg.id}
                            onClick={() => {
                              setSelectedPg(pg);
                              setValue('pg_code', pg.code);
                              setValue('pg_id', pg.id);
                              setPgVerifyError(null);
                              setShowBrowseList(false);
                            }}
                            style={{
                              ...browseItemStyle,
                              borderColor: selectedPg?.id === pg.id ? 'var(--color-primary)' : 'var(--color-border)',
                              backgroundColor: selectedPg?.id === pg.id ? '#eff6ff' : 'transparent',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '13px' }}>{pg.name}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                                ({pg.code})
                              </span>
                            </div>
                            {pg.city && (
                              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                {pg.city}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
              disabled={selectedRole === 'tenant' && !selectedPg && !watchedPgCode}
              style={{ marginTop: '8px' }}
            >
              Create Account
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Sign In</Link>
          </p>
        </Card>
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
  padding: '24px',
};

const containerStyle: React.CSSProperties = { width: '100%', maxWidth: '440px' };

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-danger-light)',
  color: 'var(--color-danger)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
};

const verifiedBadgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: '#f0fdf4',
  border: '1px solid #86efac',
  marginTop: '8px',
};

const verifyErrorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  fontSize: '12px',
  marginTop: '8px',
};

const browseListContainerStyle: React.CSSProperties = {
  marginTop: '8px',
  maxHeight: '160px',
  overflowY: 'auto',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '4px',
};

const browseItemStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid transparent',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.15s ease',
};
