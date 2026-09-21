import React from 'react';
import { apiGet } from '../lib/api';
import { formatDate } from '../lib/date';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Megaphone, Calendar, AlertCircle } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  expires_at?: string | null;
}

export default function TenantAnnouncements() {
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiGet<Announcement[]>('/announcements?status=active')
      .then((res) => {
        if (res.success && res.data) {
          setAnnouncements(res.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'neutral';
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Megaphone style={{ color: 'var(--color-primary)' }} /> PG Notices & Announcements
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Important updates from your PG management.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '100px', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p>No active announcements at this time.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {announcements.map((item) => (
            <Card key={item.id} padding="lg" style={{
              borderLeft: item.priority === 'urgent' ? '4px solid var(--color-danger)' :
                         item.priority === 'high' ? '4px solid var(--color-warning)' :
                         '4px solid var(--color-primary)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {item.title}
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Badge variant={getPriorityBadgeVariant(item.priority)}>
                    {item.priority.toUpperCase()}
                  </Badge>
                  <span style={{ fontSize: '11px', textTransform: 'capitalize', color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                    {item.category}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                {item.description}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={13} /> Posted: {formatDate(item.created_at)}
                </span>
                {item.expires_at && (
                  <span>Valid until: {formatDate(item.expires_at)}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
