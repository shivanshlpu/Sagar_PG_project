import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { FormField, Input, Select } from '../components/ui/FormField';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { getStatusBadgeVariant } from '../components/ui/Badge';
import {
  Wifi,
  Phone,
  QrCode,
  Key,
  RefreshCw,
  Check,
  Copy,
  Trash2,
  Pencil,
  Plus,
  Eye,
  EyeOff,
  Send,
  AlertCircle,
  CheckCircle2,
  Radio,
  Sliders,
  Palette,
  Moon,
  Sun,
  Languages,
  Calculator,
  IndianRupee,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface WifiNetwork {
  id: string;
  name: string;
  password: string;
  floor?: string | null;
  notes?: string | null;
}

interface WhatsAppStatusData {
  status: 'disconnected' | 'pairing' | 'connected';
  hasQr: boolean;
  qr: string | null;
  pairingCode: string | null;
  phoneNumber?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
}

interface ReminderSettings {
  rent_reminder_day: number;
  rent_due_day: number;
  late_fee_grace_days: number;
  late_fee_paise: number;
  electricity_reminder_enabled: boolean;
}

export default function AdminSettings() {
  const { theme, setTheme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: 'wifi' | 'whatsapp' | 'reminders' | 'billing' | 'appearance' =
    tabParam === 'whatsapp' || tabParam === 'reminders' || tabParam === 'billing' || tabParam === 'appearance' ? tabParam : 'wifi';

  const setActiveTab = React.useCallback((tab: 'wifi' | 'whatsapp' | 'reminders' | 'billing' | 'appearance') => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const { showToast } = useToast();

  // --- Wi-Fi State ---
  const [networks, setNetworks] = React.useState<WifiNetwork[]>([]);
  const [isLoadingWifi, setIsLoadingWifi] = React.useState(true);
  const [showWifiModal, setShowWifiModal] = React.useState(false);
  const [editingNetwork, setEditingNetwork] = React.useState<WifiNetwork | null>(null);
  const [networkToDelete, setNetworkToDelete] = React.useState<WifiNetwork | null>(null);
  const [showPasswordMap, setShowPasswordMap] = React.useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Wi-Fi form fields
  const [formSsid, setFormSsid] = React.useState('');
  const [formPassword, setFormPassword] = React.useState('');
  const [formFloor, setFormFloor] = React.useState('Ground Floor');
  const [customFloor, setCustomFloor] = React.useState('');
  const [formNotes, setFormNotes] = React.useState('');

  // --- WhatsApp State ---
  const [waData, setWaData] = React.useState<WhatsAppStatusData>({
    status: 'disconnected',
    hasQr: false,
    qr: null,
    pairingCode: null,
  });
  const [waLoading, setWaLoading] = React.useState(false);
  const [pairPhone, setPairPhone] = React.useState('');
  const [pairLoading, setPairLoading] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [connectionMethod, setConnectionMethod] = React.useState<'qr' | 'code'>('qr');
  const [testPhone, setTestPhone] = React.useState('');
  const [testMessage, setTestMessage] = React.useState('Hello from PG Management Platform! WhatsApp integration is active.');
  const [testSending, setTestSending] = React.useState(false);

  // --- Reminder Settings State ---
  const [reminders, setReminders] = React.useState<ReminderSettings>({
    rent_reminder_day: 1,
    rent_due_day: 5,
    late_fee_grace_days: 5,
    late_fee_paise: 0,
    electricity_reminder_enabled: true,
  });

  // --- Billing Settings State ---
  const [billingSettings, setBillingSettings] = React.useState({
    electricity_rate_per_unit: 12,
    maintenance_charge: 500,
  });
  const [isSavingBilling, setIsSavingBilling] = React.useState(false);

  React.useEffect(() => {
    loadWifiSettings();
    loadWhatsAppStatus();
    loadReminderSettings();
    loadBillingSettings();
  }, []);

  // Poll WhatsApp status while in pairing mode or when looking at WhatsApp tab and not yet connected
  // Pauses automatically if the user minimizes or hides the browser tab to save traffic
  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) clearInterval(interval);
      if (document.visibilityState === 'visible') {
        if ((activeTab === 'whatsapp' && waData.status !== 'connected') || waData.status === 'pairing') {
          interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
              loadWhatsAppStatus(false);
            }
          }, 3000);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadWhatsAppStatus(false);
        startPolling();
      } else if (interval) {
        clearInterval(interval);
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab, waData.status]);

  // --- Wi-Fi Functions ---
  async function loadWifiSettings() {
    setIsLoadingWifi(true);
    const res = await apiGet<{ networks: WifiNetwork[] }>('/settings/wifi');
    if (res.success && res.data) {
      setNetworks(res.data.networks || []);
    }
    setIsLoadingWifi(false);
  }

  function openAddWifi() {
    setEditingNetwork(null);
    setFormSsid('');
    setFormPassword('');
    setFormFloor('Ground Floor');
    setCustomFloor('');
    setFormNotes('');
    setShowWifiModal(true);
  }

  function openEditWifi(net: WifiNetwork) {
    setEditingNetwork(net);
    setFormSsid(net.name);
    setFormPassword(net.password);
    const standardFloors = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', 'Common Area / Dining', 'All Floors'];
    if (net.floor && !standardFloors.includes(net.floor)) {
      setFormFloor('Custom');
      setCustomFloor(net.floor);
    } else {
      setFormFloor(net.floor || 'Ground Floor');
      setCustomFloor('');
    }
    setFormNotes(net.notes || '');
    setShowWifiModal(true);
  }

  async function handleSaveWifi() {
    if (!formSsid.trim()) {
      showToast('Network SSID is required', 'error');
      return;
    }
    if (!formPassword.trim()) {
      showToast('Password is required', 'error');
      return;
    }

    const effectiveFloor = formFloor === 'Custom' ? (customFloor.trim() || 'Other Floor') : formFloor;

    let updatedList: WifiNetwork[];
    if (editingNetwork) {
      updatedList = networks.map((n) =>
        n.id === editingNetwork.id
          ? { ...n, name: formSsid.trim(), password: formPassword.trim(), floor: effectiveFloor, notes: formNotes.trim() || null }
          : n
      );
    } else {
      const newNet: WifiNetwork = {
        id: `wifi_${Date.now()}`,
        name: formSsid.trim(),
        password: formPassword.trim(),
        floor: effectiveFloor,
        notes: formNotes.trim() || null,
      };
      updatedList = [...networks, newNet];
    }

    const res = await apiPatch('/settings/wifi', { networks: updatedList });
    if (res.success) {
      setNetworks(updatedList);
      setShowWifiModal(false);
      showToast(editingNetwork ? 'Wi-Fi network updated' : 'New Wi-Fi network added');
    } else {
      showToast(res.error || 'Failed to save Wi-Fi network', 'error');
    }
  }

  async function handleDeleteWifi() {
    if (!networkToDelete) return;
    const updatedList = networks.filter((n) => n.id !== networkToDelete.id);
    const res = await apiPatch('/settings/wifi', { networks: updatedList });
    if (res.success) {
      setNetworks(updatedList);
      setNetworkToDelete(null);
      showToast('Wi-Fi network removed');
    } else {
      showToast(res.error || 'Failed to delete network', 'error');
    }
  }

  function copyPassword(id: string, pass: string) {
    navigator.clipboard.writeText(pass);
    setCopiedId(id);
    showToast('Password copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  }

  // --- WhatsApp Functions ---
  async function loadWhatsAppStatus(showLoading = true) {
    if (showLoading) setWaLoading(true);
    const res = await apiGet<WhatsAppStatusData>('/whatsapp/status');
    if (res.success && res.data) {
      setWaData(res.data);
    }
    if (showLoading) setWaLoading(false);
  }

  async function handleConnectWhatsApp() {
    setWaLoading(true);
    const res = await apiPost<WhatsAppStatusData>('/whatsapp/connect');
    if (res.success && res.data) {
      setWaData(res.data);
      showToast('WhatsApp connection initialized. Waiting for QR scan or pairing.');
    } else {
      showToast(res.error || 'Failed to initialize WhatsApp', 'error');
    }
    setWaLoading(false);
  }

  async function handleRequestPairingCode() {
    if (!pairPhone.trim()) {
      showToast('Enter your phone number with country code (e.g. 919876543210)', 'error');
      return;
    }
    setPairLoading(true);
    const res = await apiPost<{ pairingCode: string }>('/whatsapp/pairing-code', { phone: pairPhone.trim() });
    if (res.success && res.data) {
      const code = res.data.pairingCode;
      setWaData((prev) => ({
        ...prev,
        status: 'pairing',
        pairingCode: code,
      }));
      showToast('Pairing code generated! Check your WhatsApp.');
    } else {
      showToast(res.error || 'Failed to generate pairing code', 'error');
    }
    setPairLoading(false);
  }

  async function handleDisconnectWhatsApp() {
    setWaLoading(true);
    const res = await apiPost('/whatsapp/disconnect');
    if (res.success) {
      setWaData({
        status: 'disconnected',
        hasQr: false,
        qr: null,
        pairingCode: null,
      });
      showToast('WhatsApp disconnected');
    } else {
      showToast(res.error || 'Failed to disconnect', 'error');
    }
    setWaLoading(false);
  }

  async function handleSendTestMessage() {
    if (!testPhone.trim()) {
      showToast('Enter recipient phone number with country code', 'error');
      return;
    }
    setTestSending(true);
    const res = await apiPost('/whatsapp/send', { phone: testPhone.trim(), message: testMessage.trim() });
    if (res.success) {
      showToast('Test message dispatched successfully!');
    } else {
      showToast(res.error || 'Failed to send message', 'error');
    }
    setTestSending(false);
  }

  // --- Reminder Settings ---
  async function loadReminderSettings() {
    const res = await apiGet<ReminderSettings>('/settings/reminders');
    if (res.success && res.data) {
      setReminders(res.data);
    }
  }

  async function handleSaveReminders() {
    const res = await apiPatch('/settings/reminders', reminders);
    if (res.success) {
      showToast('Reminder schedule saved');
    } else {
      showToast(res.error || 'Failed to save reminders', 'error');
    }
  }

  // --- Billing Settings ---
  async function loadBillingSettings() {
    const res = await apiGet<{ electricity_rate_per_unit_paise: number; maintenance_charge_paise: number }>('/settings/billing');
    if (res.success && res.data) {
      setBillingSettings({
        electricity_rate_per_unit: (res.data.electricity_rate_per_unit_paise ?? 1200) / 100,
        maintenance_charge: (res.data.maintenance_charge_paise ?? 50000) / 100,
      });
    }
  }

  async function handleSaveBilling() {
    setIsSavingBilling(true);
    const res = await apiPatch('/settings/billing', {
      electricity_rate_per_unit_paise: Math.round(billingSettings.electricity_rate_per_unit * 100),
      maintenance_charge_paise: Math.round(billingSettings.maintenance_charge * 100),
    });
    if (res.success) {
      showToast('Billing rates and charges saved successfully');
    } else {
      showToast(res.error || 'Failed to save billing settings', 'error');
    }
    setIsSavingBilling(false);
  }

  return (
    <div className="page-container" style={{ maxWidth: '1080px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 className="page-title" style={{ marginBottom: '6px' }}>Settings & Integrations</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
          Manage multi-floor Wi-Fi networks, WhatsApp bot automation, and automated reminders.
        </p>
      </div>

      {/* Tabs */}
      <div style={tabContainerStyle}>
        <button
          onClick={() => setActiveTab('wifi')}
          style={activeTab === 'wifi' ? activeTabStyle : inactiveTabStyle}
        >
          <Wifi size={18} />
          <span>Wi-Fi Networks</span>
          <span style={pillBadgeStyle}>{networks.length}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('whatsapp');
            loadWhatsAppStatus(false);
          }}
          style={activeTab === 'whatsapp' ? activeTabStyle : inactiveTabStyle}
        >
          <Phone size={18} />
          <span>WhatsApp Automation</span>
          <span
            style={{
              ...statusDotStyle,
              backgroundColor:
                waData.status === 'connected'
                  ? 'var(--color-success)'
                  : waData.status === 'pairing'
                  ? 'var(--color-warning)'
                  : 'var(--color-text-muted)',
            }}
          />
        </button>

        <button
          onClick={() => setActiveTab('reminders')}
          style={activeTab === 'reminders' ? activeTabStyle : inactiveTabStyle}
        >
          <Sliders size={18} />
          <span>{t('settings.tab.reminders', 'Rent Reminders')}</span>
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          style={activeTab === 'billing' ? activeTabStyle : inactiveTabStyle}
        >
          <Calculator size={18} />
          <span>Billing & Rates</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          style={activeTab === 'appearance' ? activeTabStyle : inactiveTabStyle}
        >
          <Palette size={18} />
          <span>{t('settings.tab.appearance', 'Appearance & Theme')}</span>
          {theme === 'dark' && (
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#38BDF8',
              display: 'inline-block',
            }} />
          )}
        </button>
      </div>

      {/* TAB 1: WI-FI NETWORKS */}
      {activeTab === 'wifi' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Multi-Floor Wi-Fi Networks</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
                Tenants see these networks on their dashboard based on their floor or common areas.
              </p>
            </div>
            <Button onClick={openAddWifi}>
              <Plus size={16} /> Add Wi-Fi Network
            </Button>
          </div>

          {isLoadingWifi ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '170px', borderRadius: 'var(--radius-lg)' }} />
              ))}
            </div>
          ) : networks.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {networks.map((net) => {
                const showPass = showPasswordMap[net.id];
                return (
                  <Card key={net.id} padding="lg" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={wifiIconWrapperStyle}>
                          <Wifi size={20} style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>{net.name}</h3>
                          <span style={getFloorBadgeStyle(net.floor)}>{net.floor || 'All Floors'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => openEditWifi(net)}
                          style={iconBtnStyle}
                          title="Edit Network"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setNetworkToDelete(net)}
                          style={{ ...iconBtnStyle, color: 'var(--color-danger)' }}
                          title="Delete Network"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Password Box */}
                    <div style={passwordBoxStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Key size={14} style={{ color: 'var(--color-text-muted)' }} />
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          Password:
                        </span>
                        <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                          {showPass ? net.password : '••••••••••••'}
                        </code>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => setShowPasswordMap((prev) => ({ ...prev, [net.id]: !prev[net.id] }))}
                          style={iconSmallBtnStyle}
                          title={showPass ? 'Hide password' : 'Show password'}
                        >
                          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => copyPassword(net.id, net.password)}
                          style={iconSmallBtnStyle}
                          title="Copy password"
                        >
                          {copiedId === net.id ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    {net.notes && (
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                        {net.notes}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card padding="lg" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Wifi size={24} style={{ color: 'var(--color-primary)' }} />
              </div>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '6px' }}>No Wi-Fi Networks Added</h3>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: '420px', margin: '0 auto 20px', fontSize: 'var(--font-size-sm)' }}>
                Add your building’s floor-wise Wi-Fi networks so tenants can view passwords directly in their portal.
              </p>
              <Button onClick={openAddWifi}>
                <Plus size={16} /> Add First Wi-Fi Network
              </Button>
            </Card>
          )}

          {/* Add / Edit Modal */}
          <Modal
            isOpen={showWifiModal}
            onClose={() => setShowWifiModal(false)}
            title={editingNetwork ? 'Edit Wi-Fi Network' : 'Add Wi-Fi Network'}
            footer={
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowWifiModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveWifi}>
                  {editingNetwork ? 'Save Changes' : 'Add Network'}
                </Button>
              </div>
            }
          >
            <FormField label="Network Name (SSID)" required hint="The Wi-Fi name visible on devices">
              <Input
                placeholder="e.g. PG_Floor1_5G"
                value={formSsid}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormSsid(e.target.value)}
              />
            </FormField>

            <FormField label="Wi-Fi Password" required hint="Password required to connect">
              <Input
                type="text"
                placeholder="e.g. securePass@2026"
                value={formPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormPassword(e.target.value)}
              />
            </FormField>

            <FormField label="Floor / Coverage Location">
              <Select
                options={[
                  { value: 'Ground Floor', label: 'Ground Floor' },
                  { value: '1st Floor', label: '1st Floor' },
                  { value: '2nd Floor', label: '2nd Floor' },
                  { value: '3rd Floor', label: '3rd Floor' },
                  { value: '4th Floor', label: '4th Floor' },
                  { value: 'Common Area / Dining', label: 'Common Area / Dining' },
                  { value: 'All Floors', label: 'All Floors (Mesh/Building-wide)' },
                  { value: 'Custom', label: 'Custom Floor / Location...' },
                ]}
                value={formFloor}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormFloor(e.target.value)}
              />
            </FormField>

            {formFloor === 'Custom' && (
              <FormField label="Specify Floor Name" required hint="e.g. Basement, 5th Floor, Rooftop Lounge">
                <Input
                  placeholder="e.g. 5th Floor"
                  value={customFloor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomFloor(e.target.value)}
                />
              </FormField>
            )}

            <FormField label="Optional Notes" hint="e.g. Router near room 102; 5GHz recommended">
              <Input
                placeholder="Optional tips for tenants"
                value={formNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormNotes(e.target.value)}
              />
            </FormField>
          </Modal>

          <ConfirmModal
            isOpen={!!networkToDelete}
            onClose={() => setNetworkToDelete(null)}
            onConfirm={handleDeleteWifi}
            title="Remove Wi-Fi Network"
            message={`Are you sure you want to remove "${networkToDelete?.name}"? Tenants will no longer see this network.`}
            confirmLabel="Delete Network"
          />
        </div>
      )}

      {/* TAB 2: WHATSAPP AUTOMATION */}
      {activeTab === 'whatsapp' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Status Hero Card */}
          <Card padding="lg" style={{ borderLeft: `4px solid ${waData.status === 'connected' ? 'var(--color-success)' : waData.status === 'pairing' ? 'var(--color-warning)' : 'var(--color-border)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor:
                      waData.status === 'connected'
                        ? 'var(--color-success-light)'
                        : waData.status === 'pairing'
                        ? 'var(--color-warning-light)'
                        : 'var(--color-bg-surface-alt)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Phone
                    size={22}
                    style={{
                      color:
                        waData.status === 'connected'
                          ? 'var(--color-success)'
                          : waData.status === 'pairing'
                          ? 'var(--color-warning)'
                          : 'var(--color-text-muted)',
                    }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>WhatsApp Bot Integration</h2>
                    <Badge variant={getStatusBadgeVariant(waData.status)}>
                      {waData.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
                    {waData.status === 'connected'
                      ? `Linked as +${waData.phoneNumber || 'Unknown'}. Automated receipts, dues reminders, and alerts active.`
                      : waData.status === 'pairing'
                      ? 'Pairing in progress. Scan the QR code or enter the pairing code on WhatsApp.'
                      : 'No WhatsApp account linked. Link your account to enable instant tenant receipts and reminders.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {waData.status === 'connected' ? (
                  <Button variant="danger" onClick={handleDisconnectWhatsApp} isLoading={waLoading}>
                    Disconnect WhatsApp
                  </Button>
                ) : (
                  <Button onClick={handleConnectWhatsApp} isLoading={waLoading}>
                    <RefreshCw size={15} /> Initialize Connection
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Connection Interface when Disconnected or Pairing */}
          {waData.status !== 'connected' && (
            <Card padding="lg">
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '6px' }}>
                  Connect Your WhatsApp Account
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Choose either to scan a QR code with your phone or request an 8-character connection pairing code.
                </p>

                {/* Sub-tabs for QR vs Pairing Code */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button
                    onClick={() => {
                      setConnectionMethod('qr');
                      if (!waData.qr) handleConnectWhatsApp();
                    }}
                    style={connectionMethod === 'qr' ? activePillStyle : inactivePillStyle}
                  >
                    <QrCode size={15} /> Option 1: Scan QR Code
                  </button>
                  <button
                    onClick={() => setConnectionMethod('code')}
                    style={connectionMethod === 'code' ? activePillStyle : inactivePillStyle}
                  >
                    <Radio size={15} /> Option 2: Link with Phone Number (Pairing String)
                  </button>
                </div>
              </div>

              {/* METHOD 1: QR CODE */}
              {connectionMethod === 'qr' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: '32px', alignItems: 'center' }}>
                  <div style={qrWrapperStyle}>
                    {waData.qr ? (
                      <img
                        src={waData.qr}
                        alt="WhatsApp Connection QR Code"
                        style={{ width: '240px', height: '240px', display: 'block', borderRadius: 'var(--radius-md)' }}
                      />
                    ) : (
                      <div style={{ height: '240px', width: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <QrCode size={48} style={{ color: 'var(--color-text-muted)' }} />
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '0 16px' }}>
                          Click "Generate QR Code" to create a live QR code.
                        </p>
                        <Button variant="secondary" onClick={handleConnectWhatsApp} isLoading={waLoading} style={{ fontSize: 'var(--font-size-xs)' }}>
                          Generate QR Code
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '10px' }}>
                      How to scan:
                    </h4>
                    <ol style={{ paddingLeft: '20px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                      <li>Open <strong>WhatsApp</strong> on your mobile phone.</li>
                      <li>Tap <strong>Settings</strong> (iOS) or <strong>Three Dots</strong> (Android).</li>
                      <li>Tap <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.</li>
                      <li>Point your camera at this QR code to link instantly.</li>
                    </ol>

                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <Button variant="secondary" onClick={handleConnectWhatsApp} isLoading={waLoading}>
                        <RefreshCw size={14} /> Refresh QR Code
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* METHOD 2: PAIRING CODE (CONNECTION STRING) */}
              {connectionMethod === 'code' && (
                <div style={{ maxWidth: '520px' }}>
                  <FormField label="WhatsApp Phone Number" required hint="Include country code without + or dashes (e.g. 919876543210 for India)">
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Input
                        placeholder="e.g. 919876543210"
                        value={pairPhone}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPairPhone(e.target.value)}
                      />
                      <Button onClick={handleRequestPairingCode} isLoading={pairLoading}>
                        Get Code
                      </Button>
                    </div>
                  </FormField>

                  {waData.pairingCode && (
                    <div style={pairingCodeBoxStyle}>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                        Your WhatsApp Connection Pairing Code:
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <span style={pairingCodeDisplayStyle}>
                          {waData.pairingCode.length === 8
                            ? `${waData.pairingCode.slice(0, 4)} - ${waData.pairingCode.slice(4)}`
                            : waData.pairingCode}
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(waData.pairingCode || '');
                            setCopiedCode(true);
                            showToast('Pairing code copied to clipboard');
                            setTimeout(() => setCopiedCode(false), 2000);
                          }}
                        >
                          {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                          {copiedCode ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(15, 118, 110, 0.2)' }}>
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-dark)', fontWeight: 600, marginBottom: '6px' }}>
                          How to enter on WhatsApp:
                        </p>
                        <ol style={{ paddingLeft: '18px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                          <li>Open <strong>WhatsApp</strong> on your phone.</li>
                          <li>Tap <strong>Settings</strong> &gt; <strong>Linked Devices</strong>.</li>
                          <li>Tap <strong>Link a Device</strong> &gt; <strong>Link with phone number instead</strong>.</li>
                          <li>Type in the 8-character code shown above.</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Test Message Dispatcher when Connected */}
          {waData.status === 'connected' && (
            <Card padding="lg">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} />
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Send Test Notification</h3>
              </div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                Verify your WhatsApp connection by dispatching a live test message to any WhatsApp number.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 320px) 1fr', gap: '16px', alignItems: 'flex-start' }}>
                <FormField label="Recipient Phone (with country code)" required hint="e.g. 919876543210">
                  <Input
                    placeholder="919876543210"
                    value={testPhone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTestPhone(e.target.value)}
                  />
                </FormField>

                <FormField label="Message Text" required>
                  <Input
                    value={testMessage}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTestMessage(e.target.value)}
                  />
                </FormField>
              </div>

              <div style={{ marginTop: '12px' }}>
                <Button onClick={handleSendTestMessage} isLoading={testSending}>
                  <Send size={15} /> Send Test Message
                </Button>
              </div>
            </Card>
          )}

          {/* Anti-Ban Best Practices Advisory */}
          <div style={advisoryBoxStyle}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <AlertCircle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                <strong>WhatsApp Account Advisory:</strong> This integration uses Baileys multi-device protocol on your personal WhatsApp account. To prevent WhatsApp account restrictions, avoid broadcasting bulk unsolicited messages. Dues receipts and complaint replies sent to existing tenants carry minimal risk.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REMINDERS & AUTOMATION */}
      {activeTab === 'reminders' && (
        <Card padding="lg" style={{ maxWidth: '640px' }}>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '6px' }}>
            Automated Rent & Bill Reminders
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: '20px' }}>
            Configure when reminders and late fees are automatically triggered for tenants.
          </p>

          <FormField label="Rent Reminder Notification Day" hint="Day of the month to send early reminder (1-28)">
            <Input
              type="number"
              min={1}
              max={28}
              value={reminders.rent_reminder_day}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setReminders((prev) => ({ ...prev, rent_reminder_day: parseInt(e.target.value, 10) || 1 }))
              }
            />
          </FormField>

          <FormField label="Rent Due Day" hint="Standard monthly rent due date (1-28)">
            <Input
              type="number"
              min={1}
              max={28}
              value={reminders.rent_due_day}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setReminders((prev) => ({ ...prev, rent_due_day: parseInt(e.target.value, 10) || 5 }))
              }
            />
          </FormField>

          <FormField label="Late Fee Grace Period (Days)" hint="Days after due date before late fee applies">
            <Input
              type="number"
              min={0}
              max={30}
              value={reminders.late_fee_grace_days}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setReminders((prev) => ({ ...prev, late_fee_grace_days: parseInt(e.target.value, 10) || 0 }))
              }
            />
          </FormField>

          <FormField label="Late Fee Amount (in paise)" hint="e.g. 50000 paise = Rs. 500">
            <Input
              type="number"
              min={0}
              value={reminders.late_fee_paise}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setReminders((prev) => ({ ...prev, late_fee_paise: parseInt(e.target.value, 10) || 0 }))
              }
            />
          </FormField>

          <div style={{ marginTop: '24px' }}>
            <Button onClick={handleSaveReminders}>Save Reminder Settings</Button>
          </div>
        </Card>
      )}

      {/* TAB: BILLING & PRE-CONFIGURED RATES */}
      {activeTab === 'billing' && (
        <div style={{ maxWidth: '680px' }}>
          <Card padding="lg" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Calculator size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
                  Pre-Configured Rates & Charges
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Configure electricity unit rates and fixed monthly maintenance charges. All totals are auto-calculated for each room and tenant.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
              <FormField
                label="Default Electricity Rate (₹ per Unit)"
                required
                hint="e.g. ₹12 / unit. When you input tenant electricity units, cost is auto-calculated using this rate."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    value={billingSettings.electricity_rate_per_unit}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setBillingSettings((prev) => ({ ...prev, electricity_rate_per_unit: parseFloat(e.target.value) || 0 }))
                    }
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    ₹ / unit
                  </span>
                </div>
              </FormField>

              <FormField
                label="Fixed Monthly Maintenance Charge (₹)"
                required
                hint="e.g. ₹500 / month. Automatically added to every active tenant's room rent each month."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Input
                    type="number"
                    min={0}
                    value={billingSettings.maintenance_charge}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setBillingSettings((prev) => ({ ...prev, maintenance_charge: parseFloat(e.target.value) || 0 }))
                    }
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    ₹ / month
                  </span>
                </div>
              </FormField>
            </div>

            <div style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              gap: '12px',
            }}>
              <IndianRupee size={20} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                <strong>Room Rent Configuration:</strong> Room rents (e.g. ₹7,000, ₹8,000, or ₹10,000) are configured per room in the <strong>Rooms</strong> section. When you enter tenant electricity units, the system automatically calculates:
                <div style={{ marginTop: '8px', fontFamily: 'monospace', padding: '8px 12px', backgroundColor: 'var(--color-bg-surface)', borderRadius: '6px', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                  Total Due = Room Rent + Maintenance (₹{billingSettings.maintenance_charge}) + (Units × ₹{billingSettings.electricity_rate_per_unit})
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <Button onClick={handleSaveBilling} isLoading={isSavingBilling}>
                Save Billing Settings
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: APPEARANCE & THEME (Dark Mode & Language) */}
      {activeTab === 'appearance' && (
        <div style={{ maxWidth: '720px' }}>
          <Card padding="lg" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Palette size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
                  {t('settings.theme.title', 'Interface Theme')}
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {t('settings.theme.subtitle', 'Choose how the PG platform looks for you')}
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginTop: '20px',
              marginBottom: '20px',
            }}>
              {/* Light Mode Option */}
              <div
                onClick={() => setTheme('light')}
                style={{
                  border: theme === 'light' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  cursor: 'pointer',
                  backgroundColor: theme === 'light' ? 'var(--color-primary-light)' : 'var(--color-bg-surface-alt)',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#FFFBEB',
                    color: '#B8790E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Sun size={18} />
                  </div>
                  {theme === 'light' && (
                    <Badge variant="success">
                      <Check size={12} style={{ marginRight: '4px' }} /> Active
                    </Badge>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginBottom: '4px' }}>
                  {t('settings.theme.light', 'Light Mode')}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {t('settings.theme.light_desc', 'Default clean light appearance')}
                </div>
              </div>

              {/* Dark Mode Option */}
              <div
                onClick={() => setTheme('dark')}
                style={{
                  border: theme === 'dark' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  cursor: 'pointer',
                  backgroundColor: theme === 'dark' ? 'var(--color-primary-light)' : 'var(--color-bg-surface-alt)',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#1E293B',
                    color: '#38BDF8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Moon size={18} />
                  </div>
                  {theme === 'dark' && (
                    <Badge variant="success">
                      <Check size={12} style={{ marginRight: '4px' }} /> Active
                    </Badge>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginBottom: '4px' }}>
                  {t('settings.theme.dark', 'Dark Mode')}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {t('settings.theme.dark_desc', 'High-contrast dark mode for low-light comfort')}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Moon size={16} style={{ color: 'var(--color-text-secondary)' }} />
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                  {theme === 'dark' ? 'Dark theme is currently active' : 'Enable Dark Mode'}
                </span>
              </div>
              <Button
                size="sm"
                variant={theme === 'dark' ? 'primary' : 'secondary'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
              </Button>
            </div>
          </Card>

          {/* Language Preferences Card */}
          <Card padding="lg">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Languages size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
                  {t('settings.language.title', 'Language (भाषा)')}
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {t('settings.language.subtitle', 'Switch between English and Hindi across the portal')}
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginTop: '20px',
            }}>
              {/* English */}
              <div
                onClick={() => setLanguage('en')}
                style={{
                  border: language === 'en' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  cursor: 'pointer',
                  backgroundColor: language === 'en' ? 'var(--color-primary-light)' : 'var(--color-bg-surface-alt)',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '20px' }}>🇬🇧</span>
                  {language === 'en' && <Badge variant="success"><Check size={12} style={{ marginRight: '4px' }} /> Active</Badge>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>English</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Default system language</div>
              </div>

              {/* Hindi */}
              <div
                onClick={() => setLanguage('hi')}
                style={{
                  border: language === 'hi' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  cursor: 'pointer',
                  backgroundColor: language === 'hi' ? 'var(--color-primary-light)' : 'var(--color-bg-surface-alt)',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '20px' }}>🇮🇳</span>
                  {language === 'hi' && <Badge variant="success"><Check size={12} style={{ marginRight: '4px' }} /> Active</Badge>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>हिन्दी (Hindi)</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>हिंदी भाषा में पोर्टल का उपयोग करें</div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// --- Styles ---
const tabContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  borderBottom: '1px solid var(--color-border)',
  marginBottom: '24px',
  paddingBottom: '2px',
};

const activeTabStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 18px',
  border: 'none',
  borderBottom: '2px solid var(--color-primary)',
  backgroundColor: 'transparent',
  color: 'var(--color-primary)',
  fontWeight: 600,
  fontSize: 'var(--font-size-base)',
  cursor: 'pointer',
  transition: 'all 150ms ease',
};

const inactiveTabStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 18px',
  border: 'none',
  borderBottom: '2px solid transparent',
  backgroundColor: 'transparent',
  color: 'var(--color-text-secondary)',
  fontWeight: 500,
  fontSize: 'var(--font-size-base)',
  cursor: 'pointer',
  transition: 'all 150ms ease',
};

const pillBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '2px 7px',
  borderRadius: '999px',
  backgroundColor: 'var(--color-primary-light)',
  color: 'var(--color-primary)',
  fontWeight: 600,
};

const statusDotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  display: 'inline-block',
};

const wifiIconWrapperStyle: React.CSSProperties = {
  width: '38px',
  height: '38px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-primary-light)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

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
    marginTop: '2px',
  };
}


const passwordBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface-alt)',
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '6px',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const iconSmallBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const qrWrapperStyle: React.CSSProperties = {
  padding: '16px',
  border: '2px dashed var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  backgroundColor: '#FFFFFF',
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const activePillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--color-primary)',
  backgroundColor: 'var(--color-primary-light)',
  color: 'var(--color-primary)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};

const inactivePillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)',
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 500,
  cursor: 'pointer',
};

const pairingCodeBoxStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  borderRadius: 'var(--radius-lg)',
  backgroundColor: 'var(--color-primary-light)',
  border: '1px solid var(--color-primary)',
};

const pairingCodeDisplayStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '4px',
  fontFamily: 'monospace',
  color: 'var(--color-primary)',
};

const advisoryBoxStyle: React.CSSProperties = {
  padding: '14px 18px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-warning-light)',
  border: '1px solid #FDE68A',
};
