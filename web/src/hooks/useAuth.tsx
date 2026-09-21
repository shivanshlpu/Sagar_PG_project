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
  register: (data: { email: string; password: string; role: string; full_name: string; phone?: string; pg_name?: string }) => Promise<{ success: boolean; error?: string }>;
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
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [pg, setPg] = React.useState<PGProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchCurrentUser = React.useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
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
        setUser({
          id: res.data.id,
          email: res.data.email,
          role: res.data.role,
          pgId: res.data.pgId,
          pgName: res.data.pgName,
          tenantId: res.data.tenant?.id,
          tenant: res.data.tenant,
        });
        if (res.data.pg) {
          setPg(res.data.pg);
        }
      } else {
        clearTokens();
        setUser(null);
        setPg(null);
      }
    } catch {
      clearTokens();
      setUser(null);
      setPg(null);
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
      await fetchCurrentUser();
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const register = async (data: { email: string; password: string; role: string; full_name: string; phone?: string; pg_name?: string }) => {
    const res = await apiPost<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>('/auth/register', data);
    if (res.success && res.data) {
      setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
      setUser(res.data.user);
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

