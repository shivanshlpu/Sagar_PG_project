import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select } from '../components/ui/FormField';

const registerSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'tenant']),
  phone: z.string().optional(),
  pg_name: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'admin',
      full_name: '',
      email: '',
      password: '',
      phone: '',
      pg_name: '',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: RegisterForm) => {
    try {
      setIsLoading(true);
      setError('');
      const result = await registerUser({
        email: data.email.trim(),
        password: data.password,
        role: data.role,
        full_name: data.full_name.trim(),
        phone: data.phone?.trim() || undefined,
        pg_name: data.role === 'admin' ? (data.pg_name?.trim() || undefined) : undefined,
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
            Create your account & property
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
              <FormField label="PG / Property Name" error={errors.pg_name?.message}>
                <Input
                  placeholder="e.g. Sunshine Living, Green Nest PG"
                  error={!!errors.pg_name}
                  {...register('pg_name')}
                />
              </FormField>
            )}

            <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '8px' }}>
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

const containerStyle: React.CSSProperties = { width: '100%', maxWidth: '400px' };

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-danger-light)',
  color: 'var(--color-danger)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
};
