import React from 'react';
import { Card } from '../components/ui/Card';
import { apiGet } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Wifi, Phone, Key, Copy, Check, ShieldAlert } from 'lucide-react';

interface WifiNetwork {
  id: string;
  name: string;
  password: string;
  floor?: string | null;
  notes?: string | null;
}

interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
  is_emergency: boolean;
}

export default function TenantWiFiContacts() {
  const [networks, setNetworks] = React.useState<WifiNetwork[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const { showToast } = useToast();

  React.useEffect(() => {
    load();
  }, []);

  async function load() {
    setIsLoading(true);
    const [wifiRes, contactsRes] = await Promise.all([
      apiGet<{ networks?: WifiNetwork[]; network_name?: string; password?: string; notes?: string | null }>('/settings/wifi'),
      apiGet<Contact[]>('/contacts'),
    ]);

    if (wifiRes.success && wifiRes.data) {
      if (Array.isArray(wifiRes.data.networks)) {
        setNetworks(wifiRes.data.networks);
      } else if (wifiRes.data.network_name) {
        setNetworks([
          {
            id: 'default',
            name: wifiRes.data.network_name,
            password: wifiRes.data.password || '',
            floor: 'All Floors',
            notes: wifiRes.data.notes || null,
          },
        ]);
      }
    }

    if (contactsRes.success && contactsRes.data) {
      setContacts(contactsRes.data);
    }
    setIsLoading(false);
  }

  function handleCopy(id: string, password: string) {
    navigator.clipboard.writeText(password);
    setCopiedId(id);
    showToast('Wi-Fi password copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  }

  const emergencyContacts = contacts.filter((c) => c.is_emergency);
  const generalContacts = contacts.filter((c) => !c.is_emergency);

  return (
    <div className="page-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: '6px' }}>Wi-Fi & Staff Directory</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
          High-speed Wi-Fi passwords across all floors and essential PG staff contacts.
        </p>
      </div>

      {/* SECTION 1: WI-FI NETWORKS */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Wifi size={20} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Building Wi-Fi Networks</h2>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : networks.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {networks.map((net) => (
              <Card key={net.id} padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>{net.name}</h3>
                    <span style={getFloorBadgeStyle(net.floor)}>{net.floor || 'All Floors'}</span>
                  </div>
                  <div style={wifiIconWrapperStyle}>
                    <Wifi size={18} style={{ color: 'var(--color-primary)' }} />
                  </div>
                </div>

                {/* Password display + 1-click copy */}
                <div style={passwordBoxStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Key size={13} style={{ color: 'var(--color-text-muted)' }} />
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Pass:</span>
                    <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      {net.password}
                    </code>
                  </div>

                  <button
                    onClick={() => handleCopy(net.id, net.password)}
                    style={copyBtnStyle}
                    title="Copy password"
                  >
                    {copiedId === net.id ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>
                      {copiedId === net.id ? 'Copied' : 'Copy'}
                    </span>
                  </button>
                </div>

                {net.notes && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                    {net.notes}
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card padding="lg" style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>No Wi-Fi networks configured yet.</p>
          </Card>
        )}
      </div>

      {/* SECTION 2: CONTACTS DIRECTORY */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Phone size={20} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Contacts & Emergency Directory</h2>
        </div>

        {/* Emergency Contacts Callout */}
        {emergencyContacts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {emergencyContacts.map((c) => (
                <div key={c.id} style={emergencyCardStyle}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={16} style={{ color: 'var(--color-danger)' }} />
                      <strong style={{ fontSize: 'var(--font-size-base)', color: '#991B1B' }}>{c.name}</strong>
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: '#B91C1C', fontWeight: 500 }}>
                      {c.role} (Emergency)
                    </span>
                  </div>
                  <a href={`tel:${c.phone}`} style={callEmergencyBtnStyle}>
                    <Phone size={13} /> {c.phone}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* General Contacts */}
        {generalContacts.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {generalContacts.map((c) => (
              <Card key={c.id} padding="md" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: 'var(--font-size-base)' }}>{c.name}</strong>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                    {c.role}
                  </p>
                </div>
                <a href={`tel:${c.phone}`} style={callRegularBtnStyle}>
                  <Phone size={13} /> {c.phone}
                </a>
              </Card>
            ))}
          </div>
        ) : emergencyContacts.length === 0 ? (
          <Card padding="lg" style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>No contacts listed yet.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function getFloorBadgeStyle(floor?: string | null): React.CSSProperties {
  const f = (floor || '').toLowerCase();
  let bg = 'var(--color-bg-surface-alt)';
  let color = 'var(--color-text-secondary)';
  let border = 'var(--color-border)';

  if (f.includes('ground')) {
    bg = '#ECFDF5';
    color = '#065F46';
    border = '#A7F3D0';
  } else if (f.includes('1st') || f.includes('first')) {
    bg = '#EFF6FF';
    color = '#1E40AF';
    border = '#BFDBFE';
  } else if (f.includes('2nd') || f.includes('second')) {
    bg = '#EEF2FF';
    color = '#3730A3';
    border = '#C7D2FE';
  } else if (f.includes('3rd') || f.includes('third')) {
    bg = '#FAF5FF';
    color = '#6B21A8';
    border = '#E9D5FF';
  } else if (f.includes('4th') || f.includes('fourth')) {
    bg = '#FFF1F2';
    color = '#9F1239';
    border = '#FECDD3';
  } else if (f.includes('common') || f.includes('dining')) {
    bg = '#FFFBEB';
    color = '#92400E';
    border = '#FDE68A';
  } else if (f.includes('all')) {
    bg = 'var(--color-primary-light)';
    color = 'var(--color-primary)';
    border = '#99F6E4';
  }

  return {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
    marginTop: '4px',
  };
}


const wifiIconWrapperStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-primary-light)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const passwordBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface-alt)',
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const copyBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 8px',
  cursor: 'pointer',
  color: 'var(--color-text-secondary)',
};

const emergencyCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  backgroundColor: '#FEF2F2',
  border: '1px solid #FCA5A5',
  borderRadius: 'var(--radius-md)',
};

const callEmergencyBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#DC2626',
  color: '#FFFFFF',
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  fontSize: 'var(--font-size-xs)',
  textDecoration: 'none',
};

const callRegularBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: 'var(--color-primary-light)',
  color: 'var(--color-primary)',
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  fontSize: 'var(--font-size-xs)',
  textDecoration: 'none',
};
