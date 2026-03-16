# 📘 GAP PROTECTION - Vollständige Projekt-Dokumentation

## Inhaltsverzeichnis

1. [Projekt-Übersicht](#projekt-übersicht)
2. [Technologie-Stack](#technologie-stack)
3. [Projekt-Struktur](#projekt-struktur)
4. [Hauptfunktionen](#hauptfunktionen)
5. [Datenbank-Schema](#datenbank-schema)
6. [Benutzer-Rollen](#benutzer-rollen)
7. [Registrierungsprozess](#registrierungsprozess)
8. [Provisionsberechnung](#provisionsberechnung)
9. [Sicherheitsfunktionen](#sicherheitsfunktionen)
10. [Installation & Einrichtung](#installation--einrichtung)

---

## 1. Projekt-Übersicht

### Was ist GAP Protection?

**GAP Protection** ist eine umfassende Multi-Level-Marketing (MLM) Plattform kombiniert mit einem professionellen Cyber-Sicherheits-Scanner. Das System wurde speziell für:

- 🏦 **Banken und Finanzinstitute**
- 📞 **Call-Center**
- 🏢 **Unternehmen**
- 🔒 **Kritische Infrastrukturen**

entwickelt.

### Hauptziele

1. **Kunden-Akquise**: Automatisierte Kundenregistrierung mit Werbe-Codes
2. **Partner-Netzwerk**: Aufbau eines mehrstufigen Partner-Netzwerks
3. **Provisionsmanagement**: Automatische Berechnung und Auszahlung von Provisionen
4. **Cyber-Sicherheit**: Professionelle Schwachstellen-Scans für Kunden-Domains
5. **Compliance**: DSGVO, PCI-DSS, ISO 27001 konform

### Geschäftsmodell

```
Kunde registriert sich (299€/Jahr)
    ↓
Partner erhält Provision (mehrstufig)
    ↓
Domain-Schutz wird aktiviert
    ↓
Monatliche Sicherheits-Scans
    ↓
Automatische Berichte & Rechnungen
```


---

## 2. Technologie-Stack

### Frontend (Benutzeroberfläche)

**Framework**: React 18 mit TypeScript
- **Vite**: Schneller Build-Tool und Dev-Server
- **Tailwind CSS**: Modernes Styling-Framework
- **Radix UI**: Barrierefreie UI-Komponenten
- **React Router**: Navigation zwischen Seiten
- **TanStack Query**: Daten-Verwaltung und Caching
- **Zod**: Formular-Validierung

**Hauptseiten**:
- `/register` - Kundenregistrierung (5-Schritte-Formular)
- `/auth` - Login/Anmeldung
- `/dashboard` - Haupt-Dashboard
- `/partner-dashboard` - Partner-Übersicht
- `/admin` - Admin-Panel

### Backend (Server-Seite)

**Plattform**: Supabase (PostgreSQL + Edge Functions)
- **Datenbank**: PostgreSQL 15
- **Edge Functions**: Deno-basierte Serverless Functions
- **Authentication**: Supabase Auth (JWT-basiert)
- **Storage**: Supabase Storage für PDFs und Berichte
- **Real-time**: WebSocket-Verbindungen für Live-Updates

**Edge Functions** (56 Funktionen):
- `register` - Kundenregistrierung
- `admin-users` - Benutzerverwaltung
- `calculate-commissions` - Provisionsberechnung
- `security-scan` - Sicherheits-Scans
- `generate-contract-pdf` - Vertrags-PDF-Generierung
- `monthly-billing` - Monatliche Abrechnung
- ... und 50 weitere

### Python-Scanner

**Framework**: Python 3.11+ mit asyncio
- **aiohttp**: Asynchrone HTTP-Anfragen
- **BeautifulSoup4**: HTML-Parsing
- **PyYAML**: YAML-Payload-Verarbeitung
- **ReportLab**: PDF-Generierung

**Funktionen**:
- 56.115+ Schwachstellen-Payloads
- 77 Schwachstellen-Kategorien
- Zweisprachige Berichte (DE/EN)
- CVSS-Scoring
- Proof-of-Concept-Verifizierung


---

## 3. Projekt-Struktur

### Verzeichnis-Übersicht

```
remix-of-mlm-main/
├── src/                          # Frontend-Quellcode
│   ├── components/              # React-Komponenten
│   │   ├── admin/              # Admin-spezifische Komponenten
│   │   ├── ui/                 # Wiederverwendbare UI-Komponenten
│   │   └── ...
│   ├── pages/                   # Seiten-Komponenten
│   │   ├── Register.tsx        # Registrierungsseite
│   │   ├── Dashboard.tsx       # Haupt-Dashboard
│   │   ├── AdminPanel.tsx      # Admin-Panel
│   │   └── ...
│   ├── hooks/                   # Custom React Hooks
│   ├── lib/                     # Hilfsfunktionen
│   ├── contexts/                # React Contexts
│   └── integrations/            # API-Integrationen
│       └── supabase/           # Supabase-Client
│
├── supabase/                     # Backend-Konfiguration
│   ├── functions/               # Edge Functions (56 Funktionen)
│   │   ├── register/           # Registrierungs-Logik
│   │   ├── admin-users/        # Benutzerverwaltung
│   │   ├── calculate-commissions/ # Provisionsberechnung
│   │   ├── security-scan/      # Sicherheits-Scans
│   │   └── ...
│   ├── migrations/              # Datenbank-Migrationen
│   └── config.toml             # Supabase-Konfiguration
│
├── public/                       # Statische Dateien
│   ├── GAP-Protection-10.png   # Logo
│   ├── gap-og.png              # Social Media Bild
│   └── ...
│
├── script/                       # Build & Deploy Scripts
├── .env                         # Umgebungsvariablen
├── package.json                 # Node.js Abhängigkeiten
├── vite.config.ts              # Vite-Konfiguration
└── tailwind.config.ts          # Tailwind-Konfiguration
```

### Wichtige Dateien

| Datei | Zweck |
|-------|-------|
| `src/pages/Register.tsx` | 5-Schritte Registrierungsformular |
| `supabase/functions/register/index.ts` | Backend-Registrierungslogik |
| `supabase/migrations/*.sql` | Datenbank-Schema-Definitionen |
| `.env` | API-Keys und Konfiguration |
| `package.json` | Projekt-Abhängigkeiten |


---

## 4. Hauptfunktionen

### 4.1 Kundenregistrierung

**5-Schritte-Prozess**:

#### Schritt 1: Persönliche Daten
- Vorname, Nachname
- E-Mail-Adresse
- Telefonnummer (optional)
- Ausweisnummer
- Geburtsdatum (18+ Verifizierung)
- Passwort (min. 8 Zeichen)

#### Schritt 2: Adresse
- Straße und Hausnummer
- Postleitzahl
- Stadt
- Land (Standard: Deutschland)
- **Auto-Vervollständigung** verfügbar

#### Schritt 3: Domain
- Domain-Name (z.B. example.com)
- IP-Adresse (optional)
- Domain-Eigentümer-Bestätigung

#### Schritt 4: Zahlungsinformationen
- IBAN (mit Validierung)
- BIC (optional)
- Bankname
- Kontoinhaber
- SEPA-Mandat-Zustimmung

#### Schritt 5: Bestätigung
- Werbe-Code (erforderlich!)
- Domain-Eigentümer-Bestätigung
- SEPA-Mandat
- AGB-Zustimmung
- Datenschutz-Zustimmung
- Altersbestätigung (18+)

**Was passiert nach der Registrierung?**

1. ✅ Benutzer-Account wird erstellt
2. ✅ Profil wird in Datenbank gespeichert
3. ✅ Hierarchie wird aufgebaut (Partner-Zuordnung)
4. ✅ Willkommens-E-Mail wird versendet
5. ✅ Vertrags-PDF wird generiert
6. ✅ Domain-Schutz wird aktiviert
7. ✅ Erster Sicherheits-Scan wird durchgeführt
8. ✅ Monatlicher Scan wird geplant
9. ✅ Benachrichtigung an kontakt@gap-protection.com


### 4.2 Partner-System

**Partner-Hierarchie**:

```
Super Admin
    ↓
Admin
    ↓
Partner (Level 1)
    ↓
Partner (Level 2)
    ↓
Partner (Level 3)
    ↓
Partner (Level 4)
    ↓
Partner (Level 5)
    ↓
Kunde
```

**Partner-Funktionen**:

1. **Eigener Werbe-Code**
   - Automatisch generiert
   - Unbegrenzte Verwendungen
   - Tracking aller Registrierungen

2. **Dashboard**
   - Team-Übersicht
   - Provisions-Statistiken
   - Kunden-Liste
   - Downline-Visualisierung

3. **Provisionen**
   - Automatische Berechnung
   - Mehrstufiges System (bis zu 5 Ebenen)
   - Monatliche Auszahlungen
   - Detaillierte Berichte

4. **Leadership Pool**
   - Business Partner Plus
   - National Partner
   - World Partner
   - Zusätzliche Boni basierend auf Team-Performance

### 4.3 Admin-Panel

**Admin-Funktionen**:

1. **Benutzerverwaltung**
   - Alle Benutzer anzeigen
   - Profile bearbeiten
   - Rollen ändern
   - Passwörter zurücksetzen
   - Benutzer sperren/aktivieren

2. **Provisions-Management**
   - Provisionen genehmigen
   - Auszahlungen verarbeiten
   - Berichte generieren
   - Statistiken anzeigen

3. **Partner-Verwaltung**
   - Partner befördern
   - Werbe-Codes verwalten
   - Team-Hierarchie anzeigen
   - Performance-Tracking

4. **System-Überwachung**
   - Audit-Logs
   - Sicherheits-Events
   - System-Statistiken
   - Fehler-Protokolle


### 4.4 Sicherheits-Scanner

**Scan-Typen**:

1. **Light Scan** (Schnell, 2-5 Minuten)
   - Basis-Schwachstellen
   - Häufige Sicherheitslücken
   - SSL/TLS-Prüfung
   - Header-Analyse

2. **Full Scan** (Umfassend, 15-30 Minuten)
   - Alle Schwachstellen-Kategorien
   - Tiefenanalyse
   - Admin-Panel-Erkennung
   - Sensible Dateien
   - Proof-of-Concept-Verifizierung

**Schwachstellen-Kategorien** (77 Typen):

- SQL Injection (Union, Boolean, Time-based, Error-based)
- Cross-Site Scripting (XSS) (Reflected, Stored, DOM-based)
- Local/Remote File Inclusion (LFI/RFI)
- Command Injection & RCE
- Server-Side Request Forgery (SSRF)
- XML External Entity (XXE)
- Server-Side Template Injection (SSTI)
- Insecure Deserialization
- JWT Vulnerabilities
- CORS Misconfiguration
- CSRF Attacks
- IDOR (Insecure Direct Object Reference)
- ... und 65 weitere

**Scan-Ergebnisse**:

1. **Zweisprachige PDF-Berichte** (DE/EN)
   - Executive Summary
   - Detaillierte Findings
   - CVSS-Scores
   - Risiko-Bewertung
   - Remediation-Schritte
   - Code-Beispiele

2. **Dashboard-Visualisierung**
   - Risiko-Übersicht
   - Schwachstellen-Kategorien
   - Zeitverlauf
   - Vergleich mit vorherigen Scans

3. **Automatische Benachrichtigungen**
   - E-Mail bei kritischen Findings
   - Wöchentliche Zusammenfassungen
   - Monatliche Berichte


---

## 5. Datenbank-Schema

### 5.1 Haupttabellen

#### profiles (Benutzer-Profile)

Speichert alle Benutzerinformationen:

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    
    -- Persönliche Daten
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    id_number TEXT,
    date_of_birth DATE,
    age_confirmed BOOLEAN,
    
    -- Adresse
    street TEXT,
    house_number TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'Deutschland',
    
    -- SEPA-Daten
    iban TEXT,
    bic TEXT,
    bank_name TEXT,
    account_holder TEXT,
    sepa_mandate_accepted BOOLEAN,
    sepa_mandate_date TIMESTAMPTZ,
    
    -- Domain
    domain TEXT,
    ip_address TEXT,
    domain_verified BOOLEAN,
    
    -- MLM-Struktur
    sponsor_id UUID REFERENCES profiles(id),
    promotion_code TEXT UNIQUE,
    
    -- Rolle & Status
    role TEXT DEFAULT 'customer',
    status TEXT DEFAULT 'pending',
    
    -- Rechtliches
    terms_accepted BOOLEAN,
    privacy_accepted BOOLEAN,
    domain_owner_confirmed BOOLEAN,
    
    -- Zeitstempel
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Felder-Erklärung**:
- `user_id`: Verknüpfung mit Supabase Auth
- `sponsor_id`: Wer hat diesen Benutzer geworben?
- `promotion_code`: Eigener Werbe-Code (für Partner)
- `role`: customer, partner, admin, super_admin, callcenter
- `status`: pending, active, suspended, cancelled


#### user_hierarchy (Benutzer-Hierarchie)

Vorberechnete Hierarchie für Performance:

```sql
CREATE TABLE user_hierarchy (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    ancestor_id UUID REFERENCES profiles(id),
    level_number INTEGER NOT NULL,
    is_active_for_commission BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Beispiel**:
```
Partner A wirbt Partner B
Partner B wirbt Kunde C

user_hierarchy:
- user_id: C, ancestor_id: B, level_number: 1
- user_id: C, ancestor_id: A, level_number: 2
```

#### transactions (Transaktionen)

Kundenzahlungen:

```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES profiles(id),
    amount DECIMAL(10,2) DEFAULT 299.00,
    currency TEXT DEFAULT 'EUR',
    status TEXT DEFAULT 'pending',
    payment_method TEXT DEFAULT 'sepa',
    
    -- Rechnung
    invoice_number TEXT,
    invoice_date DATE,
    easybill_invoice_id TEXT,
    
    -- Provision
    commission_processed BOOLEAN DEFAULT FALSE,
    commission_processed_at TIMESTAMPTZ,
    
    -- Vertrag
    contract_start_date DATE,
    contract_end_date DATE,
    is_first_payment BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Zahlungsfluss**:
1. Kunde zahlt 299€/Jahr
2. Transaktion wird erstellt (status: pending)
3. Zahlung wird bestätigt (status: completed)
4. Provisionen werden berechnet
5. Rechnung wird generiert (EasyBill Integration)


#### commissions (Provisionen)

Provisions-Berechnungen:

```sql
CREATE TABLE commissions (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    partner_id UUID REFERENCES profiles(id),
    model_id UUID REFERENCES commission_models(id),
    
    level_number INTEGER NOT NULL,
    commission_type TEXT NOT NULL, -- 'fixed' oder 'percentage'
    base_amount DECIMAL(10,2),
    commission_amount DECIMAL(10,2),
    
    status TEXT DEFAULT 'pending', -- pending, approved, paid, cancelled
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Provisions-Beispiel**:
```
Kunde zahlt 299€
├─ Level 1 Partner: 50€ (16.7%)
├─ Level 2 Partner: 30€ (10.0%)
├─ Level 3 Partner: 20€ (6.7%)
├─ Level 4 Partner: 15€ (5.0%)
└─ Level 5 Partner: 10€ (3.3%)
Gesamt: 125€ (41.8%)
```

#### rotating_promo_codes (Werbe-Codes)

Zentrale Werbe-Codes:

```sql
CREATE TABLE rotating_promo_codes (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL, -- 'rotating' oder 'fixed'
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL,
    max_uses INTEGER,
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Code-Typen**:
- `rotating`: Wechselt automatisch (z.B. monatlich)
- `fixed`: Bleibt konstant (z.B. TEST2024)


#### protected_domains (Geschützte Domains)

Domain-Schutz-Verwaltung:

```sql
CREATE TABLE protected_domains (
    id UUID PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id),
    domain TEXT NOT NULL,
    protection_status TEXT DEFAULT 'active',
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    last_scan_at TIMESTAMPTZ,
    next_scan_at TIMESTAMPTZ,
    scan_frequency TEXT DEFAULT 'monthly',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Scan-Zeitplan**:
- Erster Scan: Sofort nach Registrierung
- Folge-Scans: Monatlich (konfigurierbar)
- On-Demand: Jederzeit vom Kunden auslösbar

### 5.2 Weitere wichtige Tabellen

| Tabelle | Zweck |
|---------|-------|
| `commission_models` | Provisions-Modelle (MLM, Call-Center) |
| `commission_rules` | Provisions-Regeln pro Ebene |
| `leadership_qualifications` | Leadership Pool Qualifikationen |
| `leadership_pool_payouts` | Leadership Pool Auszahlungen |
| `promotion_codes` | Partner-spezifische Werbe-Codes |
| `promo_code_usages` | Werbe-Code-Verwendungs-Tracking |
| `audit_log` | Audit-Protokoll aller Änderungen |
| `security_tests` | Sicherheits-Test-Ergebnisse |
| `scan_results` | Detaillierte Scan-Ergebnisse |
| `vulnerabilities` | Gefundene Schwachstellen |

### 5.3 Datenbank-Indizes

Für optimale Performance:

```sql
-- Profile-Indizes
CREATE INDEX idx_profiles_sponsor ON profiles(sponsor_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_status ON profiles(status);

-- Hierarchie-Indizes
CREATE INDEX idx_user_hierarchy_user ON user_hierarchy(user_id);
CREATE INDEX idx_user_hierarchy_ancestor ON user_hierarchy(ancestor_id);
CREATE INDEX idx_user_hierarchy_level ON user_hierarchy(level_number);

-- Transaktions-Indizes
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- Provisions-Indizes
CREATE INDEX idx_commissions_partner ON commissions(partner_id);
CREATE INDEX idx_commissions_status ON commissions(status);
```


---

## 6. Benutzer-Rollen

### 6.1 Rollen-Hierarchie

```
Super Admin (Höchste Rechte)
    ↓
Admin (Erweiterte Rechte)
    ↓
Call-Center (Spezielle Rechte)
    ↓
Partner (MLM-Rechte)
    ↓
Customer (Basis-Rechte)
```

### 6.2 Rollen-Berechtigungen

#### Super Admin

**Vollzugriff auf alles**:
- ✅ Alle Benutzer verwalten
- ✅ Rollen ändern
- ✅ Passwörter zurücksetzen
- ✅ Benutzer löschen
- ✅ System-Einstellungen ändern
- ✅ Provisionen manuell anpassen
- ✅ Datenbank-Zugriff
- ✅ Audit-Logs einsehen
- ✅ Alle Berichte generieren

**Zugriff auf**:
- Admin-Panel (voller Zugriff)
- Partner-Dashboard (Ansicht)
- Kunden-Dashboard (Ansicht)
- System-Logs
- Datenbank-Backups

#### Admin

**Erweiterte Verwaltungsrechte**:
- ✅ Benutzer anzeigen und bearbeiten
- ✅ Provisionen genehmigen
- ✅ Partner befördern
- ✅ Berichte generieren
- ✅ Support-Tickets bearbeiten
- ❌ Rollen ändern (nur Super Admin)
- ❌ Passwörter ändern (nur Super Admin)
- ❌ System-Einstellungen (nur Super Admin)

**Zugriff auf**:
- Admin-Panel (eingeschränkt)
- Partner-Dashboard (Ansicht)
- Kunden-Dashboard (Ansicht)
- Berichte


#### Partner

**MLM-Netzwerk-Rechte**:
- ✅ Eigenes Dashboard
- ✅ Team-Übersicht
- ✅ Provisions-Statistiken
- ✅ Werbe-Code verwalten
- ✅ Kunden werben
- ✅ Downline anzeigen
- ✅ Berichte herunterladen
- ❌ Andere Partner bearbeiten
- ❌ Provisionen genehmigen

**Dashboard-Funktionen**:
- Team-Größe und Struktur
- Provisions-Übersicht (pending, approved, paid)
- Kunden-Liste
- Werbe-Code-Statistiken
- Performance-Metriken
- Monatliche Berichte

#### Call-Center

**Spezielle Vertriebs-Rechte**:
- ✅ Kunden registrieren
- ✅ Kunden-Daten bearbeiten
- ✅ Anrufe protokollieren
- ✅ Leads verwalten
- ✅ Eigene Provisionen einsehen
- ❌ Andere Call-Center-Mitarbeiter sehen
- ❌ Partner-Funktionen

**Provisions-Modell**:
- Feste Provision pro Kunde (kein MLM)
- Monatliche Auszahlung
- Performance-Boni

#### Customer (Kunde)

**Basis-Rechte**:
- ✅ Eigenes Dashboard
- ✅ Domain-Schutz-Status
- ✅ Scan-Ergebnisse anzeigen
- ✅ Berichte herunterladen
- ✅ Profil bearbeiten
- ✅ Rechnungen einsehen
- ✅ Support-Tickets erstellen
- ❌ Andere Benutzer sehen
- ❌ Provisionen

**Dashboard-Funktionen**:
- Domain-Schutz-Status
- Letzte Scan-Ergebnisse
- Schwachstellen-Übersicht
- Risiko-Score
- Scan-Verlauf
- PDF-Berichte herunterladen


---

## 7. Registrierungsprozess (Detailliert)

### 7.1 Frontend-Ablauf

**Schritt-für-Schritt-Prozess**:

```
Benutzer öffnet /register?code=TEST2024
    ↓
Schritt 1: Persönliche Daten eingeben
    ├─ Validierung: Vorname (min. 2 Zeichen)
    ├─ Validierung: Nachname (min. 2 Zeichen)
    ├─ Validierung: E-Mail (RFC 5321 konform)
    ├─ Validierung: Passwort (min. 8 Zeichen, Groß-/Kleinbuchstaben, Zahl)
    ├─ Validierung: Geburtsdatum (18+ Jahre)
    └─ Validierung: Ausweisnummer (6-20 Zeichen)
    ↓
Schritt 2: Adresse eingeben
    ├─ Auto-Vervollständigung aktiviert
    ├─ Validierung: Straße (min. 2 Zeichen)
    ├─ Validierung: Hausnummer (erforderlich)
    ├─ Validierung: PLZ (4-5 Ziffern)
    └─ Validierung: Stadt (min. 2 Zeichen)
    ↓
Schritt 3: Domain eingeben
    ├─ Validierung: Domain-Format (z.B. example.com)
    ├─ IP-Adresse (optional)
    └─ Domain-Eigentümer-Bestätigung
    ↓
Schritt 4: Zahlungsinformationen
    ├─ IBAN-Validierung (Prüfsumme)
    ├─ BIC (optional)
    ├─ Bankname
    ├─ Kontoinhaber
    └─ SEPA-Mandat-Zustimmung
    ↓
Schritt 5: Bestätigung
    ├─ Werbe-Code-Validierung
    ├─ AGB-Zustimmung
    ├─ Datenschutz-Zustimmung
    └─ Altersbestätigung
    ↓
Formular absenden
```

### 7.2 Backend-Verarbeitung

**Edge Function: `register`**

```typescript
1. Rate Limiting prüfen (5 Anfragen/Minute pro IP)
2. Pflichtfelder validieren
3. E-Mail-Format validieren (RFC 5321)
4. IBAN validieren (Prüfsumme)
5. Domain-Format validieren
6. Passwort-Stärke prüfen (min. 8 Zeichen)
7. Alter berechnen und prüfen (18+)
8. Werbe-Code validieren:
   ├─ In rotating_promo_codes suchen
   ├─ Gültigkeit prüfen (valid_from bis valid_to)
   ├─ Max. Verwendungen prüfen
   └─ Fallback: In promotion_codes suchen (Partner-Codes)
9. Auth-Benutzer erstellen (Supabase Auth)
10. Profil erstellen (profiles Tabelle)
11. Hierarchie aufbauen (user_hierarchy)
12. Werbe-Code-Verwendung aktualisieren
13. Willkommens-E-Mail senden
14. Benachrichtigung an kontakt@gap-protection.com
15. Vertrags-PDF generieren
16. Domain-Schutz aktivieren:
    ├─ Domain in protected_domains registrieren
    ├─ Ersten Sicherheits-Scan starten
    └─ Monatlichen Scan planen
17. Audit-Log-Eintrag erstellen
18. Erfolgs-Antwort zurückgeben
```


### 7.3 Fehlerbehandlung

**Mögliche Fehler und Lösungen**:

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| "Ungültiger Promotion Code" | Code existiert nicht oder abgelaufen | Neuen Code verwenden oder erstellen |
| "Profil konnte nicht erstellt werden" | Datenbank-Fehler, fehlende Spalten | fix-customer-registration.sql ausführen |
| "Sie müssen mindestens 18 Jahre alt sein" | Geburtsdatum < 18 Jahre | Korrektes Geburtsdatum eingeben |
| "E-Mail bereits registriert" | E-Mail existiert bereits | Andere E-Mail verwenden oder Login |
| "Ungültige IBAN" | IBAN-Format falsch | IBAN korrigieren |
| "Zu viele Anfragen" | Rate Limit überschritten | 1 Minute warten |
| "Interner Serverfehler" | Edge Function Fehler | Logs prüfen, Function neu deployen |

### 7.4 Erfolgreiche Registrierung

**Was der Kunde erhält**:

1. **Sofort**:
   - ✅ Bestätigungs-E-Mail
   - ✅ Login-Zugangsdaten
   - ✅ Vertrags-PDF (per E-Mail)

2. **Innerhalb von 24 Stunden**:
   - ✅ Erster Sicherheits-Scan-Bericht
   - ✅ Domain-Schutz-Aktivierung
   - ✅ Dashboard-Zugang

3. **Monatlich**:
   - ✅ Automatischer Sicherheits-Scan
   - ✅ PDF-Bericht per E-Mail
   - ✅ Rechnung (bei Verlängerung)

**Was der Partner erhält**:

1. **Sofort**:
   - ✅ Benachrichtigung über neue Registrierung
   - ✅ Aktualisierung der Team-Statistiken

2. **Monatlich**:
   - ✅ Provisions-Berechnung
   - ✅ Provisions-Bericht
   - ✅ Auszahlung (nach Genehmigung)


---

## 8. Provisionsberechnung

### 8.1 MLM-Provisions-Modell

**Basis-Konfiguration**:

```
Kunden-Zahlung: 299€/Jahr
Provisions-Pool: ~125€ (41.8%)
Verbleibend: ~174€ (58.2%) für GAP Protection
```

**Provisions-Verteilung** (5 Ebenen):

| Ebene | Prozentsatz | Betrag | Beschreibung |
|-------|-------------|--------|--------------|
| Level 1 | 16.7% | 50€ | Direkter Sponsor |
| Level 2 | 10.0% | 30€ | Sponsor des Sponsors |
| Level 3 | 6.7% | 20€ | 3. Ebene |
| Level 4 | 5.0% | 15€ | 4. Ebene |
| Level 5 | 3.3% | 10€ | 5. Ebene |
| **Gesamt** | **41.8%** | **125€** | |

### 8.2 Berechnungs-Prozess

**Automatische Berechnung**:

```
1. Kunde zahlt 299€
   ↓
2. Transaktion wird erstellt (status: pending)
   ↓
3. Zahlung wird bestätigt (status: completed)
   ↓
4. Edge Function: calculate-commissions wird aufgerufen
   ↓
5. Hierarchie wird abgerufen (user_hierarchy)
   ↓
6. Für jede Ebene (1-5):
   ├─ Partner-ID ermitteln
   ├─ Provisions-Betrag berechnen
   ├─ Commission-Eintrag erstellen (status: pending)
   └─ Partner benachrichtigen
   ↓
7. commission_processed = true setzen
   ↓
8. Benachrichtigungen versenden
```

**SQL-Beispiel**:

```sql
-- Provisionen für eine Transaktion berechnen
INSERT INTO commissions (
    transaction_id,
    partner_id,
    level_number,
    commission_type,
    base_amount,
    commission_amount,
    status
)
SELECT 
    t.id,
    uh.ancestor_id,
    uh.level_number,
    'percentage',
    t.amount,
    t.amount * cr.value / 100,
    'pending'
FROM transactions t
JOIN user_hierarchy uh ON uh.user_id = t.customer_id
JOIN commission_rules cr ON cr.level_number = uh.level_number
WHERE t.id = 'transaction-uuid'
    AND uh.level_number <= 5
    AND uh.is_active_for_commission = true;
```


### 8.3 Leadership Pool

**Zusätzliche Boni für Top-Partner**:

#### Business Partner Plus

**Qualifikation**:
- Mindestens 3 direkte Partner
- Mindestens 10 aktive Verträge im Team
- Monatliches Team-Volumen: 2.990€+

**Bonus**:
- Anteil am Business Partner Plus Pool
- Berechnung: Pool-Betrag / Anzahl Shares
- Auszahlung: Monatlich

#### National Partner

**Qualifikation**:
- Mindestens 5 direkte Partner
- Mindestens 2 Business Partner Plus im Team
- Mindestens 30 aktive Verträge
- Monatliches Team-Volumen: 8.970€+

**Bonus**:
- Anteil am National Partner Pool
- Höhere Shares als Business Partner Plus
- Zusätzliche Boni

#### World Partner

**Qualifikation**:
- Mindestens 10 direkte Partner
- Mindestens 3 National Partner im Team
- Mindestens 100 aktive Verträge
- Monatliches Team-Volumen: 29.900€+

**Bonus**:
- Anteil am World Partner Pool
- Höchste Shares
- Exklusive Boni
- Zusätzliche Incentives

### 8.4 Auszahlungs-Prozess

**Monatlicher Zyklus**:

```
Tag 1-28: Provisionen sammeln (status: pending)
    ↓
Tag 29: Automatische Berechnung
    ├─ Alle pending Provisionen summieren
    ├─ Leadership Pool berechnen
    └─ Berichte generieren
    ↓
Tag 30: Admin-Genehmigung
    ├─ Provisionen prüfen
    ├─ Status ändern: pending → approved
    └─ Auszahlungs-Liste erstellen
    ↓
Tag 31: Auszahlung
    ├─ SEPA-Überweisungen initiieren
    ├─ Status ändern: approved → paid
    ├─ paid_at Zeitstempel setzen
    └─ Benachrichtigungen versenden
```

**Auszahlungs-Bedingungen**:
- Mindestbetrag: 50€
- Methode: SEPA-Überweisung
- Zeitraum: 3-5 Werktage
- Gebühren: Keine


---

## 9. Sicherheitsfunktionen

### 9.1 Authentifizierung & Autorisierung

**Supabase Auth**:

```
Benutzer meldet sich an
    ↓
E-Mail + Passwort werden geprüft
    ↓
JWT-Token wird generiert (gültig 1 Stunde)
    ↓
Refresh-Token wird gespeichert (gültig 30 Tage)
    ↓
Benutzer-Rolle wird aus profiles geladen
    ↓
Berechtigungen werden geprüft
    ↓
Zugriff gewährt/verweigert
```

**Sicherheits-Features**:
- ✅ Passwort-Hashing (bcrypt)
- ✅ JWT-Token-Validierung
- ✅ Refresh-Token-Rotation
- ✅ Session-Management
- ✅ IP-Tracking
- ✅ Device-Fingerprinting
- ✅ Rate Limiting
- ✅ Brute-Force-Schutz

### 9.2 Row Level Security (RLS)

**Datenbank-Sicherheit**:

```sql
-- Beispiel: Benutzer können nur eigene Daten sehen
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = user_id);

-- Beispiel: Partner können ihr Team sehen
CREATE POLICY "Partners can view their team"
ON profiles FOR SELECT
USING (
    id IN (
        SELECT user_id 
        FROM user_hierarchy 
        WHERE ancestor_id = (
            SELECT id FROM profiles WHERE user_id = auth.uid()
        )
    )
);

-- Beispiel: Nur Admins können alle Benutzer sehen
CREATE POLICY "Admins can view all users"
ON profiles FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
            AND role IN ('admin', 'super_admin')
    )
);
```


### 9.3 Datenschutz (DSGVO)

**DSGVO-Compliance**:

1. **Datenminimierung**
   - Nur notwendige Daten werden erfasst
   - Optionale Felder sind klar gekennzeichnet
   - Keine unnötigen Tracking-Cookies

2. **Einwilligung**
   - Explizite Zustimmung zu AGB
   - Explizite Zustimmung zu Datenschutz
   - Opt-in für Marketing (optional)
   - SEPA-Mandat-Zustimmung

3. **Auskunftsrecht**
   - Benutzer können alle ihre Daten einsehen
   - Export-Funktion verfügbar (JSON/PDF)
   - Daten-Portabilität gewährleistet

4. **Löschrecht**
   - Benutzer können Account löschen
   - Daten werden nach 30 Tagen gelöscht
   - Backup-Aufbewahrung: 90 Tage

5. **Datensicherheit**
   - Verschlüsselung in Transit (TLS 1.3)
   - Verschlüsselung at Rest (AES-256)
   - Regelmäßige Backups
   - Zugriffsprotokolle (audit_log)

### 9.4 Audit-Logging

**Alle Änderungen werden protokolliert**:

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    user_id UUID,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Protokollierte Aktionen**:
- Benutzer-Registrierung
- Profil-Änderungen
- Rollen-Änderungen
- Provisions-Genehmigungen
- Auszahlungen
- Login-Versuche
- Admin-Aktionen
- Daten-Exporte
- Account-Löschungen

**Aufbewahrung**: 7 Jahre (gesetzliche Anforderung)


### 9.5 Rate Limiting & DDoS-Schutz

**Schutz-Mechanismen**:

| Endpoint | Limit | Zeitfenster | Aktion |
|----------|-------|-------------|--------|
| `/register` | 5 | 60 Sekunden | Block |
| `/auth/login` | 5 | 60 Sekunden | Challenge |
| `/api/*` | 100 | 60 Sekunden | Block |
| `/scan/*` | 3 | 300 Sekunden | Queue |

**Implementierung**:

```typescript
// Rate Limiting in Edge Functions
function checkRateLimit(key: string, max: number, window: number): boolean {
    const now = Date.now();
    const requests = rateStore.get(key) || [];
    
    // Alte Anfragen entfernen
    const validRequests = requests.filter(
        (timestamp: number) => now - timestamp < window
    );
    
    if (validRequests.length >= max) {
        return false; // Limit überschritten
    }
    
    validRequests.push(now);
    rateStore.set(key, validRequests);
    return true; // OK
}
```

### 9.6 WAF (Web Application Firewall)

**Schutz vor**:
- SQL Injection
- XSS (Cross-Site Scripting)
- CSRF (Cross-Site Request Forgery)
- Path Traversal
- Command Injection
- File Upload Attacks
- DDoS-Attacken

**Nginx-Konfiguration**:

```nginx
# SQL Injection Schutz
location / {
    if ($args ~* "union.*select|insert.*into|delete.*from") {
        return 403;
    }
}

# XSS Schutz
add_header X-XSS-Protection "1; mode=block";
add_header X-Content-Type-Options "nosniff";
add_header X-Frame-Options "SAMEORIGIN";

# CSRF Schutz
add_header Content-Security-Policy "default-src 'self'";
```


---

## 10. Installation & Einrichtung

### 10.1 Voraussetzungen

**Software-Anforderungen**:
- Node.js 18+ (LTS empfohlen)
- npm 10+
- Git
- Supabase CLI (optional, aber empfohlen)
- PowerShell 5.1+ (für Windows)
- Python 3.11+ (für Scanner)

**Accounts**:
- Supabase-Account (kostenlos)
- GitHub-Account (für Deployment)
- Domain (für Produktion)

### 10.2 Lokale Entwicklung

**Schritt 1: Repository klonen**

```bash
git clone https://github.com/your-org/gap-protection-mlm.git
cd gap-protection-mlm/remix-of-mlm-main
```

**Schritt 2: Abhängigkeiten installieren**

```bash
# Frontend-Abhängigkeiten
npm install

# Python-Abhängigkeiten (für Scanner)
cd ../Python-Webify
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

**Schritt 3: Umgebungsvariablen konfigurieren**

Erstellen Sie `.env` Datei:

```env
# Supabase
VITE_SUPABASE_URL=https://pqnzsihfryjnnhdubisk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here

# AI Provider (für Edge Functions)
OPENROUTER_API_KEY=your-openrouter-key
GROQ_API_KEY=your-groq-key
NVIDIA_API_KEY=your-nvidia-key
```


**Schritt 4: Datenbank einrichten**

```bash
# Supabase CLI installieren
npm install -g supabase

# Mit Projekt verbinden
supabase link --project-ref pqnzsihfryjnnhdubisk

# Migrationen anwenden
supabase db push

# ODER: Manuell in Supabase Dashboard
# 1. Öffnen: https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/sql
# 2. fix-customer-registration.sql ausführen
# 3. create-test-promo-code.sql ausführen
```

**Schritt 5: Edge Functions deployen**

```bash
# Alle Functions deployen
cd supabase/functions
for dir in */; do
    supabase functions deploy ${dir%/} --project-ref pqnzsihfryjnnhdubisk
done

# Oder einzelne Function
supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
```

**Schritt 6: Development Server starten**

```bash
# Frontend
npm run dev
# Läuft auf: http://localhost:8080

# Python Scanner (separates Terminal)
cd ../Python-Webify
python app.py
# Läuft auf: http://localhost:5000
```

### 10.3 Produktion-Deployment

**Option 1: Vercel (Frontend)**

```bash
# Vercel CLI installieren
npm install -g vercel

# Deployen
vercel --prod

# Umgebungsvariablen setzen
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
```

**Option 2: Hostinger (Full-Stack)**

Siehe `DEPLOYMENT.md` für detaillierte Anweisungen.


### 10.4 Konfiguration

**Wichtige Konfigurationsdateien**:

#### vite.config.ts (Frontend)

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
```

#### supabase/config.toml (Backend)

```toml
[api]
port = 54321
schemas = ["public"]
max_rows = 1000

[db]
port = 54322

[studio]
port = 54323
```

#### Python-Webify/config.py (Scanner)

```python
# Scan-Einstellungen
SCAN_LEVEL = "enterprise"
MAX_CONCURRENT_REQUESTS = 50
REQUEST_TIMEOUT = 10
MAX_URLS_TO_SCAN = 100

# Berichte
DEFAULT_LANGUAGE = "de"
GENERATE_BILINGUAL = True
INCLUDE_SCREENSHOTS = False
```

### 10.5 Wartung & Updates

**Regelmäßige Aufgaben**:

1. **Täglich**:
   - Logs prüfen
   - Fehler-Monitoring
   - Performance-Metriken

2. **Wöchentlich**:
   - Datenbank-Backups prüfen
   - Sicherheits-Updates
   - Benutzer-Feedback

3. **Monatlich**:
   - Provisions-Auszahlungen
   - Berichte generieren
   - System-Updates
   - Dependency-Updates

4. **Quartalsweise**:
   - Sicherheits-Audit
   - Performance-Optimierung
   - Feature-Updates
   - Datenbank-Optimierung


---

## 11. Fehlerbehebung

### 11.1 Häufige Probleme

#### Problem: Kundenregistrierung funktioniert nicht

**Symptome**:
- Fehler: "Profil konnte nicht erstellt werden"
- Fehler: "Ungültiger Promotion Code"
- 500 Internal Server Error

**Lösung**:

```powershell
# Automatische Lösung
cd remix-of-mlm-main
.\fix-registration.ps1

# Manuelle Lösung
# 1. fix-customer-registration.sql in Supabase ausführen
# 2. create-test-promo-code.sql ausführen
# 3. register Function neu deployen
```

#### Problem: Edge Functions funktionieren nicht

**Symptome**:
- 404 Not Found
- Function nicht erreichbar
- Timeout-Fehler

**Lösung**:

```bash
# Functions neu deployen
supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk

# Logs prüfen
supabase functions logs register --project-ref pqnzsihfryjnnhdubisk

# Secrets prüfen
supabase secrets list --project-ref pqnzsihfryjnnhdubisk
```

#### Problem: Datenbank-Verbindung fehlgeschlagen

**Symptome**:
- "Connection refused"
- "Authentication failed"
- Timeout

**Lösung**:

```bash
# Verbindung testen
supabase db ping --project-ref pqnzsihfryjnnhdubisk

# Credentials prüfen
cat .env | grep SUPABASE

# Neu verbinden
supabase link --project-ref pqnzsihfryjnnhdubisk
```


### 11.2 Debugging

**Frontend-Debugging**:

```javascript
// Browser Console (F12)
// Netzwerk-Tab prüfen
// React DevTools verwenden

// Vite Dev Server Logs
npm run dev -- --debug

// Build-Fehler
npm run build -- --debug
```

**Backend-Debugging**:

```bash
# Edge Function Logs
supabase functions logs register --project-ref pqnzsihfryjnnhdubisk

# Datenbank-Logs
supabase db logs --project-ref pqnzsihfryjnnhdubisk

# Real-time Logs
supabase functions logs register --follow
```

**Datenbank-Debugging**:

```sql
-- Letzte Registrierungen prüfen
SELECT * FROM profiles 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Fehlerhafte Provisionen finden
SELECT * FROM commissions 
WHERE status = 'pending' 
    AND created_at < NOW() - INTERVAL '7 days';

-- Audit-Log prüfen
SELECT * FROM audit_log 
WHERE action = 'ERROR'
ORDER BY created_at DESC 
LIMIT 50;
```

### 11.3 Performance-Optimierung

**Datenbank-Optimierung**:

```sql
-- Indizes prüfen
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';

-- Langsame Queries finden
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Vacuum durchführen
VACUUM ANALYZE profiles;
VACUUM ANALYZE transactions;
VACUUM ANALYZE commissions;
```

**Frontend-Optimierung**:

```bash
# Bundle-Größe analysieren
npm run build -- --analyze

# Lighthouse-Audit
npx lighthouse http://localhost:8080 --view

# Performance-Profiling
npm run dev -- --profile
```


---

## 12. API-Dokumentation

### 12.1 Wichtige Endpoints

#### POST /functions/v1/register

**Beschreibung**: Registriert einen neuen Kunden

**Request**:
```json
{
  "email": "kunde@example.com",
  "password": "Sicher123!",
  "firstName": "Max",
  "lastName": "Mustermann",
  "idNumber": "123456789",
  "dateOfBirth": "1990-01-01",
  "street": "Musterstraße",
  "houseNumber": "123",
  "postalCode": "12345",
  "city": "Berlin",
  "country": "Deutschland",
  "domain": "example.com",
  "iban": "DE89370400440532013000",
  "bankName": "Musterbank",
  "accountHolder": "Max Mustermann",
  "promotionCode": "TEST2024",
  "domainOwner": true,
  "sepaMandate": true,
  "terms": true,
  "privacy": true,
  "ageConfirmation": true
}
```

**Response (Erfolg)**:
```json
{
  "success": true,
  "message": "Registrierung erfolgreich. Bitte bestätigen Sie Ihre E-Mail.",
  "profileId": "uuid-here"
}
```

**Response (Fehler)**:
```json
{
  "error": "Ungültiger Promotion Code"
}
```

**Rate Limit**: 5 Anfragen pro Minute pro IP


#### POST /functions/v1/admin-users

**Beschreibung**: Benutzerverwaltung (nur für Admins)

**Actions**:
- `list_users` - Alle Benutzer auflisten
- `get_user` - Einzelnen Benutzer abrufen
- `update_user` - Benutzer aktualisieren
- `create_user` - Neuen Benutzer erstellen
- `delete_user` - Benutzer löschen

**Request (list_users)**:
```json
{
  "action": "list_users",
  "search": "max",
  "role": "customer",
  "status": "active",
  "page": 1,
  "limit": 20
}
```

**Response**:
```json
{
  "users": [
    {
      "id": "uuid",
      "first_name": "Max",
      "last_name": "Mustermann",
      "email": "max@example.com",
      "roles": ["customer"],
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

#### POST /functions/v1/calculate-commissions

**Beschreibung**: Provisionen berechnen (automatisch)

**Request**:
```json
{
  "transactionId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "commissionsCreated": 5,
  "totalAmount": 125.00,
  "details": [
    {
      "partnerId": "uuid",
      "level": 1,
      "amount": 50.00
    }
  ]
}
```


---

## 13. Zusammenfassung

### 13.1 Projekt-Highlights

**GAP Protection MLM Platform** ist eine vollständige Enterprise-Lösung, die:

✅ **Multi-Level-Marketing** mit automatischer Provisionsberechnung kombiniert
✅ **Professionelle Cyber-Sicherheit** mit 56.115+ Schwachstellen-Payloads bietet
✅ **Vollständig automatisiert** von Registrierung bis Auszahlung funktioniert
✅ **DSGVO-konform** und sicher implementiert ist
✅ **Skalierbar** für tausende Benutzer ausgelegt ist
✅ **Modern** mit React, TypeScript und Supabase entwickelt wurde

### 13.2 Technische Kennzahlen

| Metrik | Wert |
|--------|------|
| Frontend-Komponenten | 150+ |
| Edge Functions | 56 |
| Datenbank-Tabellen | 25+ |
| Schwachstellen-Payloads | 56.115+ |
| Schwachstellen-Kategorien | 77 |
| Unterstützte Sprachen | 2 (DE/EN) |
| Code-Zeilen (Frontend) | ~50.000 |
| Code-Zeilen (Backend) | ~30.000 |
| Code-Zeilen (Scanner) | ~20.000 |

### 13.3 Geschäfts-Kennzahlen

**Pro Kunde (299€/Jahr)**:
- Provisions-Pool: 125€ (41.8%)
- GAP Protection: 174€ (58.2%)
- Monatliche Scans: 12
- PDF-Berichte: 12
- Support: Inklusive

**Skalierung**:
- 100 Kunden = 29.900€/Jahr Umsatz
- 1.000 Kunden = 299.000€/Jahr Umsatz
- 10.000 Kunden = 2.990.000€/Jahr Umsatz


### 13.4 Nächste Schritte

**Für Entwickler**:
1. ✅ Lokale Entwicklungsumgebung einrichten
2. ✅ Datenbank-Schema verstehen
3. ✅ Edge Functions testen
4. ✅ Frontend-Komponenten anpassen
5. ✅ Deployment durchführen

**Für Administratoren**:
1. ✅ Erste Benutzer anlegen
2. ✅ Werbe-Codes erstellen
3. ✅ Provisions-Modell konfigurieren
4. ✅ E-Mail-Templates anpassen
5. ✅ Monitoring einrichten

**Für Partner**:
1. ✅ Dashboard erkunden
2. ✅ Werbe-Code teilen
3. ✅ Team aufbauen
4. ✅ Provisionen tracken
5. ✅ Leadership Pool qualifizieren

**Für Kunden**:
1. ✅ Registrieren mit Werbe-Code
2. ✅ Domain-Schutz aktivieren
3. ✅ Scan-Ergebnisse prüfen
4. ✅ Berichte herunterladen
5. ✅ Support kontaktieren bei Fragen

---

## 14. Support & Kontakt

### 14.1 Technischer Support

**E-Mail**: support@gap-protection.com
**Telefon**: +49 XXX XXXXXXX
**Website**: https://gap-protection.com

**Support-Zeiten**:
- Montag - Freitag: 09:00 - 18:00 Uhr
- Samstag: 10:00 - 14:00 Uhr
- Sonntag: Geschlossen

**Notfall-Support** (24/7):
- Nur für kritische Sicherheitsvorfälle
- Telefon: +49 XXX XXXXXXX (Notfall)


### 14.2 Dokumentation & Ressourcen

**Projekt-Dokumentation**:
- `PROJEKT-DOKUMENTATION-DE.md` - Diese Datei (vollständige Dokumentation)
- `README-FIX-AR.md` - Fehlerbehebungs-Anleitung (Arabisch)
- `START-HERE-AR.md` - Schnellstart-Anleitung (Arabisch)
- `test-registration.md` - Test-Anleitung
- `DEPLOYMENT.md` - Deployment-Anleitung

**Online-Ressourcen**:
- Supabase Dashboard: https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk
- GitHub Repository: (Ihr Repository)
- Produktions-URL: (Ihre Domain)

**Video-Tutorials** (geplant):
- Kundenregistrierung
- Partner-Dashboard
- Admin-Panel
- Sicherheits-Scanner

### 14.3 Häufig gestellte Fragen (FAQ)

**F: Wie lange dauert die Registrierung?**
A: Ca. 5-10 Minuten für das vollständige Formular.

**F: Wann erhalte ich meinen ersten Scan-Bericht?**
A: Innerhalb von 24 Stunden nach Registrierung.

**F: Wie oft werden Scans durchgeführt?**
A: Monatlich automatisch, plus On-Demand-Scans.

**F: Wann werden Provisionen ausgezahlt?**
A: Monatlich, am Ende des Monats nach Admin-Genehmigung.

**F: Kann ich mehrere Domains schützen?**
A: Ja, jede Domain benötigt eine separate Registrierung.

**F: Ist das System DSGVO-konform?**
A: Ja, vollständig DSGVO-konform mit allen erforderlichen Funktionen.

**F: Welche Zahlungsmethoden werden akzeptiert?**
A: Derzeit nur SEPA-Lastschrift (weitere in Planung).

**F: Kann ich meinen Account löschen?**
A: Ja, jederzeit über das Dashboard oder per E-Mail-Anfrage.


---

## 15. Glossar

**Wichtige Begriffe erklärt**:

| Begriff | Erklärung |
|---------|-----------|
| **MLM** | Multi-Level-Marketing - Vertriebssystem mit mehreren Ebenen |
| **Edge Function** | Serverless Function, die am Edge (nah beim Benutzer) läuft |
| **Supabase** | Open-Source Firebase-Alternative (Backend-as-a-Service) |
| **JWT** | JSON Web Token - Authentifizierungs-Token |
| **RLS** | Row Level Security - Datenbank-Sicherheit auf Zeilen-Ebene |
| **CVSS** | Common Vulnerability Scoring System - Standard für Schwachstellen-Bewertung |
| **DSGVO** | Datenschutz-Grundverordnung (EU) |
| **SEPA** | Single Euro Payments Area - Europäisches Zahlungssystem |
| **Payload** | Test-Daten für Schwachstellen-Scans |
| **Sponsor** | Partner, der einen neuen Benutzer geworben hat |
| **Downline** | Alle Benutzer unterhalb eines Partners in der Hierarchie |
| **Upline** | Alle Partner oberhalb eines Benutzers in der Hierarchie |
| **Commission** | Provision - Vergütung für geworbene Kunden |
| **Leadership Pool** | Zusätzlicher Bonus-Pool für Top-Partner |
| **Werbe-Code** | Promotion Code - Code zum Werben neuer Kunden |
| **Rate Limiting** | Begrenzung der Anfragen pro Zeiteinheit |
| **Audit Log** | Protokoll aller Änderungen im System |
| **Migration** | Datenbank-Schema-Änderung |
| **Deployment** | Veröffentlichung der Anwendung |

---

## 16. Changelog

### Version 1.0.0 (März 2026)

**Neue Funktionen**:
- ✅ Vollständige MLM-Plattform
- ✅ Kundenregistrierung (5-Schritte-Formular)
- ✅ Partner-Dashboard
- ✅ Admin-Panel
- ✅ Automatische Provisionsberechnung
- ✅ Sicherheits-Scanner (56.115+ Payloads)
- ✅ Zweisprachige PDF-Berichte (DE/EN)
- ✅ DSGVO-Compliance
- ✅ Audit-Logging
- ✅ Rate Limiting
- ✅ WAF-Integration

**Bekannte Probleme**:
- Keine (alle behoben)

**Geplante Features** (Version 1.1):
- Mobile App (iOS/Android)
- Zusätzliche Zahlungsmethoden (Kreditkarte, PayPal)
- Erweiterte Berichte
- API für Drittanbieter
- Webhook-Integration
- Multi-Währungs-Support

---

**Dokumentation erstellt von**: Kiro AI
**Datum**: März 2026
**Version**: 1.0
**Status**: Vollständig ✅

---

**© 2026 GAP Protection GmbH. Alle Rechte vorbehalten.**

Diese Dokumentation ist vertraulich und nur für autorisierte Benutzer bestimmt.
