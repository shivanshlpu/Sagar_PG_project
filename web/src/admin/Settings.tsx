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
  Lock,
  Landmark,
  Upload,
  Building2,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../hooks/useAuth';

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
  rent_reminder_day: number | string;
  rent_due_day: number | string;
  late_fee_grace_days: number | string;
  late_fee_paise: number | string;
  electricity_reminder_enabled: boolean;
}

export default function AdminSettings() {
  const { theme, setTheme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: 'profile' | 'wifi' | 'whatsapp' | 'templates' | 'reminders' | 'billing' | 'banking' | 'appearance' | 'security' =
    tabParam === 'wifi' || tabParam === 'whatsapp' || tabParam === 'templates' || tabParam === 'reminders' || tabParam === 'billing' || tabParam === 'banking' || tabParam === 'appearance' || tabParam === 'security'
      ? tabParam
      : 'profile';

  const setActiveTab = React.useCallback((tab: 'profile' | 'wifi' | 'whatsapp' | 'templates' | 'reminders' | 'billing' | 'banking' | 'appearance' | 'security') => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const { showToast } = useToast();
  const { pg, refreshPG } = useAuth();

  // --- PG Profile & Branding State ---
  const [profileForm, setProfileForm] = React.useState({
    name: '',
    owner_name: '',
    tagline: 'PREMIUM PG LIVING',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    logo_url: null as string | null,
  });
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const logoFileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (pg) {
      setProfileForm({
        name: pg.name || '',
        owner_name: pg.owner_name || '',
        tagline: pg.tagline || 'PREMIUM PG LIVING',
        phone: pg.phone || '',
        email: pg.email || '',
        address: pg.address || '',
        city: pg.city || '',
        state: pg.state || '',
        pincode: pg.pincode || '',
        logo_url: pg.logo_url || null,
      });
    }
  }, [pg]);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Please upload a valid image file (PNG, JPG, JPEG, WEBP)', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo image must be smaller than 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxWidth = 420;
        const maxHeight = 180;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const outputFormat = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(outputFormat, 0.9);
          setProfileForm((prev) => ({ ...prev, logo_url: dataUrl }));
          showToast('Logo ready! Click "Save Changes" to apply.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setProfileForm((prev) => ({ ...prev, logo_url: null }));
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = '';
    }
    showToast('Logo removed. Click "Save Changes" to save.');
  }

  async function handleSaveProfile() {
    if (!profileForm.name.trim()) {
      showToast('PG Name is required', 'error');
      return;
    }
    setIsSavingProfile(true);
    try {
      const res = await apiPatch('/pg', {
        name: profileForm.name.trim(),
        owner_name: profileForm.owner_name.trim() || null,
        tagline: profileForm.tagline.trim() || null,
        phone: profileForm.phone.trim() || null,
        email: profileForm.email.trim() || null,
        address: profileForm.address.trim() || null,
        city: profileForm.city.trim() || null,
        state: profileForm.state.trim() || null,
        pincode: profileForm.pincode.trim() || null,
        logo_url: profileForm.logo_url,
      });

      if (res.success) {
        showToast('PG Profile updated successfully!');
        await refreshPG();
      } else {
        showToast(res.error || 'Failed to update PG Profile', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error updating PG Profile', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  }

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
  const [billingSettings, setBillingSettings] = React.useState<{
    electricity_rate_per_unit: number | string;
    maintenance_charge: number | string;
  }>({
    electricity_rate_per_unit: 12,
    maintenance_charge: 500,
  });
  const [isSavingBilling, setIsSavingBilling] = React.useState(false);

  // --- Banking & Payment QR State ---
  const [banking, setBanking] = React.useState<{
    upi_id: string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    account_holder_name: string;
    payment_qr: string | null;
  }>({
    upi_id: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    payment_qr: null,
  });
  const [isSavingBanking, setIsSavingBanking] = React.useState(false);
  const qrFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // --- Change Password State ---
  const [currentPwd, setCurrentPwd] = React.useState('');
  const [newPwd, setNewPwd] = React.useState('');
  const [confirmPwd, setConfirmPwd] = React.useState('');
  const [pwdLoading, setPwdLoading] = React.useState(false);
  const [pwdSuccess, setPwdSuccess] = React.useState(false);

  // --- WhatsApp Message Templates State ---
  const DEFAULT_TEMPLATES = {
    bill_verified_message: `🧾 *Payment Verified & Official Bill — {pg_name}*\nDear *{tenant_name}*,\nYour payment of *Rs. {amount}* for *{month}* has been verified & marked paid.\nYour official rent bill and receipt is attached as a PDF above.\n\nThank you!\n— Team {pg_name}`,
    rent_reminder_message: `🔔 *Rent Due Reminder — {pg_name}*\nDear *{tenant_name}*,\nYour rent of *Rs. {amount}* for *{month}* is due on *{due_date}*.\nElectricity: *{units} units* (view details in app).\nPlease scan the QR code above or pay via UPI.\n\n— Team {pg_name}`,
  };

  const [waTemplates, setWaTemplates] = React.useState<{
    bill_verified_message: string;
    rent_reminder_message: string;
  }>({
    bill_verified_message: DEFAULT_TEMPLATES.bill_verified_message,
    rent_reminder_message: DEFAULT_TEMPLATES.rent_reminder_message,
  });
  const [isSavingTemplates, setIsSavingTemplates] = React.useState(false);

  async function loadWhatsAppTemplates() {
    const res = await apiGet<{ bill_verified_message: string; rent_reminder_message: string }>('/settings/whatsapp-templates');
    if (res.success && res.data) {
      setWaTemplates({
        bill_verified_message: res.data.bill_verified_message || DEFAULT_TEMPLATES.bill_verified_message,
        rent_reminder_message: res.data.rent_reminder_message || DEFAULT_TEMPLATES.rent_reminder_message,
      });
    }
  }

  async function handleSaveWhatsAppTemplates() {
    setIsSavingTemplates(true);
    const res = await apiPatch<{ bill_verified_message: string; rent_reminder_message: string }>(
      '/settings/whatsapp-templates',
      waTemplates
    );
    if (res.success) {
      showToast('WhatsApp message templates saved successfully!');
      if (res.data) setWaTemplates(res.data);
    } else {
      showToast(res.error || 'Failed to save message templates', 'error');
    }
    setIsSavingTemplates(false);
  }

  function handleResetTemplate(type: 'bill_verified_message' | 'rent_reminder_message') {
    setWaTemplates((prev) => ({
      ...prev,
      [type]: DEFAULT_TEMPLATES[type],
    }));
    showToast('Reset to recommended short template');
  }

  function insertTag(field: 'bill_verified_message' | 'rent_reminder_message', tag: string) {
    setWaTemplates((prev) => ({
      ...prev,
      [field]: prev[field] ? `${prev[field]} ${tag}` : tag,
    }));
  }

  function renderPreview(template: string) {
    const sample: Record<string, string> = {
      tenant_name: 'Rahul Sharma',
      room_number: '204',
      month: 'September 2026',
      amount: '8,504.00',
      due_date: '05/10/2026',
      units: '42',
      pg_name: pg?.name || 'Sagar PG Living',
      upi_id: banking.upi_id || 'sagarpg@upi',
    };
    let out = template || '';
    for (const [k, v] of Object.entries(sample)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return out;
  }

  React.useEffect(() => {
    loadWifiSettings();
    loadWhatsAppStatus();
    loadReminderSettings();
    loadBillingSettings();
    loadBankingSettings();
    loadWhatsAppTemplates();
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

  async function handleConnectWhatsApp(force = false) {
    setWaLoading(true);
    const res = await apiPost<WhatsAppStatusData>('/whatsapp/connect', { force });
    if (res.success && res.data) {
      setWaData(res.data);
      if (res.data.hasQr) {
        showToast('Live QR code generated! Scan with your phone.');
      } else if (res.data.status === 'connected') {
        showToast('WhatsApp connected successfully!');
      } else {
        showToast('WhatsApp connection initialized. Waiting for QR scan.');
      }
    } else {
      showToast(res.error || 'Failed to initialize WhatsApp', 'error');
    }
    setWaLoading(false);
  }

  async function handleResetWhatsApp() {
    setWaLoading(true);
    const res = await apiPost<WhatsAppStatusData>('/whatsapp/reset');
    if (res.success && res.data) {
      setWaData(res.data);
      showToast('Stale session purged. Fresh QR code generated.');
    } else {
      showToast(res.error || 'Failed to reset WhatsApp session', 'error');
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
    const payload = {
      rent_reminder_day: reminders.rent_reminder_day === '' ? 1 : Number(reminders.rent_reminder_day),
      rent_due_day: reminders.rent_due_day === '' ? 5 : Number(reminders.rent_due_day),
      late_fee_grace_days: reminders.late_fee_grace_days === '' ? 0 : Number(reminders.late_fee_grace_days),
      late_fee_paise: reminders.late_fee_paise === '' ? 0 : Number(reminders.late_fee_paise),
      electricity_reminder_enabled: Boolean(reminders.electricity_reminder_enabled),
    };
    const res = await apiPatch('/settings/reminders', payload);
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
    const rateNum = billingSettings.electricity_rate_per_unit === '' ? 0 : Number(billingSettings.electricity_rate_per_unit);
    const maintNum = billingSettings.maintenance_charge === '' ? 0 : Number(billingSettings.maintenance_charge);
    const res = await apiPatch('/settings/billing', {
      electricity_rate_per_unit_paise: Math.round(rateNum * 100),
      maintenance_charge_paise: Math.round(maintNum * 100),
    });
    if (res.success) {
      showToast('Billing rates and charges saved successfully');
    } else {
      showToast(res.error || 'Failed to save billing settings', 'error');
    }
    setIsSavingBilling(false);
  }

  // --- Banking & Payment QR ---
  async function loadBankingSettings() {
    const res = await apiGet<{
      upi_id: string;
      bank_name: string;
      account_number: string;
      ifsc_code: string;
      account_holder_name: string;
      payment_qr: string | null;
    }>('/settings/banking');

    if (res.success && res.data) {
      setBanking({
        upi_id: res.data.upi_id || '',
        bank_name: res.data.bank_name || '',
        account_number: res.data.account_number || '',
        ifsc_code: res.data.ifsc_code || '',
        account_holder_name: res.data.account_holder_name || '',
        payment_qr: res.data.payment_qr || null,
      });
      return;
    }

    // Graceful fallback to /pg if /settings/banking returned 404 / Endpoint not found
    try {
      const pgRes = await apiGet<{
        upi_id?: string | null;
        bank_name?: string | null;
        account_number?: string | null;
        ifsc_code?: string | null;
        account_holder_name?: string | null;
      }>('/pg');
      if (pgRes.success && pgRes.data) {
        setBanking((prev) => ({
          ...prev,
          upi_id: pgRes.data?.upi_id || '',
          bank_name: pgRes.data?.bank_name || '',
          account_number: pgRes.data?.account_number || '',
          ifsc_code: pgRes.data?.ifsc_code || '',
          account_holder_name: pgRes.data?.account_holder_name || '',
        }));
      }
    } catch (e) {
      console.warn('[Settings] Fallback to /pg failed:', e);
    }
  }

  async function handleSaveBanking() {
    setIsSavingBanking(true);
    const payload = {
      upi_id: banking.upi_id.trim() || null,
      bank_name: banking.bank_name.trim() || null,
      account_number: banking.account_number.trim() || null,
      ifsc_code: banking.ifsc_code.trim().toUpperCase() || null,
      account_holder_name: banking.account_holder_name.trim() || null,
      payment_qr: banking.payment_qr,
    };

    let res = await apiPatch<{
      upi_id: string;
      bank_name: string;
      account_number: string;
      ifsc_code: string;
      account_holder_name: string;
      payment_qr: string | null;
    }>('/settings/banking', payload);

    // If /settings/banking failed because endpoint is not found, fallback to saving via /pg
    if (!res.success && (res.error?.toLowerCase().includes('not found') || res.error?.includes('404'))) {
      const pgPayload = {
        upi_id: payload.upi_id,
        bank_name: payload.bank_name,
        account_number: payload.account_number,
        ifsc_code: payload.ifsc_code,
        account_holder_name: payload.account_holder_name,
      };
      const pgRes = await apiPatch('/pg', pgPayload);
      if (pgRes.success) {
        showToast('Banking & UPI details saved successfully! WhatsApp reminders will use these details.');
        setIsSavingBanking(false);
        return;
      }
    }

    if (res.success) {
      showToast('Banking details & Payment QR saved! WhatsApp reminders will now include these details.');
      if (res.data) setBanking(res.data);
    } else {
      showToast(res.error || 'Failed to save banking details', 'error');
    }
    setIsSavingBanking(false);
  }

  function handleQrFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WEBP)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 600;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setBanking((prev) => ({ ...prev, payment_qr: compressed }));
          showToast('Payment QR selected! Click "Save Banking Details" to apply.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="page-container" style={{ maxWidth: '1080px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: '6px' }}>Settings & Integrations</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', margin: 0 }}>
          Manage multi-floor Wi-Fi networks, WhatsApp bot automation, and automated reminders.
        </p>
      </div>

      {/* Property Code & Tenant Registration Link */}
      {pg && (
        <div style={{
          marginBottom: '24px',
          padding: '16px 20px',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: '#eff6ff',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Building2 size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                  {pg.name}
                </h2>
                {pg.code && (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    backgroundColor: '#e0e7ff',
                    color: '#3730a3',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}>
                    {pg.code}
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Share your property code or self-registration link so tenants are automatically onboarded into your PG.
              </p>
            </div>
          </div>

          {pg.code && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(pg.code || '');
                  showToast(`Copied PG Code: ${pg.code}`);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Copy size={14} />
                Copy Code ({pg.code})
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const link = `${window.location.origin}/register?pg=${encodeURIComponent(pg.code || '')}`;
                  navigator.clipboard.writeText(link);
                  showToast('Registration link copied to clipboard!');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} />
                Copy Registration Link
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={tabContainerStyle}>
        <button
          onClick={() => setActiveTab('profile')}
          style={activeTab === 'profile' ? activeTabStyle : inactiveTabStyle}
        >
          <Building2 size={18} />
          <span>PG Profile</span>
          {profileForm.logo_url && (
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success)',
                display: 'inline-block',
              }}
              title="Logo Active"
            />
          )}
        </button>

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
          onClick={() => {
            setActiveTab('templates');
            loadWhatsAppTemplates();
          }}
          style={activeTab === 'templates' ? activeTabStyle : inactiveTabStyle}
        >
          <MessageSquare size={18} />
          <span>Message Templates</span>
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
          onClick={() => setActiveTab('banking')}
          style={activeTab === 'banking' ? activeTabStyle : inactiveTabStyle}
        >
          <Landmark size={18} />
          <span>Banking & QR Code</span>
          {banking.payment_qr && (
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success)',
                display: 'inline-block',
              }}
              title="Payment QR Active"
            />
          )}
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

        <button
          onClick={() => setActiveTab('security')}
          style={activeTab === 'security' ? activeTabStyle : inactiveTabStyle}
        >
          <Lock size={18} />
          <span>Security</span>
        </button>
      </div>

      {/* TAB 0: PG PROFILE & BRANDING */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>PG Profile & Branding</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
              Manage your official property name, owner identity, contact details, and brand logo. All generated rent invoices, WhatsApp bills, and resident receipts automatically use these details.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '20px', alignItems: 'flex-start' }}>
            {/* Left Card: PG Logo & Branding Card */}
            <Card padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>
                  Property Logo
                </h3>
                {profileForm.logo_url && (
                  <Badge variant="success">Logo Active</Badge>
                )}
              </div>

              {/* Logo Preview Area */}
              <div style={{
                height: '160px',
                borderRadius: 'var(--radius-md)',
                border: '2px dashed var(--color-border)',
                backgroundColor: 'var(--color-bg-surface-alt)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {profileForm.logo_url ? (
                  <img
                    src={profileForm.logo_url}
                    alt="PG Logo Preview"
                    style={{
                      maxHeight: '120px',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      borderRadius: '4px',
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                    <div style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(15, 118, 110, 0.08)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Building2 size={28} />
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        No Logo Uploaded
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Invoices will display property initials
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden File Input */}
              <input
                type="file"
                ref={logoFileInputRef}
                accept="image/png,image/jpeg,image/jpg,image/webp"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />

              {/* Upload / Replace / Remove Buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoFileInputRef.current?.click()}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Upload size={14} />
                  {profileForm.logo_url ? 'Replace Logo' : 'Upload Logo'}
                </Button>

                {profileForm.logo_url && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleRemoveLogo}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    title="Remove Logo"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>

              {/* Helper specs */}
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5, borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                <div>• Supported: PNG, JPG, JPEG, WEBP</div>
                <div>• Maximum file size: 2MB</div>
                <div>• Auto-optimized for crisp A4 invoice printing</div>
              </div>

              {/* Property Code Section */}
              {pg?.code && (
                <div style={{
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--color-border)',
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>PROPERTY CODE</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                      {pg.code}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(pg.code || '');
                      showToast(`Copied PG Code: ${pg.code}`);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 8px' }}
                  >
                    <Copy size={13} /> Copy
                  </Button>
                </div>
              )}
            </Card>

            {/* Right Card: Main Profile Form */}
            <Card padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>
                Business & Contact Details
              </h3>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <FormField label="Owner's Name" required hint="Printed as 'Owner: [Name]' on invoice headers">
                  <Input
                    placeholder="e.g. Rajesh Kumar"
                    value={profileForm.owner_name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, owner_name: e.target.value }))}
                  />
                </FormField>

                <FormField label="PG / Property Name" required hint="Trading title on invoice and resident portal">
                  <Input
                    placeholder="e.g. Sunrise Residency"
                    value={profileForm.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, name: e.target.value }))}
                  />
                </FormField>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <FormField label="Tagline / Subtitle" hint="e.g. PREMIUM PG LIVING">
                  <Input
                    placeholder="e.g. PREMIUM PG LIVING"
                    value={profileForm.tagline}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, tagline: e.target.value }))}
                  />
                </FormField>

                <FormField label="Contact Phone Number" required hint="Printed for resident inquiries">
                  <Input
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={profileForm.phone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                  />
                </FormField>
              </div>

              <FormField label="Official Email Address" hint="Printed on invoices for resident correspondence">
                <Input
                  type="email"
                  placeholder="e.g. sunriseresidency@gmail.com"
                  value={profileForm.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, email: e.target.value }))}
                />
              </FormField>

              {/* Complete Address */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                  Property Location & Address
                </h4>

                <FormField label="Complete Street Address" required hint="e.g. 123, 5th Cross, Koramangala">
                  <Input
                    placeholder="e.g. 123, 5th Cross, Koramangala"
                    value={profileForm.address}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, address: e.target.value }))}
                  />
                </FormField>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  <FormField label="City">
                    <Input
                      placeholder="e.g. Bengaluru"
                      value={profileForm.city}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, city: e.target.value }))}
                    />
                  </FormField>

                  <FormField label="State">
                    <Input
                      placeholder="e.g. Karnataka"
                      value={profileForm.state}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, state: e.target.value }))}
                    />
                  </FormField>

                  <FormField label="Pincode">
                    <Input
                      placeholder="e.g. 560034"
                      value={profileForm.pincode}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm(p => ({ ...p, pincode: e.target.value }))}
                    />
                  </FormField>
                </div>
              </div>

              {/* Save Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <Button
                  onClick={handleSaveProfile}
                  isLoading={isSavingProfile}
                  style={{ minWidth: '160px' }}
                >
                  <Check size={16} /> Save Changes
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

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
          {/* 24/7 Background Cloud Service Notice */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 18px',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <CheckCircle2 size={20} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>24/7 Cloud Background Service:</strong> Once connected, your WhatsApp session runs continuously in the background on the server. You <strong>do not need to keep this browser tab or app open</strong> for automated rent reminders, invoices, or receipts to be sent on schedule.
            </div>
          </div>

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
                  <Button onClick={() => handleConnectWhatsApp(true)} isLoading={waLoading}>
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
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      setConnectionMethod('qr');
                      if (!waData.qr) handleConnectWhatsApp(true);
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={qrWrapperStyle}>
                      {waLoading ? (
                        <div style={{ height: '240px', width: '240px', maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                          <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '0 16px' }}>
                            Generating live QR code...
                          </p>
                        </div>
                      ) : waData.qr ? (
                        <img
                          src={waData.qr}
                          alt="WhatsApp Connection QR Code"
                          style={{ maxWidth: '100%', width: '240px', height: '240px', display: 'block', borderRadius: 'var(--radius-md)' }}
                        />
                      ) : (
                        <div style={{ height: '240px', width: '240px', maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                          <QrCode size={48} style={{ color: 'var(--color-text-muted)' }} />
                          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '0 16px' }}>
                            Click "Generate QR Code" to create a live QR code.
                          </p>
                          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column', width: '100%', padding: '0 16px' }}>
                            <Button variant="secondary" onClick={() => handleConnectWhatsApp(true)} isLoading={waLoading} style={{ fontSize: 'var(--font-size-xs)', width: '100%' }}>
                              Generate QR Code
                            </Button>
                            <Button variant="secondary" onClick={handleResetWhatsApp} isLoading={waLoading} style={{ fontSize: 'var(--font-size-xs)', width: '100%', opacity: 0.8 }}>
                              Reset Stale Session
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
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

                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Button variant="secondary" onClick={() => handleConnectWhatsApp(true)} isLoading={waLoading}>
                        <RefreshCw size={14} /> Refresh QR Code
                      </Button>
                      <Button variant="secondary" onClick={handleResetWhatsApp} isLoading={waLoading} style={{ color: 'var(--color-warning)' }}>
                        Reset & Fresh QR
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', alignItems: 'flex-start' }}>
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
          {/* Template Quick Jump Card */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(14, 165, 233, 0.1)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MessageSquare size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                  Customize Automated Message Captions
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  Keep your verification messages short with attached PDF bills, and reminders with QR codes.
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveTab('templates');
                loadWhatsAppTemplates();
              }}
            >
              Configure Templates →
            </Button>
          </div>

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

      {/* TAB: WHATSAPP MESSAGE TEMPLATES */}
      {activeTab === 'templates' && (
        <div style={{ maxWidth: '820px', display: 'grid', gap: '24px' }}>
          {/* Header Info Banner */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'rgba(14, 165, 233, 0.08)',
              border: '1px solid rgba(14, 165, 233, 0.25)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
            }}
          >
            <MessageSquare size={22} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>Concise Automated Messaging:</strong> Keep your messages short, polite, and essential.
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li><strong>Bill & Payment Verification:</strong> Official A4 <strong>PDF invoice/receipt is sent as an attachment</strong>. The message below acts as its short caption.</li>
                <li><strong>Rent Due Reminders:</strong> Attached with your <strong>UPI QR code image</strong> so tenants can scan and pay immediately.</li>
              </ul>
            </div>
          </div>

          {/* Template 1: Verified Bill & Official Receipt */}
          <Card padding="lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                    1. Verified Bill & Receipt (PDF Document Caption)
                  </h3>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '4px', margin: 0 }}>
                  Sent automatically when you verify a tenant payment or click "Send Bill". Official PDF is attached above.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResetTemplate('bill_verified_message')}
                style={{ fontSize: '12px' }}
              >
                Reset to Default
              </Button>
            </div>

            {/* Placeholder Chips */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                CLICK TO INSERT VARIABLE:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { tag: '{tenant_name}', label: 'Tenant Name' },
                  { tag: '{month}', label: 'Billing Month' },
                  { tag: '{amount}', label: 'Amount' },
                  { tag: '{room_number}', label: 'Room No' },
                  { tag: '{pg_name}', label: 'PG Name' },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertTag('bill_verified_message', item.tag)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    +{item.label} <code style={{ opacity: 0.7 }}>{item.tag}</code>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <textarea
              rows={6}
              value={waTemplates.bill_verified_message}
              onChange={(e) => setWaTemplates((prev) => ({ ...prev, bill_verified_message: e.target.value }))}
              placeholder="Enter short verified bill message..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            {/* Live WhatsApp Preview */}
            <div style={{ marginTop: '14px', padding: '14px', borderRadius: 'var(--radius-md)', backgroundColor: '#e5ddd5', border: '1px solid #d1d7db' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#4b5563', marginBottom: '8px', letterSpacing: '0.05em' }}>
                LIVE WHATSAPP PREVIEW:
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '10px 14px',
                maxWidth: '420px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                color: '#111827',
                fontSize: '13px',
                lineHeight: 1.5,
              }}>
                {/* PDF Document Attachment Card Mock */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  backgroundColor: '#f0f2f5',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '8px',
                }}>
                  <div style={{
                    width: '34px',
                    height: '38px',
                    borderRadius: '4px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '9px',
                    flexShrink: 0,
                  }}>
                    PDF
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Bill-2026-09-Rahul_Sharma.pdf
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      1 Page • 128 KB
                    </div>
                  </div>
                </div>

                {/* Rendered Caption Text */}
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {renderPreview(waTemplates.bill_verified_message)}
                </div>
              </div>
            </div>
          </Card>

          {/* Template 2: Rent Due Reminder */}
          <Card padding="lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QrCode size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                    2. Rent Due Reminder (QR Code Image Caption)
                  </h3>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '4px', margin: 0 }}>
                  Sent to tenants on their rent cycle date. Your UPI payment QR code is attached above the message.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResetTemplate('rent_reminder_message')}
                style={{ fontSize: '12px' }}
              >
                Reset to Default
              </Button>
            </div>

            {/* Placeholder Chips */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                CLICK TO INSERT VARIABLE:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { tag: '{tenant_name}', label: 'Tenant Name' },
                  { tag: '{month}', label: 'Month' },
                  { tag: '{amount}', label: 'Amount' },
                  { tag: '{due_date}', label: 'Due Date' },
                  { tag: '{units}', label: 'Electricity Units' },
                  { tag: '{room_number}', label: 'Room No' },
                  { tag: '{pg_name}', label: 'PG Name' },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertTag('rent_reminder_message', item.tag)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    +{item.label} <code style={{ opacity: 0.7 }}>{item.tag}</code>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <textarea
              rows={6}
              value={waTemplates.rent_reminder_message}
              onChange={(e) => setWaTemplates((prev) => ({ ...prev, rent_reminder_message: e.target.value }))}
              placeholder="Enter short reminder message..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            {/* Live WhatsApp Preview */}
            <div style={{ marginTop: '14px', padding: '14px', borderRadius: 'var(--radius-md)', backgroundColor: '#e5ddd5', border: '1px solid #d1d7db' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#4b5563', marginBottom: '8px', letterSpacing: '0.05em' }}>
                LIVE WHATSAPP PREVIEW:
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '10px 14px',
                maxWidth: '420px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                color: '#111827',
                fontSize: '13px',
                lineHeight: 1.5,
              }}>
                {/* QR Code Image Mock */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px dashed #0284c7',
                  marginBottom: '8px',
                }}>
                  <QrCode size={28} style={{ color: '#0f2942', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#0f2942' }}>
                      📸 UPI QR Code Image Attached
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      Scan & Pay via GPay / PhonePe / Paytm / BHIM
                    </div>
                  </div>
                </div>

                {/* Rendered Caption Text */}
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {renderPreview(waTemplates.rent_reminder_message)}
                </div>
              </div>
            </div>
          </Card>

          {/* Action Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px' }}>
            <Button onClick={handleSaveWhatsAppTemplates} isLoading={isSavingTemplates}>
              Save Message Templates
            </Button>
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
            Configure when rent and bill reminders are automatically triggered for tenants.
          </p>

          <FormField label="Rent Reminder Notification Day" hint="Day of the month to send early reminder (1-28)">
            <Input
              type="number"
              min={1}
              max={28}
              value={reminders.rent_reminder_day}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const val = e.target.value;
                setReminders((prev) => ({ ...prev, rent_reminder_day: val }));
              }}
            />
          </FormField>

          <FormField label="Rent Due Day" hint="Standard monthly rent due date (1-28)">
            <Input
              type="number"
              min={1}
              max={28}
              value={reminders.rent_due_day}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const val = e.target.value;
                setReminders((prev) => ({ ...prev, rent_due_day: val }));
              }}
            />
          </FormField>

          <div style={{ marginTop: '24px' }}>
            <Button onClick={handleSaveReminders}>Save Reminder Settings</Button>
          </div>

          {/* Smart Anti-Ban Day Distribution Notice */}
          <div style={{
            marginTop: '20px',
            backgroundColor: 'var(--color-primary-light)',
            border: '1px solid #A7F3D0',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            color: '#065F46',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🛡️ Anti-Ban Smart Spacing Active
            </div>
            <div>
              • <strong>Daytime Hours:</strong> Automated reminders are only dispatched between <strong>06:00 AM and 09:00 PM IST</strong>.<br />
              • <strong>5–10 Min Gap:</strong> Tenant messages are spaced out with a <strong>5 to 10 minute gap</strong> across the day rather than blasted at once.<br />
              • <strong>Once Per Day:</strong> Each resident is strictly limited to at most 1 reminder per day to ensure clean, compliant WhatsApp messaging.
            </div>
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      setBillingSettings((prev) => ({ ...prev, electricity_rate_per_unit: val }));
                    }}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      setBillingSettings((prev) => ({ ...prev, maintenance_charge: val }));
                    }}
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

      {/* TAB: BANKING & PAYMENT QR */}
      {activeTab === 'banking' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Banking & Payment QR Settings</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
              Configure your UPI ID, bank account, and Payment QR code. These will be automatically attached to WhatsApp rent reminders & invoices, and displayed on the resident portal for payment and UTR verification.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', alignItems: 'start' }}>
            {/* Left Card: Bank & UPI Form */}
            <Card padding="lg">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
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
                  <Landmark size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>PG Bank & UPI Details</h3>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    Payment options presented to residents
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FormField label="UPI ID / VPA">
                  <Input
                    placeholder="e.g. sagarpg@okaxis or 9876543210@upi"
                    value={banking.upi_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBanking((prev) => ({ ...prev, upi_id: e.target.value }))}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Residents can copy this UPI ID to pay instantly from GPay, PhonePe, or Paytm.
                  </span>
                </FormField>

                <FormField label="Bank Name">
                  <Input
                    placeholder="e.g. HDFC Bank, State Bank of India"
                    value={banking.bank_name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBanking((prev) => ({ ...prev, bank_name: e.target.value }))}
                  />
                </FormField>

                <FormField label="Account Number">
                  <Input
                    placeholder="e.g. 50100456789012"
                    value={banking.account_number}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBanking((prev) => ({ ...prev, account_number: e.target.value }))}
                  />
                </FormField>

                <FormField label="IFSC Code">
                  <Input
                    placeholder="e.g. HDFC0001234"
                    value={banking.ifsc_code}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBanking((prev) => ({ ...prev, ifsc_code: e.target.value.toUpperCase() }))}
                    style={{ textTransform: 'uppercase' }}
                  />
                </FormField>

                <FormField label="Beneficiary / Account Holder Name">
                  <Input
                    placeholder="e.g. Sagar PG Accommodations"
                    value={banking.account_holder_name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBanking((prev) => ({ ...prev, account_holder_name: e.target.value }))}
                  />
                </FormField>

                <div style={{ marginTop: '12px' }}>
                  <Button onClick={handleSaveBanking} isLoading={isSavingBanking} fullWidth>
                    <Check size={16} /> Save Banking Details
                  </Button>
                </div>
              </div>
            </Card>

            {/* Right Card: Payment QR Code & Live WhatsApp Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Card padding="lg">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                      <QrCode size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Payment QR Code</h3>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        Attached to WhatsApp rent reminders & bills
                      </p>
                    </div>
                  </div>
                  {banking.payment_qr ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="neutral">No QR Uploaded</Badge>
                  )}
                </div>

                <input
                  type="file"
                  ref={qrFileInputRef}
                  onChange={handleQrFileUpload}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: 'none' }}
                />

                {banking.payment_qr ? (
                  <div style={{ textAlign: 'center', padding: '16px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '12px',
                      backgroundColor: '#ffffff',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      marginBottom: '16px',
                    }}>
                      <img
                        src={banking.payment_qr}
                        alt="Payment QR Code"
                        style={{ width: '200px', height: '200px', objectFit: 'contain', display: 'block', borderRadius: '4px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => qrFileInputRef.current?.click()}>
                        <Upload size={14} /> Change QR Image
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setBanking((prev) => ({ ...prev, payment_qr: null }))}>
                        <Trash2 size={14} /> Remove QR
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => qrFileInputRef.current?.click()}
                    style={{
                      padding: '36px 20px',
                      textAlign: 'center',
                      border: '2px dashed var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      cursor: 'pointer',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}>
                      <Upload size={22} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: '4px' }}>
                      Click to Upload Payment QR Code
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', maxWidth: '300px', margin: '0 auto' }}>
                      Upload your GPay, PhonePe, Paytm, or BHIM QR code image. PNG, JPG or WEBP accepted.
                    </div>
                  </div>
                )}
              </Card>

              {/* WhatsApp Message Preview Card */}
              <Card padding="lg" style={{ backgroundColor: '#0B141A', color: '#E9EDEF', border: 'none', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#25D366' }} />
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8696A0', fontWeight: 600 }}>
                    WhatsApp Tenant Reminder Simulation
                  </span>
                </div>

                <div style={{
                  backgroundColor: '#202C33',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  color: '#D1D7DB',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}>
                  {banking.payment_qr && (
                    <div style={{ marginBottom: '10px', textAlign: 'center' }}>
                      <img
                        src={banking.payment_qr}
                        alt="QR Attachment"
                        style={{ width: '130px', height: '130px', objectFit: 'contain', borderRadius: '6px', backgroundColor: '#ffffff', padding: '4px' }}
                      />
                      <div style={{ fontSize: '10px', color: '#8696A0', marginTop: '4px' }}>[Attached Image]</div>
                    </div>
                  )}
                  <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#FFFFFF' }}>🔔 Sagar PG — Rent Payment Reminder</p>
                  <p style={{ margin: '0 0 6px' }}>Dear <strong>Rahul Sharma</strong>,</p>
                  <p style={{ margin: '0 0 6px' }}>This is a friendly reminder that your rent for <strong>October 2026</strong> is due.</p>
                  <p style={{ margin: '0 0 6px' }}>
                    👤 <strong>Tenant:</strong> Rahul Sharma<br />
                    🏠 <strong>Room:</strong> Room 202<br />
                    💰 <strong>Amount Due:</strong> ₹8,500<br />
                    📅 <strong>Due Date:</strong> 05-10-2026
                  </p>
                  <div style={{ borderTop: '1px solid #2A3942', paddingTop: '6px', margin: '6px 0' }}>
                    <strong>Payment Options:</strong><br />
                    {banking.upi_id ? `• UPI ID: ${banking.upi_id}` : '• UPI ID: [Configured above]'}<br />
                    {banking.account_number ? (
                      <>
                        • Bank: {banking.bank_name || 'Bank'}<br />
                        • Account No: {banking.account_number}<br />
                        • IFSC: {banking.ifsc_code || 'IFSC'}<br />
                        {banking.account_holder_name && <>• Name: {banking.account_holder_name}<br /></>}
                      </>
                    ) : null}
                    {banking.payment_qr && (
                      <span style={{ color: '#25D366' }}>📸 Payment QR code is attached above. Scan & pay via any UPI app.<br /></span>
                    )}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#8696A0' }}>
                    After paying, enter your UTR / Reference ID in the resident portal so we can verify and mark it as paid.
                  </p>
                </div>
              </Card>
            </div>
          </div>
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

      {/* TAB 6: SECURITY — Change Password */}
      {activeTab === 'security' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Security</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
              Change your account password.
            </p>
          </div>

          <Card padding="lg" style={{ maxWidth: '500px' }}>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={18} /> Change Password
            </h3>

            {pwdSuccess && (
              <div style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Password changed successfully!
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault();
              setPwdSuccess(false);

              if (newPwd.length < 8) {
                showToast('New password must be at least 8 characters', 'error');
                return;
              }
              if (newPwd !== confirmPwd) {
                showToast('Passwords do not match', 'error');
                return;
              }

              setPwdLoading(true);
              const res = await apiPost('/auth/change-password', {
                currentPassword: currentPwd,
                newPassword: newPwd,
              });
              setPwdLoading(false);

              if (res.success) {
                setPwdSuccess(true);
                setCurrentPwd('');
                setNewPwd('');
                setConfirmPwd('');
                showToast('Password changed successfully');
              } else {
                showToast(res.error || 'Failed to change password', 'error');
              }
            }}>
              <FormField label="Current Password" required>
                <Input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPwd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPwd(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="New Password" required>
                <Input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={newPwd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPwd(e.target.value)}
                  minLength={8}
                  required
                />
              </FormField>

              <FormField label="Confirm New Password" required>
                <Input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPwd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPwd(e.target.value)}
                  minLength={8}
                  required
                />
              </FormField>

              <Button type="submit" fullWidth isLoading={pwdLoading} style={{ marginTop: '8px' }}>
                {pwdLoading ? 'Changing...' : 'Change Password'}
              </Button>
            </form>
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
  paddingBottom: '4px',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
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
  flexShrink: 0,
  whiteSpace: 'nowrap',
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
  flexShrink: 0,
  whiteSpace: 'nowrap',
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
  maxWidth: '100%',
  boxSizing: 'border-box',
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
  fontSize: 'clamp(20px, 6vw, 28px)',
  fontWeight: 700,
  letterSpacing: '3px',
  fontFamily: 'monospace',
  color: 'var(--color-primary)',
  wordBreak: 'break-all',
};

const advisoryBoxStyle: React.CSSProperties = {
  padding: '14px 18px',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-warning-light)',
  border: '1px solid #FDE68A',
};
