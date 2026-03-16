// Internationalisierung - Sprachsystem

export type Language = 'de' | 'en';

export const translations = {
  de: {
    // Navigation
    nav: {
      home: 'Startseite',
      register: 'Registrierung',
      login: 'Anmelden',
      dashboard: 'Dashboard',
      logout: 'Abmelden',
      partner: 'Partner werden',
      securityTest: 'Sicherheitstest',
    },
    
    // Startseite
    home: {
      title: 'GAP Protection',
      subtitle: 'Ganzheitliche Cyber-Resilienz & Infrastruktur-Härtung',
      description: 'Schützen Sie Ihr Unternehmen mit proaktiver Überwachung, Schwachstellenanalyse und simulierten Angriffsszenarien.',
      cta: 'Jetzt starten',
      price: '399 € / Monat',
      features: {
        easm: 'External Attack Surface Management',
        simulation: 'Adversary Simulation',
        vulnerability: 'Continuous Vulnerability Management',
        perimeter: 'Perimeter-Defense',
        reporting: 'Monatliche Risikoanalysen',
      },
    },
    
    // Registrierung
    registration: {
      title: 'Kundenregistrierung',
      subtitle: 'Werden Sie Teil von GAP Protection',
      steps: {
        personal: 'Persönliche Daten',
        address: 'Adresse',
        domain: 'Domain & IP',
        payment: 'SEPA-Lastschrift',
        confirm: 'Bestätigung',
      },
      fields: {
        firstName: 'Vorname',
        lastName: 'Nachname',
        email: 'E-Mail-Adresse',
        phone: 'Telefonnummer',
        idNumber: 'Ausweisnummer',
        street: 'Straße',
        houseNumber: 'Hausnummer',
        postalCode: 'Postleitzahl',
        city: 'Stadt',
        country: 'Land',
        domain: 'Domain',
        ipAddress: 'IP-Adresse',
        iban: 'IBAN',
        bic: 'BIC (optional)',
        bankName: 'Name der Bank',
        accountHolder: 'Kontoinhaber',
        promotionCode: 'Promotion-Code',
      },
      placeholders: {
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max@beispiel.de',
        phone: '+49 123 456789',
        idNumber: 'L01234567',
        street: 'Musterstraße',
        houseNumber: '123',
        postalCode: '12345',
        city: 'Berlin',
        domain: 'ihre-domain.de',
        ipAddress: '192.168.1.1',
        iban: 'DE89 3704 0044 0532 0130 00',
        bic: 'COBADEFFXXX',
        bankName: 'Commerzbank',
        accountHolder: 'Max Mustermann',
        promotionCode: 'ML-XXXXXX',
      },
      checkboxes: {
        domainOwner: 'Ich bestätige, dass ich der Inhaber der angegebenen Domain bin.',
        sepaMandate: 'Ich erteile hiermit das SEPA-Lastschriftmandat für monatliche Abbuchungen von 399 €.',
        terms: 'Ich akzeptiere die Allgemeinen Geschäftsbedingungen.',
        privacy: 'Ich habe die Datenschutzerklärung gelesen und akzeptiert.',
      },
      validation: {
        required: 'Dieses Feld ist erforderlich',
        invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
        invalidIban: 'Bitte geben Sie eine gültige IBAN ein',
        invalidDomain: 'Bitte geben Sie eine gültige Domain ein',
        invalidIp: 'Bitte geben Sie eine gültige IP-Adresse ein',
        invalidPromotionCode: 'Ungültiger Promotion-Code',
        mustAccept: 'Sie müssen diese Bedingung akzeptieren',
      },
      buttons: {
        next: 'Weiter',
        back: 'Zurück',
        submit: 'Registrierung abschließen',
        submitting: 'Wird verarbeitet...',
      },
      success: {
        title: 'Registrierung erfolgreich!',
        message: 'Vielen Dank für Ihre Anmeldung. Sie erhalten in Kürze eine Bestätigungs-E-Mail.',
      },
      sepaNote: 'SEPA-Lastschriftmandat: Die Abbuchung erfolgt monatlich zum 1. oder 15. des Monats.',
    },
    
    // Sicherheitstest (GAP)
    securityTest: {
      title: 'Sicherheitstest',
      subtitle: 'Prüfen Sie Ihre Infrastruktur',
      smallDevil: {
        title: 'Schnelltest',
        description: 'Kostenloser Basis-Sicherheitscheck (max. 3x pro Netzwerk)',
        button: 'Test starten',
        result: {
          green: 'Alles in Ordnung - Kein weiterer Test nötig',
          red: 'Sicherheitslücken erkannt - Wir empfehlen den vollständigen Schutz',
        },
      },
      bigDevil: {
        title: 'Vollständige Analyse',
        description: 'Umfassende Sicherheitsanalyse durch unsere Experten',
        button: 'Jetzt anmelden',
      },
      limitReached: 'Sie haben das Limit von 3 kostenlosen Tests erreicht.',
      fields: {
        domain: 'Domain oder IP-Adresse',
      },
    },
    
    // Dashboard
    dashboard: {
      title: 'Dashboard',
      welcome: 'Willkommen',
      stats: {
        totalPartners: 'Partner gesamt',
        activeContracts: 'Aktive Verträge',
        monthlyRevenue: 'Monatlicher Umsatz',
        pendingCommissions: 'Ausstehende Provisionen',
        paidCommissions: 'Ausgezahlte Provisionen',
      },
      sections: {
        hierarchy: 'Meine Struktur',
        commissions: 'Provisionen',
        transactions: 'Transaktionen',
        promotionCode: 'Mein Promotion-Code',
        leadershipPool: 'Leadership-Pool',
      },
      hierarchy: {
        level: 'Stufe',
        partner: 'Partner',
        contracts: 'Verträge',
        status: 'Status',
        active: 'Aktiv',
        inactive: 'Inaktiv',
      },
      commissions: {
        date: 'Datum',
        level: 'Stufe',
        amount: 'Betrag',
        status: 'Status',
        pending: 'Ausstehend',
        approved: 'Genehmigt',
        paid: 'Ausgezahlt',
      },
      leadershipPool: {
        currentLevel: 'Aktueller Level',
        qualification: 'Qualifikation',
        shares: 'Anteile',
        requirements: 'Anforderungen',
        progress: 'Fortschritt',
        directPartners: 'Direkte Partner',
        activeContracts: 'Aktive Verträge',
        level1Partners: 'Partner mit Level 1',
        level2Partners: 'Partner mit Level 2',
      },
    },
    
    // Admin
    admin: {
      title: 'Administration',
      sections: {
        partners: 'Partner-Verwaltung',
        customers: 'Kundenverwaltung',
        commissions: 'Provisionsmodelle',
        transactions: 'Transaktionen',
        reports: 'Berichte',
        settings: 'Einstellungen',
      },
      partners: {
        name: 'Name',
        email: 'E-Mail',
        status: 'Status',
        role: 'Rolle',
        promotionCode: 'Promotion-Code',
        sponsor: 'Sponsor',
        contracts: 'Verträge',
        commissions: 'Provisionen',
        actions: 'Aktionen',
        approve: 'Genehmigen',
        suspend: 'Sperren',
        makePartner: 'Zum Partner befördern',
      },
      commissionModels: {
        name: 'Modellname',
        description: 'Beschreibung',
        levels: 'Stufen',
        dynamicShift: 'Dynamische Verschiebung',
        isActive: 'Aktiv',
        editRules: 'Regeln bearbeiten',
      },
      commissionRules: {
        level: 'Stufe',
        type: 'Typ',
        value: 'Wert',
        fixed: 'Fixbetrag',
        percentage: 'Prozentsatz',
        save: 'Speichern',
      },
    },
    
    // Auth
    auth: {
      login: {
        title: 'Anmelden',
        email: 'E-Mail-Adresse',
        password: 'Passwort',
        button: 'Anmelden',
        noAccount: 'Noch kein Konto?',
        register: 'Jetzt registrieren',
        forgotPassword: 'Passwort vergessen?',
      },
      register: {
        title: 'Konto erstellen',
        email: 'E-Mail-Adresse',
        password: 'Passwort',
        confirmPassword: 'Passwort bestätigen',
        button: 'Registrieren',
        hasAccount: 'Bereits ein Konto?',
        login: 'Jetzt anmelden',
      },
      errors: {
        invalidCredentials: 'Ungültige Anmeldedaten',
        emailInUse: 'Diese E-Mail-Adresse wird bereits verwendet',
        weakPassword: 'Das Passwort ist zu schwach',
        passwordMismatch: 'Die Passwörter stimmen nicht überein',
        generic: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
      },
      success: {
        registered: 'Registrierung erfolgreich! Bitte bestätigen Sie Ihre E-Mail-Adresse.',
        loggedIn: 'Erfolgreich angemeldet!',
        loggedOut: 'Erfolgreich abgemeldet!',
      },
    },
    
    // Allgemein
    common: {
      loading: 'Laden...',
      error: 'Fehler',
      success: 'Erfolgreich',
      cancel: 'Abbrechen',
      save: 'Speichern',
      delete: 'Löschen',
      edit: 'Bearbeiten',
      view: 'Ansehen',
      search: 'Suchen',
      filter: 'Filtern',
      export: 'Exportieren',
      import: 'Importieren',
      yes: 'Ja',
      no: 'Nein',
      currency: '€',
      dateFormat: 'DD.MM.YYYY',
    },
    
    // Footer
    footer: {
      terms: 'AGB',
      privacy: 'Datenschutz',
      imprint: 'Impressum',
      contact: 'Kontakt',
      copyright: '© 2026 GAP PROTECTION GmbH. Alle Rechte vorbehalten.',
    },
  },
  
  en: {
    // Navigation
    nav: {
      home: 'Home',
      register: 'Registration',
      login: 'Login',
      dashboard: 'Dashboard',
      logout: 'Logout',
      partner: 'Become Partner',
      securityTest: 'Security Test',
    },
    
    // Home
    home: {
      title: 'GAP Protection',
      subtitle: 'Holistic Cyber Resilience & Infrastructure Hardening',
      description: 'Protect your business with proactive monitoring, vulnerability analysis, and simulated attack scenarios.',
      cta: 'Get Started',
      price: '€399 / month',
      features: {
        easm: 'External Attack Surface Management',
        simulation: 'Adversary Simulation',
        vulnerability: 'Continuous Vulnerability Management',
        perimeter: 'Perimeter Defense',
        reporting: 'Monthly Risk Reports',
      },
    },
    
    // ... rest would follow same pattern
    registration: {
      title: 'Customer Registration',
      subtitle: 'Join GAP Protection',
      steps: {
        personal: 'Personal Information',
        address: 'Address',
        domain: 'Domain & IP',
        payment: 'SEPA Direct Debit',
        confirm: 'Confirmation',
      },
      fields: {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email Address',
        phone: 'Phone Number',
        idNumber: 'ID Number',
        street: 'Street',
        houseNumber: 'House Number',
        postalCode: 'Postal Code',
        city: 'City',
        country: 'Country',
        domain: 'Domain',
        ipAddress: 'IP Address',
        iban: 'IBAN',
        bic: 'BIC (optional)',
        bankName: 'Bank Name',
        accountHolder: 'Account Holder',
        promotionCode: 'Promotion Code',
      },
      placeholders: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+49 123 456789',
        idNumber: 'L01234567',
        street: 'Main Street',
        houseNumber: '123',
        postalCode: '12345',
        city: 'Berlin',
        domain: 'your-domain.com',
        ipAddress: '192.168.1.1',
        iban: 'DE89 3704 0044 0532 0130 00',
        bic: 'COBADEFFXXX',
        bankName: 'Commerzbank',
        accountHolder: 'John Doe',
        promotionCode: 'ML-XXXXXX',
      },
      checkboxes: {
        domainOwner: 'I confirm that I am the owner of the specified domain.',
        sepaMandate: 'I hereby grant the SEPA direct debit mandate for monthly deductions of €399.',
        terms: 'I accept the Terms and Conditions.',
        privacy: 'I have read and accept the Privacy Policy.',
      },
      validation: {
        required: 'This field is required',
        invalidEmail: 'Please enter a valid email address',
        invalidIban: 'Please enter a valid IBAN',
        invalidDomain: 'Please enter a valid domain',
        invalidIp: 'Please enter a valid IP address',
        invalidPromotionCode: 'Invalid promotion code',
        mustAccept: 'You must accept this condition',
      },
      buttons: {
        next: 'Next',
        back: 'Back',
        submit: 'Complete Registration',
        submitting: 'Processing...',
      },
      success: {
        title: 'Registration Successful!',
        message: 'Thank you for signing up. You will receive a confirmation email shortly.',
      },
      sepaNote: 'SEPA Direct Debit: Deductions occur monthly on the 1st or 15th.',
    },
    
    securityTest: {
      title: 'Security Test',
      subtitle: 'Check Your Infrastructure',
      smallDevil: {
        title: 'Quick Test',
        description: 'Free basic security check (max 3x per network)',
        button: 'Start Test',
        result: {
          green: 'All clear - No further test needed',
          red: 'Security vulnerabilities detected - We recommend full protection',
        },
      },
      bigDevil: {
        title: 'Full Analysis',
        description: 'Comprehensive security analysis by our experts',
        button: 'Sign Up Now',
      },
      limitReached: 'You have reached the limit of 3 free tests.',
      fields: {
        domain: 'Domain or IP Address',
      },
    },
    
    dashboard: {
      title: 'Dashboard',
      welcome: 'Welcome',
      stats: {
        totalPartners: 'Total Partners',
        activeContracts: 'Active Contracts',
        monthlyRevenue: 'Monthly Revenue',
        pendingCommissions: 'Pending Commissions',
        paidCommissions: 'Paid Commissions',
      },
      sections: {
        hierarchy: 'My Structure',
        commissions: 'Commissions',
        transactions: 'Transactions',
        promotionCode: 'My Promotion Code',
        leadershipPool: 'Leadership Pool',
      },
      hierarchy: {
        level: 'Level',
        partner: 'Partner',
        contracts: 'Contracts',
        status: 'Status',
        active: 'Active',
        inactive: 'Inactive',
      },
      commissions: {
        date: 'Date',
        level: 'Level',
        amount: 'Amount',
        status: 'Status',
        pending: 'Pending',
        approved: 'Approved',
        paid: 'Paid',
      },
      leadershipPool: {
        currentLevel: 'Current Level',
        qualification: 'Qualification',
        shares: 'Shares',
        requirements: 'Requirements',
        progress: 'Progress',
        directPartners: 'Direct Partners',
        activeContracts: 'Active Contracts',
        level1Partners: 'Level 1 Partners',
        level2Partners: 'Level 2 Partners',
      },
    },
    
    admin: {
      title: 'Administration',
      sections: {
        partners: 'Partner Management',
        customers: 'Customer Management',
        commissions: 'Commission Models',
        transactions: 'Transactions',
        reports: 'Reports',
        settings: 'Settings',
      },
      partners: {
        name: 'Name',
        email: 'Email',
        status: 'Status',
        role: 'Role',
        promotionCode: 'Promotion Code',
        sponsor: 'Sponsor',
        contracts: 'Contracts',
        commissions: 'Commissions',
        actions: 'Actions',
        approve: 'Approve',
        suspend: 'Suspend',
        makePartner: 'Promote to Partner',
      },
      commissionModels: {
        name: 'Model Name',
        description: 'Description',
        levels: 'Levels',
        dynamicShift: 'Dynamic Shift',
        isActive: 'Active',
        editRules: 'Edit Rules',
      },
      commissionRules: {
        level: 'Level',
        type: 'Type',
        value: 'Value',
        fixed: 'Fixed Amount',
        percentage: 'Percentage',
        save: 'Save',
      },
    },
    
    auth: {
      login: {
        title: 'Login',
        email: 'Email Address',
        password: 'Password',
        button: 'Login',
        noAccount: "Don't have an account?",
        register: 'Register now',
        forgotPassword: 'Forgot password?',
      },
      register: {
        title: 'Create Account',
        email: 'Email Address',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        button: 'Register',
        hasAccount: 'Already have an account?',
        login: 'Login now',
      },
      errors: {
        invalidCredentials: 'Invalid credentials',
        emailInUse: 'This email is already in use',
        weakPassword: 'Password is too weak',
        passwordMismatch: 'Passwords do not match',
        generic: 'An error occurred. Please try again.',
      },
      success: {
        registered: 'Registration successful! Please confirm your email address.',
        loggedIn: 'Successfully logged in!',
        loggedOut: 'Successfully logged out!',
      },
    },
    
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      view: 'View',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      import: 'Import',
      yes: 'Yes',
      no: 'No',
      currency: '€',
      dateFormat: 'MM/DD/YYYY',
    },
    
    footer: {
      terms: 'Terms',
      privacy: 'Privacy',
      imprint: 'Imprint',
      contact: 'Contact',
      copyright: '© 2026 GAP PROTECTION GmbH. All rights reserved.',
    },
  },
};

// Detect browser language
export function detectLanguage(): Language {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('de')) {
    return 'de';
  }
  return 'en';
}

// Get translation
export function t(lang: Language, path: string): string {
  const keys = path.split('.');
  let current: any = translations[lang];
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      // Fallback to German
      current = translations['de'];
      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          return path; // Return path if not found
        }
      }
      break;
    }
  }
  
  return typeof current === 'string' ? current : path;
}
