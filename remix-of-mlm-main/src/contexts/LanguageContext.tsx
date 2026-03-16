import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, detectLanguage, t as translate, translations } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
  translations: typeof translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguage] = useState<Language>('de');

  useEffect(() => {
    // Stored preference takes priority, then browser detection
    const storedLang = localStorage.getItem('language');
    if (storedLang === 'de' || storedLang === 'en') {
      setLanguage(storedLang);
    } else {
      setLanguage(detectLanguage());
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (path: string): string => {
    return translate(language, path);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, translations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
