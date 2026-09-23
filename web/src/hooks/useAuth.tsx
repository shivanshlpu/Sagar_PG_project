import React from 'react';
import { apiGet, apiPost, setTokens, clearTokens } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'tenant';
  pgId?: string;
  pgName?: string;
  tenantId?: string;
  tenant?: any;
}

export interface PGProfile {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  upi_id?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  account_holder_name?: string | null;
  rules?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  pg: PGProfile | null;
  pgName?: string;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  register: (data: {
    email: string;
    password: string;
    role: string;
    full_name: string;
    phone?: string;
    pg_name?: string;
    pg_code?: string;
    pg_id?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  refreshPG: () => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  pg: null,
  pgName: undefined,
  isLoading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  refreshPG: async () => {},
  logout: () => {},
});

export function useAuth() {
  return React.useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(() => {
    try {
      const cached = localStorage.getItem('pg_auth_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [pg, setPg] = React.useState<PGProfile | null>(() => {
    try {
      const cached = localStorage.getItem('pg_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = React.useState(() => {
    const hasTokens = typeof window !== 'undefined' && !!(localStorage.getItem('accessToken') || localStorage.getItem('refreshToken'));
    const cachedUser = typeof window !== 'undefined' ? localStorage.getItem('pg_auth_user') : null;
    if (cachedUser && hasTokens) return false;
    return hasTokens;
  });

  const fetchCurrentUser = React.useCallback(async () => {
    const access = localStorage.getItem('accessToken');
    const refresh = localStorage.getItem('refreshToken');
    if (!access && !refresh) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiGet<{
        id: string;
        email: string;
        role: 'admin' | 'tenant';
        pgId?: string;
        pgName?: string;
        tenant?: any;
        pg?: PGProfile;
      }>('/auth/me');

      if (res.success && res.data) {
        const authUserData: AuthUser = {
          id: res.data.id,
          email: res.data.email,
          role: res.data.role,
          pgId: res.data.pgId,
          pgName: res.data.pgName,
          tenantId: res.data.tenant?.id,
          tenant: res.data.tenant,
        };
        setUser(authUserData);
        localStorage.setItem('pg_auth_user', JSON.stringify(authUserData));

        if (res.data.pg) {
          setPg(res.data.pg);
          localStorage.setItem('pg_profile', JSON.stringify(res.data.pg));
        }
      } else if (
        res.error === 'Invalid or expired refresh token' ||
        res.error === 'User not found' ||
        res.error === 'Invalid token'
      ) {
        // Only clear tokens if the backend explicitly rejected the credentials
        clearTokens();
        setUser(null);
        setPg(null);
      }
    } catch (e) {
      // Network error or server cold-starting: DO NOT log the user out!
      console.warn('[useAuth] Background auth check deferred:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const refreshPG = async () => {
    const res = await apiGet<PGProfile>('/pg');
    if (res.success && res.data) {
      setPg(res.data);
      if (user) {
        setUser({ ...user, pgName: res.data.name });
      }
    }
  };

  const login = async (email: string, password: string) => {
    const res = await apiPost<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>('/auth/login', { email, password });
    if (res.success && res.data) {
      setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
      setUser(res.data.user);
      localStorage.setItem('pg_auth_user', JSON.stringify(res.data.user));
      await fetchCurrentUser();
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const register = async (data: {
    email: string;
    password: string;
    role: string;
    full_name: string;
    phone?: string;
    pg_name?: string;
    pg_code?: string;
    pg_id?: string;
  }) => {
    const res = await apiPost<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>('/auth/register', data);
    if (res.success && res.data) {
      setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
      setUser(res.data.user);
      localStorage.setItem('pg_auth_user', JSON.stringify(res.data.user));
      await fetchCurrentUser();
      return { success: true };
    }
    const errorMsg = (res as any).details?.map((d: any) => d.message).join(', ') || res.error || 'Registration failed';
    return { success: false, error: errorMsg };
  };

  const logout = () => {
    apiPost('/auth/logout').catch(() => {});
    clearTokens();
    setUser(null);
    setPg(null);
  };

  return (
    <AuthContext.Provider value={{ user, pg, pgName: user?.pgName || pg?.name, isLoading, login, register, refreshPG, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

