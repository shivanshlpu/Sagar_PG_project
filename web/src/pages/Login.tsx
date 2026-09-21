import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input } from '../components/ui/FormField';

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setIsLoading(true);
      setError('');
      const result = await login(data.email, data.password);
      if (result.success) {
        const userRole = (result as any).user?.role;
        navigate(userRole === 'tenant' ? '/tenant' : '/admin');
      } else {
        setError(result.error || 'Invalid email or password');
      }
    } catch (err: any) {
      setError(err?.message || 'Login request failed. Please check your connection.');
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
            Sign in to your account
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div style={errorBannerStyle}>
                {error}
              </div>
            )}

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
                placeholder="Enter your password"
                error={!!errors.password}
                {...register('password')}
              />
            </FormField>

            <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '8px' }}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Register</Link>
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

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-danger-light)',
  color: 'var(--color-danger)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
  marginBottom: '16px',
};
