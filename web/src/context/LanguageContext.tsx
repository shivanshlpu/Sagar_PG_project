import React, { createContext, useContext, useState } from 'react';

export type Language = 'en' | 'hi';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // TopBar & Brand
    'app.title': 'PG Management Platform',
    'app.admin_portal': 'Admin Portal',
    'app.tenant_portal': 'Tenant Portal',
    'search.placeholder': 'Search tenants, rooms, payments...',
    'ai.button': 'PG AI',
    'notifications': 'Notifications',
    'profile': 'Profile',
    'logout': 'Logout',

    // Navigation Items
    'nav.home': 'Home',
    'nav.tenants': 'Tenants',
    'nav.rooms': 'Rooms & Beds',
    'nav.rent': 'Rent Tracking',
    'nav.electricity': 'Electricity Bills',
    'nav.announcements': 'Announcements',
    'nav.assets': 'Assets',
    'nav.reports': 'Reports & Audit',
    'nav.settings': 'PG Settings',
    'nav.payments': 'Payments',
    'nav.complaints': 'Complaints',
    'nav.wifi': 'Wi-Fi & Contacts',
    'nav.wifi_short': 'Wi-Fi',
    'nav.notices': 'Notices',
    'nav.alerts': 'Alerts',
    'nav.more': 'More',

    // Settings
    'settings.title': 'PG Settings',
    'settings.subtitle': 'Manage Wi-Fi networks, WhatsApp bot, automated rent reminders & display preferences',
    'settings.tab.wifi': 'Wi-Fi Networks',
    'settings.tab.whatsapp': 'WhatsApp Integration',
    'settings.tab.reminders': 'Rent & Billing Reminders',
    'settings.tab.appearance': 'Appearance & Theme',
    'settings.theme.title': 'Interface Theme',
    'settings.theme.subtitle': 'Choose how the PG platform looks for you',
    'settings.theme.light': 'Light Mode',
    'settings.theme.dark': 'Dark Mode',
    'settings.theme.light_desc': 'Default clean light appearance',
    'settings.theme.dark_desc': 'High-contrast dark mode for low-light comfort',
    'settings.language.title': 'Language (भाषा)',
    'settings.language.subtitle': 'Switch between English and Hindi across the portal',

    // Common Actions
    'action.save': 'Save Changes',
    'action.cancel': 'Cancel',
    'action.confirm': 'Confirm',
    'action.delete': 'Delete',
    'action.edit': 'Edit',
    'action.add': 'Add New',
    'action.back': 'Back',
    'action.next': 'Next Step',
    'action.close': 'Close',
    'action.filter': 'Filter',
    'action.export': 'Export',
    'action.print': 'Print',
    'action.view': 'View',
    'action.search': 'Search',

    // Statuses
    'status.active': 'Active',
    'status.inactive': 'Inactive',
    'status.vacant': 'Vacant',
    'status.occupied': 'Occupied',
    'status.maintenance': 'Maintenance',
    'status.paid': 'Paid',
    'status.pending': 'Pending',
    'status.overdue': 'Overdue',
    'status.submitted': 'Submitted',
    'status.verified': 'Verified',
    'status.rejected': 'Rejected',
  },
  hi: {
    // TopBar & Brand
    'app.title': 'पीजी प्रबंधन मंच',
    'app.admin_portal': 'एडमिन पोर्टल',
    'app.tenant_portal': 'किरायेदार पोर्टल',
    'search.placeholder': 'किरायेदार, कमरे, भुगतान खोजें...',
    'ai.button': 'पीजी एआई',
    'notifications': 'सूचनाएं',
    'profile': 'मेरी प्रोफाइल',
    'logout': 'लॉगआउट',

    // Navigation Items
    'nav.home': 'होम',
    'nav.tenants': 'किरायेदार',
    'nav.rooms': 'कमरे और बिस्तर',
    'nav.rent': 'किराया ट्रैकिंग',
    'nav.electricity': 'बिजली बिल',
    'nav.announcements': 'सूचनाएं',
    'nav.assets': 'सामान व संपत्ति',
    'nav.reports': 'रिपोर्ट और ऑडिट',
    'nav.settings': 'पीजी सेटिंग्स',
    'nav.payments': 'भुगतान',
    'nav.complaints': 'शिकायतें',
    'nav.wifi': 'वाई-फाई और संपर्क',
    'nav.wifi_short': 'वाई-फाई',
    'nav.notices': 'सूचनाएं',
    'nav.alerts': 'अलर्ट',
    'nav.more': 'अन्य विकल्प',

    // Settings
    'settings.title': 'पीजी सेटिंग्स',
    'settings.subtitle': 'वाई-फाई, व्हाट्सएप बॉट, किराया रिमाइंडर और थीम सेटिंग्स प्रबंधित करें',
    'settings.tab.wifi': 'वाई-फाई नेटवर्क',
    'settings.tab.whatsapp': 'व्हाट्सएप एकीकरण',
    'settings.tab.reminders': 'किराया रिमाइंडर',
    'settings.tab.appearance': 'रूप-रंग और थीम',
    'settings.theme.title': 'इंटरफ़ेस थीम (Dark Mode)',
    'settings.theme.subtitle': 'चुनें कि आपके लिए पीजी ऐप का रूप कैसा दिखे',
    'settings.theme.light': 'लाइट मोड (Light)',
    'settings.theme.dark': 'डार्क मोड (Dark)',
    'settings.theme.light_desc': 'साफ और उजला डिफ़ॉल्ट लुक',
    'settings.theme.dark_desc': 'आंखों के लिए आरामदायक उच्च कंट्रास्ट डार्क लुक',
    'settings.language.title': 'भाषा (Language)',
    'settings.language.subtitle': 'पोर्टल पर हिंदी और अंग्रेजी के बीच बदलें',

    // Common Actions
    'action.save': 'बदलाव सहेजें',
    'action.cancel': 'रद्द करें',
    'action.confirm': 'पुष्टि करें',
    'action.delete': 'हटाएं',
    'action.edit': 'संपादित करें',
    'action.add': 'नया जोड़ें',
    'action.back': 'पीछे',
    'action.next': 'आगे बढ़ें',
    'action.close': 'बंद करें',
    'action.filter': 'फ़िल्टर करें',
    'action.export': 'निर्यात करें',
    'action.print': 'प्रिंट करें',
    'action.view': 'देखें',
    'action.search': 'खोजें',

    // Statuses
    'status.active': 'सक्रिय',
    'status.inactive': 'निष्क्रिय',
    'status.vacant': 'खाली',
    'status.occupied': 'भरा हुआ',
    'status.maintenance': 'रखरखाव में',
    'status.paid': 'भुगतान किया गया',
    'status.pending': 'लंबित',
    'status.overdue': 'अतिदेय (बकाया)',
    'status.submitted': 'जमा किया गया',
    'status.verified': 'सत्यापित',
    'status.rejected': 'अस्वीकृत',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language') as Language;
    return saved === 'hi' ? 'hi' : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  const t = (key: string, fallback?: string): string => {
    const currentDict = translations[language];
    if (currentDict && currentDict[key]) {
      return currentDict[key];
    }
    // Fallback to English
    if (translations.en[key]) {
      return translations.en[key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
