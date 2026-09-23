import React from 'react';
import { apiPost } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import {
  Bot,
  X,
  Send,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Loader2,
  Building2,
  CreditCard,
  DoorOpen,
  Users,
  MessageSquareWarning,
  Wifi,
} from 'lucide-react';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  time: string;
}

type Language = 'hinglish' | 'hi' | 'en';

export function AIAssistantModal({ isOpen, onClose }: AIAssistantModalProps) {
  const { user } = useAuth();
  if (!isOpen || user?.role !== 'admin') return null;
  return <AIAssistantModalContent key={user?.pgId || 'default'} onClose={onClose} />;
}

function AIAssistantModalContent({ onClose }: { onClose: () => void }) {
  const { pg, pgName } = useAuth();
  const activePgName = pg?.name || pgName || 'My PG';

  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Namaste! Main "${activePgName}" ka AI Sahayak hoon. Niche diye gaye kisi bhi sawal par click karein ya apna sawal likhein / bolein:`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = React.useState('');
  const [language, setLanguage] = React.useState<Language>('hinglish');
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = React.useState<string | null>(null);
  const [isListening, setIsListening] = React.useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const recognitionRef = React.useRef<any>(null);

  // Stop speech helper
  const stopSpeaking = React.useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCurrentlySpeakingId(null);
  }, []);

  // Auto scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Clean up speech and recognition on unmount
  React.useEffect(() => {
    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [stopSpeaking]);

  // Speech Recognition setup (voice to text)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(transcript);
          handleSend(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [language]);

  // Preset question chips based on language
  const presetQuestions: Array<{ label: string; icon: any; query: string }> =
    language === 'hi'
      ? [
          { label: 'बकाया किराया', icon: CreditCard, query: 'किसका किराया बकाया है?' },
          { label: 'खाली कमरे', icon: DoorOpen, query: 'कितने कमरे खाली हैं?' },
          { label: 'कुल किराएदार', icon: Users, query: 'कुल कितने किराएदार हैं?' },
          { label: 'पेंडिंग शिकायतें', icon: MessageSquareWarning, query: 'कोई शिकायत पेंडिंग है क्या?' },
          { label: 'WiFi पासवर्ड', icon: Wifi, query: 'WiFi का पासवर्ड क्या है?' },
          { label: 'PG के नियम', icon: Building2, query: 'PG के नियम क्या हैं?' },
        ]
      : language === 'hinglish'
      ? [
          { label: 'Pending Rent', icon: CreditCard, query: 'Kiska rent pending hai?' },
          { label: 'Khali Rooms', icon: DoorOpen, query: 'Kitne rooms khali hain?' },
          { label: 'Active Tenants', icon: Users, query: 'Total active tenants kitne hain?' },
          { label: 'Complaints', icon: MessageSquareWarning, query: 'Koi complaint pending hai kya?' },
          { label: 'WiFi Details', icon: Wifi, query: 'WiFi password kya hai?' },
          { label: 'PG Rules', icon: Building2, query: 'PG rules kya hain?' },
        ]
      : [
          { label: 'Pending Rent', icon: CreditCard, query: 'Whose rent is pending?' },
          { label: 'Vacant Rooms', icon: DoorOpen, query: 'How many rooms are vacant?' },
          { label: 'Total Tenants', icon: Users, query: 'How many active tenants?' },
          { label: 'Open Complaints', icon: MessageSquareWarning, query: 'Are there any pending complaints?' },
          { label: 'WiFi Info', icon: Wifi, query: 'What is the WiFi password?' },
          { label: 'PG Rules', icon: Building2, query: 'What are the PG rules?' },
        ];

  const handleSend = async (queryToSend?: string) => {
    const query = (queryToSend || inputText).trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await apiPost<{ answer: string; language: Language }>('/ai/query', {
        query,
        language,
      });

      if (res.success && res.data) {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: res.data.answer,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: res.error || 'Maaf kijiye, abhi jawab nahi mil paya. Kripya dubara koshish karein.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: 'Network error. Kripya apna connection check karein.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Text-to-Speech (TTS)
  const speakMessage = (messageId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
      return;
    }

    if (currentlySpeakingId === messageId) {
      stopSpeaking();
      return;
    }

    stopSpeaking();

    // Clean text of markdown bullets for smooth speech
    const cleanText = text.replace(/[•*#_~`]/g, '').replace(/₹/g, 'Rupees ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.95;

    // Pick Indian voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        (language === 'hi' && v.lang.includes('hi')) ||
        (v.lang.includes('en-IN') || v.name.includes('India'))
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      setCurrentlySpeakingId(null);
    };
    utterance.onerror = () => {
      setCurrentlySpeakingId(null);
    };

    setCurrentlySpeakingId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  // Toggle Voice Recording
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Voice recognition is not supported on this browser. Please use Google Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      stopSpeaking();
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          width: '100%',
          maxWidth: '520px',
          height: '88vh',
          maxHeight: '750px',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          animation: 'slideUp 220ms ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-primary-light)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)' }}>
                  PG AI Sahayak
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 600,
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={activePgName}
                >
                  {activePgName}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                {language === 'hi' ? `केवल "${activePgName}" के डेटा से उत्तर देता है` : `Dedicated assistant strictly for ${activePgName}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: '6px',
              borderRadius: '50%',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Language Selector Bar */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--color-bg-surface-alt)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Language / भाषा:
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['hinglish', 'hi', 'en'] as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: language === lang ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  backgroundColor: language === lang ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: language === lang ? '#ffffff' : 'var(--color-text-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {lang === 'hinglish' ? '🗣️ Hinglish' : lang === 'hi' ? '🇮🇳 हिंदी' : '🇬🇧 English'}
              </button>
            ))}
          </div>
        </div>

        {/* Clickable Preset Question Chips */}
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg-base)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
          }}
        >
          {presetQuestions.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(chip.query)}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <chip.icon size={13} style={{ color: 'var(--color-primary)' }} />
              {chip.label}
            </button>
          ))}
        </div>

        {/* Message Thread */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: 'var(--color-bg-base)',
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isSpeaking = currentlySpeakingId === msg.id;

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '100%',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    backgroundColor: isUser ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                    color: isUser ? '#ffffff' : 'var(--color-text-primary)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    border: isUser ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  {msg.text}
                </div>

                {/* Footer with timestamp and TTS button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '4px',
                    padding: '0 4px',
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{msg.time}</span>
                  {!isUser && (
                    <button
                      onClick={() => speakMessage(msg.id, msg.text)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: isSpeaking ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isSpeaking ? 'var(--color-primary-light)' : 'transparent',
                      }}
                      title="Speak answer out loud"
                    >
                      {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      {isSpeaking ? (language === 'hi' ? 'रोकें' : 'Stop') : language === 'hi' ? 'सुनें' : 'Suno'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {language === 'hi' ? 'डेटाबेस चेक किया जा रहा है...' : 'Checking database records...'}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--color-bg-surface)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* Microphone button */}
          <button
            type="button"
            onClick={toggleListening}
            style={{
              background: isListening ? 'var(--color-danger)' : 'var(--color-bg-surface-alt)',
              color: isListening ? '#ffffff' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 150ms ease',
            }}
            title={isListening ? 'Stop recording' : 'Voice input (बोलकर पूछें)'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isListening
                ? language === 'hi'
                  ? 'सुन रहा हूँ, बोलिए...'
                  : 'Sun raha hoon, boliye...'
                : language === 'hi'
                ? 'यहाँ सवाल लिखें या बोलें...'
                : 'Yahan sawal likhein ya bolein...'
            }
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-base)',
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: !inputText.trim() || isLoading ? 'var(--color-bg-surface-alt)' : 'var(--color-primary)',
              color: !inputText.trim() || isLoading ? 'var(--color-text-muted)' : '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !inputText.trim() || isLoading ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              transition: 'all 150ms ease',
            }}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
