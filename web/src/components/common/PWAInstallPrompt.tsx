import { useEffect, useState } from 'react';
import { Download, X, Smartphone, Check, Share, PlusSquare } from 'lucide-react';
import { Button } from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt({ forceOpen = false, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const { language } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('pwa_installed') === 'true' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as any).standalone)
    );
  });

  useEffect(() => {
    // Check if already in standalone mode (PWA installed)
    if (
      localStorage.getItem('pwa_installed') === 'true' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone
    ) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Check if user dismissed prompt recently (within 3 days)
      const dismissedTime = localStorage.getItem('pwa_prompt_dismissed_at');
      if (!dismissedTime || Date.now() - parseInt(dismissedTime, 10) > 3 * 24 * 60 * 60 * 1000) {
        setIsOpen(true);
      }
    };

    const appInstalledHandler = () => {
      localStorage.setItem('pwa_installed', 'true');
      setIsInstalled(true);
      setIsOpen(false);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', appInstalledHandler);

    // If iOS and not dismissed recently, show iOS guide
    if (isIosDevice) {
      const dismissedTime = localStorage.getItem('pwa_prompt_dismissed_at');
      if (!dismissedTime || Date.now() - parseInt(dismissedTime, 10) > 3 * 24 * 60 * 60 * 1000) {
        setIsOpen(true);
      }
    }

    const showHandler = () => {
      if (!localStorage.getItem('pwa_installed')) {
        setIsOpen(true);
      }
    };
    window.addEventListener('show-pwa-install-prompt', showHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', appInstalledHandler);
      window.removeEventListener('show-pwa-install-prompt', showHandler);
    };
  }, []);

  useEffect(() => {
    if (forceOpen && !isInstalled) {
      setIsOpen(true);
    }
  }, [forceOpen, isInstalled]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        localStorage.setItem('pwa_installed', 'true');
        window.dispatchEvent(new Event('appinstalled'));
        setIsInstalled(true);
        setIsOpen(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    setIsOpen(false);
    if (onClose) onClose();
  };

  if (!isOpen || isInstalled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 10005,
        animation: 'fadeIn 180ms ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div
        className="modal-dialog-responsive"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          width: '100%',
          maxWidth: '480px',
          borderRadius: '16px 16px 0 0',
          padding: '24px 20px',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(15, 118, 110, 0.2)',
            }}>
              <Smartphone size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, lineHeight: 1.2 }}>
                {language === 'hi' ? 'सागर पीजी ऐप डाउनलोड करें' : 'Install Sagar PG App'}
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                {language === 'hi' ? 'फोन पर तेज़ और आसान अनुभव' : 'Faster access right from your phone'}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: '4px',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Features list */}
        <div style={{
          backgroundColor: 'var(--color-bg-surface-alt)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: 'var(--font-size-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <span>{language === 'hi' ? 'किराया व बिजली बिल की तुरंत जानकारी' : 'Instant rent & electricity dues updates'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <span>{language === 'hi' ? 'गेट व वाई-फाई पासवर्ड तुरंत देखें' : 'Instant Wi-Fi & gate emergency contacts'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <span>{language === 'hi' ? '24/7 पीजी एआई सहायक से तुरंत बातचीत' : '24/7 Voice & text PG AI assistant'}</span>
          </div>
        </div>

        {/* iOS installation guide */}
        {isIOS ? (
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--color-primary-light)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(15, 118, 110, 0.2)',
            marginBottom: '16px',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.6,
          }}>
            <p style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
              {language === 'hi' ? 'iPhone पर इंस्टॉल कैसे करें:' : 'To install on iPhone / iPad:'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              1. {language === 'hi' ? 'नीचे सफारी में' : 'Tap the'} <Share size={14} style={{ color: 'var(--color-primary)' }} /> <strong>Share</strong> {language === 'hi' ? 'बटन दबाएं' : 'button'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              2. <PlusSquare size={14} style={{ color: 'var(--color-primary)' }} /> <strong>{language === 'hi' ? "'Add to Home Screen' चुनें" : "'Add to Home Screen'"}</strong>
            </div>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            variant="secondary"
            onClick={handleDismiss}
            style={{ flex: 1 }}
          >
            {language === 'hi' ? 'बाद में' : 'Maybe Later'}
          </Button>

          {!isIOS && deferredPrompt && (
            <Button
              onClick={handleInstallClick}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Download size={16} />
              <span>{language === 'hi' ? 'ऐप इंस्टॉल करें' : 'Install App'}</span>
            </Button>
          )}

          {isIOS && (
            <Button
              onClick={handleDismiss}
              style={{ flex: 1 }}
            >
              {language === 'hi' ? 'समझ गया' : 'Got it!'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
