import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser, UserRole } from '../types';

// Extend Express Request to include auth user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware: verifies JWT from Authorization header, attaches decoded user to req.user.
 * Rejects with 401 if token is missing or invalid.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (_err) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Middleware factory: restricts access to specified roles.
 * Must be used after authenticate().
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware: ensures the tenant can only access their own data.
 * Checks that req.params.id matches the authenticated tenant's tenantId.
 * Admins bypass this check.
 */
export function tenantSelfOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  if (req.user.role === 'tenant' && req.params.id !== req.user.tenantId) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  next();
}

/**
 * Middleware: ensures the authenticated user is associated with a PG.
 * Prevents unassigned or orphaned users from accessing PG-scoped resources.
 */
export function requirePg(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (!req.user.pgId) {
    res.status(403).json({ success: false, error: 'No PG associated with this account' });
    return;
  }

  next();
}
