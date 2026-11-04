export interface Session { permissions: string[] }

export function requirePermission(session: Session, permission: string): void {
  if (!session.permissions.includes(permission)) throw new Error('Forbidden');
}
