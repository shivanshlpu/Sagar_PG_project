import React from 'react';
import { Card } from '../components/ui/Card';
import { apiGet, apiPatch, formatDateTime } from '../lib/api';
import { Bell, Check } from 'lucide-react';

interface NotificationItem { id: string; title: string; message: string; type: string; is_read: boolean; created_at: string; }

export default function TenantNotifications() {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    setIsLoading(true);
    const res = await apiGet<NotificationItem[]>('/notifications');
    if (res.success && res.data) setNotifications(res.data);
    setIsLoading(false);
  }

  async function markRead(id: string) {
    await apiPatch(`/notifications/${id}/read`, {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  const typeColor: Record<string, string> = {
    rent_due: 'var(--color-danger)',
    payment_verified: 'var(--color-success)',
    payment_rejected: 'var(--color-danger)',
    complaint_update: 'var(--color-info)',
    announcement: 'var(--color-primary)',
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Notifications</h1>
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: '60px', marginBottom: '8px', borderRadius: 'var(--radius-md)' }} />)}
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Notifications</h1>

      {notifications.length > 0 ? (
        <div style={{ display: 'grid', gap: '8px', maxWidth: '640px' }}>
          {notifications.map((n) => (
            <Card
              key={n.id}
              padding="md"
              style={{
                borderLeft: `3px solid ${typeColor[n.type] || 'var(--color-border)'}`,
                opacity: n.is_read ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 'var(--font-size-base)' }}>{n.title}</p>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>{n.message}</p>
                  <p className="text-muted" style={{ marginTop: '4px' }}>{formatDateTime(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-primary)' }} title="Mark as read">
                    <Check size={16} />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <Bell size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>No notifications</p>
        </div>
      )}
    </div>
  );
}
