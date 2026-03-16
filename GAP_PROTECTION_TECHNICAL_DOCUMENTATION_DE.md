# GAP Protection Ltd. — Technische Systemdokumentation

**Version:** 1.0.0
**Stand:** März 2026
**Klassifizierung:** Vertraulich — Nur für autorisierte Empfänger
**Erstellt von:** Senior Software Architect & Cybersecurity-Experte

---

## 1. Executive Summary

### Was ist GAP Protection Ltd.?

GAP Protection Ltd. ist eine vollständig integrierte B2B-Plattform, die zwei Kernbereiche vereint:

1. **MLM-Vertriebssystem** — Ein mehrstufiges Vertriebsnetzwerk für den Verkauf von Cybersecurity-Dienstleistungen mit automatischer Provisionsberechnung, Promotioncode-System und vollständiger Hierarchieverwaltung.

2. **Cybersecurity-Scanner-Plattform (Python-Webify)** — Ein professionelles Sicherheits-Scan-Tool, das Websites, Server und kritische Infrastruktur auf Sicherheitslücken analysiert und detaillierte Berichte generiert.

### Welches Problem löst die Plattform?

Kleine und mittelständische Unternehmen (KMU) in Deutschland und Europa haben keinen einfachen Zugang zu professionellen Cybersecurity-Dienstleistungen. GAP Protection löst dieses Problem durch:

- Ein dezentrales Vertriebsnetzwerk (MLM), das Agenten und Call-Center einbindet
- Automatisierte Sicherheitsscans ohne technisches Vorwissen
- Transparente Provisionsabrechnung für alle Vertriebsebenen
- Skalierbare Infrastruktur für unbegrenzte Wachstumsmöglichkeiten

### Zielmärkte

| Markt | Beschreibung |
|-------|-------------|
| KMU Deutschland | Unternehmen mit Bedarf an Cybersecurity-Schutz |
| Call-Center | Vertriebspartner für Outbound-Verkauf |
| Vertriebspartner | Selbstständige Agenten im MLM-Netzwerk |
| Investoren | Skalierbare SaaS-Plattform mit Recurring Revenue |

### Warum ist das System skalierbar?

- **Serverless Architecture** — Supabase Edge Functions skalieren automatisch
- **Unbegrenzte Vertriebsbreite** — Jede Ebene kann beliebig viele Mitarbeiter haben
- **Automatisierte Prozesse** — Provisionen, Berichte und Scans laufen vollautomatisch
- **Multi-Tenant-fähig** — Mehrere unabhängige Vertriebsstrukturen parallel möglich

---

## 2. Gesamtarchitektur der Plattform

```
┌─────────────────────────────────────────────────────────────────┐
│                    GAP Protection Ltd.                          │
│                    Plattform-Architektur                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   PROJEKT 1          │    │   PROJEKT 2                  │  │
│  │   MLM-Vertrieb       │    │   Cybersecurity Scanner      │  │
│  │   (React + Supabase) │    │   (Python + React)           │  │
│  └──────────┬───────────┘    └──────────────┬───────────────┘  │
│             │                               │                  │
├─────────────▼───────────────────────────────▼──────────────────┤
│                     FRONTEND LAYER                              │
│   React 18 + TypeScript + Tailwind CSS + shadcn/ui             │
│   17 Seiten · Responsive Design · Dark/Light Mode              │
├─────────────────────────────────────────────────────────────────┤
│                     API LAYER                                   │
│   Supabase Edge Functions (Deno/TypeScript) · 60 Funktionen    │
│   REST API · CORS · Rate Limiting · JWT Authentication         │
├─────────────────────────────────────────────────────────────────┤
│                     DATABASE LAYER                              │
│   PostgreSQL (Supabase) · Row Level Security (RLS)             │
│   50 Migrations · Audit Logs · Encrypted PII                   │
├─────────────────────────────────────────────────────────────────┤
│                     SECURITY LAYER                              │
│   WAF · 2FA · SIEM · Fraud Detection · Rate Limiting           │
│   11.445 Vulnerability Templates (YAML)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Technologie-Stack

| Schicht | Technologie | Version |
|---------|-------------|---------|
| Frontend | React + TypeScript | 18.x |
| UI-Framework | Tailwind CSS + shadcn/ui | 3.x |
| Backend | Supabase Edge Functions (Deno) | 1.x |
| Datenbank | PostgreSQL (Supabase) | 15.x |
| ORM | Supabase Client + Drizzle | 2.x |
| Scanner Backend | Python (Flask + asyncio) | 3.11+ |
| Scanner Frontend | React + TypeScript | 18.x |
| Authentifizierung | Supabase Auth + JWT | — |
| Hosting | cPanel (Apache) | — |
| CDN/DNS | Cloudflare | — |

### Infrastruktur

```
Internet
    │
    ▼
Cloudflare (DNS + DDoS-Schutz)
    │
    ├── gap-protection.pro      → Python-Webify Scanner
    └── gapprotectionltd.com    → MLM-Vertriebssystem
            │
            ▼
    cPanel Hosting (76.13.5.114)
            │
            ▼
    Supabase Cloud (pqnzsihfryjnnhdubisk)
    ├── PostgreSQL Datenbank
    ├── 60 Edge Functions
    ├── Auth Service
    └── Storage
```

---

## 3. MLM-Vertriebssystem

### Hierarchiestruktur

Das System verwendet ein **Rolling 5-Level Sliding Window** Modell. Die Hierarchie kann unbegrenzt tief wachsen, aber Provisionen werden immer nur für die **5 nächsten Vorfahren** des Verkäufers berechnet.

```
Ebene 1: Geschäftsführer    (1 Person — Chef des Unternehmens)
    └── Ebene 2: Verkaufsleiter    (unbegrenzt viele)
            └── Ebene 3: Regional Manager  (unbegrenzt viele)
                    └── Ebene 4: Teamleiter        (unbegrenzt viele)
                            └── Ebene 5: Agent             (unbegrenzt viele)
                                    └── Ebene 6+: möglich, Fenster verschiebt sich
```

**Wichtige Eigenschaften:**
- Breite: Jede Ebene kann unbegrenzt viele Mitarbeiter haben
- Tiefe: Unbegrenzt — das System speichert bis zu 20 Ebenen
- Provision: Immer nur die 5 nächsten Vorfahren des Verkäufers
- Niemand wird aus dem System entfernt — nur aus dem Provisionsfenster

### Promotioncode-System

Jeder Mitarbeiter erhält bei der Registrierung eine eindeutige **Mitarbeiternummer** (z.B. `1001`, `1042`, `2087`). Diese Nummer dient gleichzeitig als **Promotioncode**.

```
Ablauf eines Verkaufs:
1. Kunde besucht gapprotectionltd.com
2. Kunde gibt Promotioncode "1042" ein
3. System erkennt: Code 1042 = Agent Max Müller
4. Kunde zahlt Sonderpreis: 299 €
5. System speichert: Kunde → Agent 1042
6. Provision wird automatisch durch das Sliding Window berechnet
7. Alle 5 Vorfahren erhalten ihre Provision gutgeschrieben
8. Jeder sieht seine Provision in seinem Dashboard
```

### Automatisches Verkaufstracking

Das System speichert bei jedem Verkauf:
- Welcher Promotioncode wurde verwendet
- Welchem Agenten gehört dieser Code
- Datum und Uhrzeit des Verkaufs
- Betrag der Transaktion
- Status der Provision (pending → approved → paid)
- Vollständige Audit-Trail für alle Aktionen

---

## 4. Provisionsberechnung — Rolling 5-Level Sliding Window

### Provisionssätze (konfigurierbar in der Datenbank)

| Level | Beschreibung | Provision | Bei 299 € |
|-------|-------------|-----------|-----------|
| Level 1 | Direkter Sponsor des Verkäufers | 10% | 29,90 € |
| Level 2 | 2. Vorfahre | 8% | 23,92 € |
| Level 3 | 3. Vorfahre | 6% | 17,94 € |
| Level 4 | 4. Vorfahre | 4% | 11,96 € |
| Level 5 | 5. Vorfahre (oberstes Fenster) | 2% | 5,98 € |
| Level 6+ | Außerhalb des Fensters | 0% | 0,00 € |

**Gesamtprovision pro Verkauf:** 30% = 89,70 € von 299 €

### Beispiel: Tiefe 5 (normaler Fall)

```
Struktur: A → B → C → D → E
E verkauft ein Produkt für 299 €

Provisionsfenster (relativ zu E):
  E's Sponsor D  = Level 1 → 10% = 29,90 €  ✅
  C              = Level 2 →  8% = 23,92 €  ✅
  B              = Level 3 →  6% = 17,94 €  ✅
  A              = Level 4 →  4% = 11,96 €  ✅
  (kein Level 5) = Level 5 →  2% =  0,00 €  —
```

### Beispiel: Tiefe 6 — Fenster verschiebt sich

```
Struktur: A → B → C → D → E → F
F wird unter E registriert. F verkauft für 299 €

Provisionsfenster verschiebt sich (relativ zu F):
  F's Sponsor E  = Level 1 → 10% = 29,90 €  ✅
  D              = Level 2 →  8% = 23,92 €  ✅
  C              = Level 3 →  6% = 17,94 €  ✅
  B              = Level 4 →  4% = 11,96 €  ✅
  A              = Level 5 →  2% =  5,98 €  ✅

  A ist jetzt Level 5 — bekommt noch 2%
```

### Beispiel: Tiefe 7 — A fällt raus

```
Struktur: A → B → C → D → E → F → G
G verkauft für 299 €

Provisionsfenster (relativ zu G):
  G's Sponsor F  = Level 1 → 10% = 29,90 €  ✅
  E              = Level 2 →  8% = 23,92 €  ✅
  D              = Level 3 →  6% = 17,94 €  ✅
  C              = Level 4 →  4% = 11,96 €  ✅
  B              = Level 5 →  2% =  5,98 €  ✅
  A              = Level 6 →  0% =  0,00 €  ❌ außerhalb Fenster
```

### Technische Implementierung

Die Berechnung erfolgt in der Edge Function `calculate-commissions/index.ts`:

```typescript
// Sliding Window: Rates für Level 1..min(depth,5)
const DEFAULT_RATES: Record<number, number> = {
  1: 10,  // direkter Sponsor
  2: 8,
  3: 6,
  4: 4,
  5: 2,   // oberstes Fenster
}

// Provision = Verkaufspreis × Rate / 100
// Beispiel: 299 € × 10% = 29,90 €
```

Die Provisionssätze sind **vollständig konfigurierbar** über das Admin-Dashboard und werden in der Tabelle `mlm_settings` gespeichert.

---

## 5. Benutzerrollen

Das System verwendet ein rollenbasiertes Zugriffskontrollsystem (RBAC). Jeder Benutzer kann eine oder mehrere Rollen haben.

### Rollenübersicht

#### `super_admin` — Super-Administrator
| Eigenschaft | Beschreibung |
|-------------|-------------|
| Zugriff | Vollzugriff auf alle Systeme und Daten |
| Dashboard | MLM-Dashboard, Admin-Panel, alle Dashboards |
| Rechte | Alle Einstellungen ändern, alle Partner verwalten, alle Strukturen sehen |
| Besonderheit | Kann Provisionssätze ändern, Strukturen erstellen, Benutzer löschen |

#### `admin` — Administrator
| Eigenschaft | Beschreibung |
|-------------|-------------|
| Zugriff | MLM-Verwaltung, Partner-Verwaltung |
| Dashboard | MLM-Dashboard, Admin-Panel |
| Rechte | Partner hinzufügen/bearbeiten, Provisionen genehmigen |
| Besonderheit | Kann eigene Struktur verwalten, aber keine globalen Einstellungen |

#### `partner` — Vertriebspartner
| Eigenschaft | Beschreibung |
|-------------|-------------|
| Zugriff | Eigenes Dashboard, eigene Downline |
| Dashboard | Partner-Dashboard (`/dashboard`) |
| Rechte | Eigene Statistiken sehen, Promotioncode nutzen, Downline anzeigen |
| Besonderheit | Erhält Provisionen aus dem Sliding Window, kann neue Partner werben |

#### `cc_broker` — Call-Center-Broker
| Eigenschaft | Beschreibung |
|-------------|-------------|
| Zugriff | Broker-Dashboard, Call-Center-Verwaltung |
| Dashboard | Broker-Dashboard (`/broker`) |
| Rechte | Call-Center erstellen, Provisionen für Call-Center setzen, Statistiken aller eigenen Call-Center |
| Besonderheit | Verwaltet mehrere Call-Center gleichzeitig, setzt individuelle Provisionssätze |

#### `callcenter` — Call-Center-Mitarbeiter
| Eigenschaft | Beschreibung |
|-------------|-------------|
| Zugriff | Call-Center-Dashboard |
| Dashboard | Call-Center-Dashboard (`/callcenter`) |
| Rechte | Eigene Mitarbeiter verwalten, Verkaufsergebnisse sehen |
| Besonderheit | Kann Mitarbeiter anlegen, Verkäufe tracken, Provisionen einsehen |

### Rollenhierarchie

```
super_admin
    └── admin
            ├── partner
            ├── cc_broker
            │       └── callcenter
            └── (weitere Rollen möglich)
```

---

## 6. Frontend-Architektur

Das Frontend besteht aus **17 Seiten**, entwickelt mit React 18, TypeScript und Tailwind CSS.

### Seitenübersicht

#### `Index.tsx` — Startseite (`/`)
Öffentliche Landing Page von GAP Protection Ltd. Präsentiert die Cybersecurity-Dienstleistungen, Preise und einen Call-to-Action für die Registrierung. Enthält Promotioncode-Eingabe für Sonderpreise.

#### `Auth.tsx` — Login & Registrierung (`/auth`)
Kombinierte Login- und Registrierungsseite mit Supabase Auth. Unterstützt E-Mail/Passwort-Login, Passwort-Reset und Weiterleitung basierend auf Benutzerrolle.

#### `Register.tsx` — Mitglieder-Registrierung (`/register`)
Mehrstufiges Registrierungsformular (6 Schritte) mit:
- Persönliche Daten (Name, Geburtsdatum, Ausweisnummer)
- Adresse (mit automatischer Vervollständigung)
- IBAN-Validierung (für Provisionsauszahlungen)
- Promotioncode-Eingabe (verknüpft mit Sponsor)
- Datenschutz & AGB-Zustimmung
- Mindestalter-Prüfung (18 Jahre)

#### `Dashboard.tsx` — Partner-Dashboard (`/dashboard`)
Persönliches Dashboard für Vertriebspartner mit:
- Statistiken (Downline, Provisionen, aktive Codes)
- Promotioncode-Anzeige und Kopierfunktion
- Provisionsübersicht (pending/approved/paid)
- Hierarchie-Anzeige (eigene Downline)
- Wallet-Guthaben
- Leadership-Pool-Anzeige
- Monatliche Berichte

#### `MLMDashboard.tsx` — MLM-Admin-Dashboard (`/mlm`)
Vollständiges Verwaltungs-Dashboard für Admins und Struktur-Admins (1.606 Zeilen). Enthält:
- Übersicht aller Partner und Provisionen
- Downline-Verwaltung (hinzufügen/bearbeiten/löschen)
- Baumansicht der gesamten Hierarchie
- Provisionsübersicht mit Level-Statistiken
- Profil-Bearbeitung
- Einstellungsverwaltung (Provisionssätze, Texte, Branding)
- Eigenes Login-System (unabhängig vom Haupt-Login)

#### `Admin.tsx` — Haupt-Admin-Panel (`/admin`)
Zentrales Verwaltungspanel für Super-Admins mit Zugriff auf alle Systembereiche, Benutzer, Transaktionen und Systemkonfiguration.

#### `BrokerDashboard.tsx` — Broker-Dashboard (`/broker`)
Dashboard für CC-Broker mit:
- Statistiken aller verwalteten Call-Center
- Call-Center erstellen und verwalten
- Individuelle Provisionssätze pro Call-Center setzen
- Provisionsübersicht aller Call-Center

#### `CallCenterDashboard.tsx` — Call-Center-Dashboard (`/callcenter`)
Dashboard für Call-Center-Manager mit:
- Mitarbeiterverwaltung (hinzufügen/bearbeiten)
- Verkaufsergebnisse pro Mitarbeiter
- Provisionsübersicht
- Mitarbeiter-Earnings-Tracking

#### `CRMDashboard.tsx` — CRM-System (`/crm`)
Vollständiges Customer Relationship Management mit:
- Kontaktverwaltung (Firmen, Ansprechpartner)
- Status-Tracking (Neu → Kontaktiert → Interessiert → Verhandlung → Kunde)
- Notizen und Erinnerungen pro Kontakt
- Penetrationstest-Datum und Bedrohungslevel
- Export-Funktionen

#### `AccountingDashboard.tsx` — Buchhaltung (`/accounting`)
Finanzdashboard mit:
- Umsatzstatistiken (heute/Monat/Jahr)
- Brutto/Netto/MwSt-Aufschlüsselung (19% MwSt)
- Umsatz pro Vertriebslinie
- Umsatz pro Call-Center
- Download-Funktionen für Berichte

#### `SecurityDashboard.tsx` — Sicherheits-Dashboard (`/security`)
Vollständiges Cybersecurity-Dashboard mit:
- Domain-Schutz-Verwaltung (WAF, DDoS, SSL)
- Bedrohungs-Logs und Incident-Tracking
- Sicherheits-Scan-Ergebnisse
- Schwachstellen-Template-Manager (11.445 Templates)
- Echtzeit-Bedrohungsanalyse

#### `Portal.tsx` — Kunden-Portal (`/portal`)
Self-Service-Portal für Endkunden mit Zugriff auf ihre Scan-Ergebnisse, Verträge und Sicherheitsberichte.

#### `PromoDisplay.tsx` — Promotioncode-Anzeige (`/promo`)
Öffentliche Seite zur Anzeige von Promotioncode-Informationen und Sonderpreisen.

#### `CRMDashboard.tsx`, `Contact.tsx`, `Legal.tsx`, `SecurityTest.tsx`, `NotFound.tsx`
Weitere Seiten für Kontakt, Impressum/Datenschutz, Sicherheitstests und 404-Fehlerbehandlung.

---

## 7. Backend — Edge Functions (60 Serverless-Funktionen)

Alle Backend-Logik läuft als Serverless Functions auf Supabase (Deno/TypeScript). Jede Funktion ist unabhängig, skaliert automatisch und ist durch JWT-Authentifizierung gesichert.

### MLM & Vertrieb

| Funktion | Aufgabe |
|----------|---------|
| `mlm-dashboard` | Hauptverwaltung: Login, Partner CRUD, Provisionen, Einstellungen, Hierarchie |
| `partner-dashboard` | Partner-Statistiken, eigene Downline, Provisionsübersicht, Wallet |
| `calculate-commissions` | Sliding Window Provisionsberechnung bei jedem Verkauf (automatisch) |
| `rebuild-hierarchy` | Gesamte Hierarchie für alle Partner neu aufbauen |
| `build-hierarchy` | Hierarchie für einen einzelnen Partner aufbauen |
| `admin-commissions` | Admin: Provisionen genehmigen, ablehnen, auszahlen |
| `admin-partners` | Admin: Partner verwalten, Status ändern, Rollen zuweisen |
| `promote-partner` | Partner in eine höhere Hierarchieebene befördern |
| `volume-tracker` | Verkaufsvolumen pro Partner und Ebene verfolgen |
| `bonus-engine` | Bonus-Berechnungen (Leadership Pool, Sonderboni) |
| `admin-leadership-pool` | Leadership-Pool verwalten und verteilen |
| `calculate-pool` | Pool-Berechnung für Führungskräfte |

### Promotioncode-System

| Funktion | Aufgabe |
|----------|---------|
| `create-promotion-code` | Neuen Promotioncode für einen Partner erstellen |
| `validate-promo-code` | Promotioncode prüfen: gültig? Welcher Rabatt? Welcher Agent? |
| `get-promotion-codes` | Alle aktiven Codes eines Partners abrufen |
| `update-promotion-code` | Code-Einstellungen aktualisieren |
| `delete-promotion-code` | Code deaktivieren |
| `promo-code-manager` | Vollständige Code-Verwaltung (CRUD) |

### Finanzen & Wallet

| Funktion | Aufgabe |
|----------|---------|
| `wallet-engine` | Guthaben abfragen, einzahlen (credit), abbuchen (debit), auszahlen (withdraw) |
| `create-transaction` | Neue Transaktion erstellen und Provisionsberechnung auslösen |
| `activate-contract` | Kundenvertrag aktivieren und Zahlung verarbeiten |
| `monthly-billing` | Monatliche Abrechnung für alle aktiven Verträge |
| `generate-credit-notes` | Gutschriften für Provisionen generieren |
| `generate-monthly-report` | Monatsbericht (PDF) für Partner erstellen |
| `easybill-integration` | Synchronisation mit Easybill Buchhaltungssystem |
| `cc-commissions` | Call-Center Provisionen berechnen und verteilen |

### Call-Center & Broker

| Funktion | Aufgabe |
|----------|---------|
| `broker-dashboard` | Broker: Call-Center erstellen, Provisionen setzen, Statistiken |
| `callcenter-dashboard` | Call-Center: Mitarbeiter verwalten, Verkäufe tracken |
| `callcenter-api` | REST-API für Call-Center-Integrationen |
| `manage-call-center` | Call-Center-Verwaltung (Status, Einstellungen) |

### CRM & Kunden

| Funktion | Aufgabe |
|----------|---------|
| `crm-api` | Vollständige CRM-API: Kontakte, Notizen, Erinnerungen, Status |
| `register` | Neue Mitglieder registrieren mit Promotioncode-Verknüpfung |
| `send-welcome-email` | Willkommens-E-Mail nach Registrierung senden |
| `get-dashboard-stats` | Aggregierte Dashboard-Statistiken abrufen |
| `get-partners-list` | Gefilterte Partnerliste für Admin-Ansichten |

### Cybersecurity-Dienste

| Funktion | Aufgabe |
|----------|---------|
| `security-scan` | Vollständigen Sicherheitsscan für eine Domain starten |
| `security-dashboard-api` | Sicherheits-Dashboard Daten (Scans, Bedrohungen, Domains) |
| `light-scan` | Schneller Basis-Scan (Port-Check, SSL, Headers) |
| `scheduled-scan` | Automatischer geplanter Scan (täglich/wöchentlich) |
| `customer-scans` | Kunden-Scan-Ergebnisse verwalten und anzeigen |
| `fraud-detection` | Betrugserkennung: ungewöhnliche Transaktionen, Mehrfach-Registrierungen |
| `waf-protection` | Web Application Firewall: Angriffe blockieren und loggen |
| `siem-engine` | Security Information & Event Management: Ereignisse korrelieren |
| `incident-response` | Sicherheitsvorfälle automatisch bearbeiten |
| `adversary-simulation` | Angriffssimulation für Penetrationstests |
| `ai-threat-analysis` | KI-gestützte Bedrohungsanalyse mit Empfehlungen |
| `ai-chat` | KI-Chatbot für Sicherheitsfragen (RAG-basiert) |
| `auto-protect` | Automatischer Schutz: Bedrohungen erkennen und blockieren |
| `domain-monitor` | Domain-Überwachung: Verfügbarkeit, SSL-Ablauf, Blacklist |
| `generate-security-report` | Professionellen Sicherheitsbericht (PDF) generieren |

### Systemadministration

| Funktion | Aufgabe |
|----------|---------|
| `admin-users` | Benutzer verwalten: erstellen, sperren, Rollen zuweisen |
| `admin-portals` | Kunden-Portale verwalten |
| `portal-dashboard` | Portal-Dashboard für Endkunden |
| `session-manager` | Sitzungsverwaltung: aktive Sessions, Logout erzwingen |
| `setup-2fa` | Zwei-Faktor-Authentifizierung einrichten (TOTP) |
| `verify-2fa` | 2FA-Code verifizieren |
| `setup-admin` | Ersten Admin-Account einrichten |
| `reset-admin-password` | Admin-Passwort zurücksetzen |
| `seed-test-accounts` | Test-Konten für Entwicklung erstellen |
| `backup-to-vps` | Datenbank-Backup auf VPS-Server |
| `generate-contract-pdf` | Kundenvertrag als PDF generieren |

---

## 8. Datenbankstruktur

Die Datenbank läuft auf PostgreSQL (Supabase) mit **50 Migrationsdateien** und vollständiger Row Level Security (RLS).

### Wichtigste Tabellen

#### `profiles` — Benutzerprofile
```sql
id              UUID PRIMARY KEY
user_id         UUID (→ auth.users)
first_name      TEXT
last_name       TEXT
email           TEXT UNIQUE
phone           TEXT
street          TEXT
house_number    TEXT
postal_code     TEXT
city            TEXT
iban            TEXT (verschlüsselt)
id_number       TEXT (Ausweisnummer)
date_of_birth   DATE
partner_number  TEXT UNIQUE  -- = Promotioncode
promotion_code  TEXT UNIQUE
sponsor_id      UUID (→ profiles.id)  -- direkter Sponsor
org_level       INTEGER (1-5)
role            TEXT
status          TEXT (active/inactive/pending)
created_at      TIMESTAMPTZ
```

#### `user_hierarchy` — Hierarchie-Beziehungen (Sliding Window)
```sql
id                       UUID PRIMARY KEY
user_id                  UUID (→ profiles.id)  -- der Verkäufer
ancestor_id              UUID (→ profiles.id)  -- der Vorfahre
level_number             INTEGER  -- Abstand (1=direkter Sponsor, 5=oberstes Fenster)
is_active_for_commission BOOLEAN  -- TRUE wenn level_number <= 5
created_at               TIMESTAMPTZ
updated_at               TIMESTAMPTZ
UNIQUE(user_id, ancestor_id)
```

**Beziehung:** Für jeden Verkäufer werden alle Vorfahren gespeichert. `is_active_for_commission = TRUE` nur für die 5 nächsten (Sliding Window).

#### `commissions` — Provisionen
```sql
id                UUID PRIMARY KEY
transaction_id    UUID (→ transactions.id)
partner_id        UUID (→ profiles.id)
level_number      INTEGER  -- auf welcher Ebene des Fensters
commission_type   TEXT ('percentage')
base_amount       NUMERIC  -- Verkaufspreis (z.B. 299.00)
commission_amount NUMERIC  -- berechnete Provision (z.B. 29.90)
status            TEXT (pending/approved/paid/rejected)
created_at        TIMESTAMPTZ
```

#### `wallets` — Guthaben
```sql
id                UUID PRIMARY KEY
profile_id        UUID UNIQUE (→ profiles.id)
available_balance NUMERIC DEFAULT 0
pending_balance   NUMERIC DEFAULT 0
total_earned      NUMERIC DEFAULT 0
total_withdrawn   NUMERIC DEFAULT 0
currency          TEXT DEFAULT 'EUR'
updated_at        TIMESTAMPTZ
```

#### `transactions` — Verkäufe/Käufe
```sql
id              UUID PRIMARY KEY
customer_id     UUID (→ profiles.id)
amount          NUMERIC  -- Verkaufspreis
status          TEXT (pending/completed/failed/refunded)
promo_code      TEXT  -- verwendeter Promotioncode
commission_processed BOOLEAN DEFAULT FALSE
created_at      TIMESTAMPTZ
```

#### `promotion_codes` — Promotioncodes
```sql
id              UUID PRIMARY KEY
profile_id      UUID (→ profiles.id)
code            TEXT UNIQUE  -- = Mitarbeiternummer
discount_amount NUMERIC  -- Rabatt in EUR
discount_type   TEXT (fixed/percentage)
is_active       BOOLEAN
usage_count     INTEGER
max_usage       INTEGER
expires_at      TIMESTAMPTZ
```

#### `partner_numbers` — Mitarbeiternummern
```sql
id              UUID PRIMARY KEY
profile_id      UUID (→ profiles.id)
partner_number  TEXT UNIQUE
base_number     TEXT  -- Struktur-Basis
sub_number      TEXT
level_in_structure INTEGER
```

#### `mlm_settings` — Konfigurierbare Einstellungen
```sql
key             TEXT PRIMARY KEY
value           JSONB  -- flexibler Wert
label           TEXT   -- Anzeigename
category        TEXT   -- commissions/labels/branding/general
updated_at      TIMESTAMPTZ
updated_by      UUID (→ profiles.id)
```

Wichtige Einstellungen:
- `commission_rate_level_1` bis `commission_rate_level_5` — Provisionssätze
- `max_levels` — Fenstergröße (Standard: 5)
- `window_size` — Sliding Window Größe

#### `audit_log` — Vollständiges Aktivitätsprotokoll
```sql
id          UUID PRIMARY KEY
action      TEXT  -- z.B. 'COMMISSIONS_CALCULATED', 'PARTNER_CREATED'
table_name  TEXT
record_id   UUID
old_data    JSONB
new_data    JSONB
user_id     UUID
ip_address  TEXT
created_at  TIMESTAMPTZ
```

#### `cc_brokers` — Call-Center-Broker
```sql
id              UUID PRIMARY KEY
profile_id      UUID (→ profiles.id)
company_name    TEXT
commission_rate NUMERIC
is_active       BOOLEAN
created_at      TIMESTAMPTZ
```

#### `callcenters` — Call-Center
```sql
id              UUID PRIMARY KEY
broker_id       UUID (→ cc_brokers.id)
name            TEXT
email           TEXT
phone           TEXT
commission_rate NUMERIC
is_active       BOOLEAN
created_at      TIMESTAMPTZ
```

### Tabellenbeziehungen

```
auth.users
    │ 1:1
    ▼
profiles ──────────────────────────────────────────┐
    │ 1:N (sponsor_id)                              │
    ├── user_hierarchy (user_id + ancestor_id)      │
    ├── commissions (partner_id)                    │
    ├── wallets (profile_id)                        │
    ├── transactions (customer_id)                  │
    ├── promotion_codes (profile_id)                │
    ├── partner_numbers (profile_id)                │
    ├── cc_brokers (profile_id)                     │
    └── user_roles (user_id) ──────────────────────┘

transactions
    │ 1:N
    └── commissions (transaction_id)

cc_brokers
    │ 1:N
    └── callcenters (broker_id)
```

---

## 9. Cybersecurity Scanner — Python-Webify

### Was ist Python-Webify?

Python-Webify ist eine professionelle Cybersecurity-Scanner-Plattform für Unternehmen. Sie analysiert Websites, Server und kritische Infrastruktur auf Sicherheitslücken und erstellt detaillierte Berichte auf Deutsch und Englisch.

**Live-URL:** `gap-protection.pro`

### Technologie-Stack

| Schicht | Technologie |
|---------|-------------|
| Scanner-Backend | Python 3.11+ (asyncio, aiohttp) |
| Web-Framework | Flask (REST API) |
| Frontend | React + TypeScript + Tailwind CSS |
| Datenbank | PostgreSQL (Drizzle ORM) |
| Containerisierung | Docker + Docker Compose |
| Vulnerability-Datenbank | 11.445 YAML-Templates |

### Scanner-Module (8 Module)

#### `advanced_scanner.py` — Erweiterter Scanner
Professioneller Scanner für Banken, Call-Center und kritische Infrastruktur. Verwendet asyncio für parallele Scans. Lädt automatisch alle 11.445 YAML-Vulnerability-Templates.

```python
class AdvancedSecurityScanner:
    """
    Professional-grade security scanner for:
    - Banks
    - Call Centers
    - Enterprise websites
    - Critical infrastructure
    """
```

**Berechtigungssystem:**
- Admin / Partner / CallCenter → können ohne Registrierung scannen
- Normale Benutzer → müssen sich erst registrieren

#### `ultra_advanced_scanner.py` — Ultra-Erweiterter Scanner
Erweiterter Scanner mit zusätzlichen Modulen für tiefere Analyse, Fingerprinting und erweiterte Payload-Tests.

#### `scanner_unified.py` — Einheitlicher Scanner
Kombiniert alle Scanner-Module in einer einheitlichen API. Wird vom Frontend direkt aufgerufen.

#### `complete_scan.py` — Vollständiger Scan
Führt alle verfügbaren Scan-Module nacheinander aus und erstellt einen konsolidierten Bericht.

#### `scanner.py` — Basis-Scanner
Grundlegender Scanner für schnelle Checks: Ports, SSL, HTTP-Headers.

#### `teufel_scanner.py` — Spezialisierter Scanner
Spezialisierter Scanner für erweiterte Angriffsvektoren und komplexe Schwachstellenanalyse.

#### `reconic_wrapper.py` — Reconnaissance-Wrapper
Wrapper für Reconnaissance-Tools: DNS-Enumeration, Subdomain-Discovery, WHOIS.

#### `main.py` — Hauptanwendung
Flask-Anwendung mit REST-API-Endpunkten für alle Scanner-Funktionen.

### Erkannte Sicherheitslücken

| Kategorie | Beschreibung |
|-----------|-------------|
| Offene Ports | Scan aller TCP/UDP-Ports, Identifikation gefährlicher Dienste |
| SSL/TLS | Veraltete Protokolle (SSLv3, TLS 1.0), abgelaufene Zertifikate, HSTS |
| HTTP-Headers | Fehlende Security-Headers (CSP, X-Frame-Options, HSTS) |
| SQL-Injection | Automatische Tests mit 1.000+ Payloads |
| XSS | Cross-Site-Scripting Tests (reflected, stored, DOM) |
| CSRF | Cross-Site Request Forgery Schwachstellen |
| Veraltete Software | Erkennung veralteter CMS, Frameworks, Server-Versionen |
| Fehlkonfigurationen | Directory Listing, Debug-Modus, Standard-Passwörter |
| Blacklist-Check | Prüfung gegen bekannte Malware/Spam-Blacklists |
| Fingerprinting | Technologie-Erkennung (CMS, Framework, Server) |

### Vulnerability-Datenbank

Das System enthält **11.445 YAML-Vulnerability-Templates** im Verzeichnis `vuln/`. Diese Templates werden beim Start automatisch geladen:

```python
def load_yaml_payloads_for_app(vuln_dir: str = None) -> Dict[str, list]:
    """Load YAML vulnerability payloads from vuln/ directory"""
    for yf in vuln_path.rglob("*.yaml"):
        # Lädt Payloads für SQL-Injection, XSS, CSRF, etc.
```

### Ausgabeformate

| Format | Beschreibung |
|--------|-------------|
| JSON | Maschinenlesbare Ergebnisse für API-Integration |
| TXT | Lesbare Textberichte |
| PDF | Professionelle Sicherheitsberichte für Kunden |
| Deutsch | Alle Berichte auf Deutsch verfügbar |
| Englisch | Alle Berichte auf Englisch verfügbar |

### Beispiel-Scan-Ergebnis

```json
{
  "domain": "example.com",
  "score": 72,
  "threatLevel": "MEDIUM",
  "ssl": { "valid": true, "protocol": "TLS 1.3", "hsts": true },
  "openPorts": [80, 443, 22],
  "vulnerabilities": [
    { "type": "missing_header", "detail": "X-Frame-Options fehlt", "severity": "medium" },
    { "type": "outdated_software", "detail": "Apache 2.4.41 (veraltet)", "severity": "high" }
  ]
}
```

---

## 10. Sicherheitssystem

GAP Protection verwendet ein mehrschichtiges Sicherheitssystem nach Enterprise-Standard.

### Row Level Security (RLS)

Jede Datenbanktabelle hat RLS-Policies, die sicherstellen, dass Benutzer nur ihre eigenen Daten sehen können:

```sql
-- Beispiel: Partner sieht nur eigene Provisionen
CREATE POLICY "partner_own_commissions" ON commissions
  FOR SELECT USING (partner_id = auth.uid());

-- Admin sieht alle Provisionen
CREATE POLICY "admin_all_commissions" ON commissions
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

### Audit Logs

Alle kritischen Aktionen werden in der `audit_log`-Tabelle protokolliert:
- Partner erstellt/bearbeitet/gelöscht
- Provisionen berechnet/genehmigt/ausgezahlt
- Einstellungen geändert
- Login-Versuche (erfolgreich und fehlgeschlagen)
- Wallet-Transaktionen

### Rate Limiting

Jede Edge Function hat Rate Limiting zum Schutz vor Brute-Force und DDoS:

```typescript
// Beispiel: Wallet-Funktion
if (!checkRateLimit(`wallet:${callerProfileId}`, 30, 60_000)) {
  return jsonResponse({ error: 'Zu viele Anfragen' }, 429, corsHeaders)
}
// Max 30 Anfragen pro Minute pro Benutzer
```

### Zwei-Faktor-Authentifizierung (2FA)

- TOTP-basiert (Time-based One-Time Password)
- Einrichtung über `setup-2fa` Edge Function
- Verifizierung über `verify-2fa` Edge Function
- Pflicht für Admin-Konten empfohlen

### Web Application Firewall (WAF)

Die `waf-protection` Edge Function blockiert:
- SQL-Injection-Versuche
- XSS-Angriffe
- Path-Traversal-Angriffe
- Bekannte Angriffs-Signaturen
- Verdächtige User-Agents

### Fraud Detection

Die `fraud-detection` Funktion erkennt:
- Mehrfach-Registrierungen mit gleicher E-Mail/IBAN
- Ungewöhnliche Transaktionsmuster
- Verdächtige Promotioncode-Nutzung
- Anomalien in der Provisionsberechnung

### SIEM (Security Information & Event Management)

Die `siem-engine` Funktion:
- Korreliert Sicherheitsereignisse aus allen Quellen
- Erkennt Angriffsmuster über Zeit
- Generiert Sicherheits-Alerts
- Erstellt Compliance-Berichte

### PII-Verschlüsselung

Persönlich identifizierbare Informationen (PII) werden verschlüsselt gespeichert:
- IBAN-Nummern
- Ausweisnummern
- Geburtsdaten

### Wie das System Angriffe verhindert

```
Angreifer versucht SQL-Injection
    │
    ▼
WAF erkennt Angriffsmuster → blockiert Request
    │
    ▼
SIEM loggt den Vorfall
    │
    ▼
Fraud Detection erhöht Risk-Score für IP
    │
    ▼
Rate Limiter blockiert weitere Anfragen von dieser IP
    │
    ▼
Incident Response benachrichtigt Admin
    │
    ▼
Audit Log speichert vollständigen Vorfall
```

---

## 11. Deployment & Infrastruktur

### Server-Konfiguration

| Parameter | Wert |
|-----------|------|
| Server-IP | `76.13.5.114` |
| Hosting | cPanel (Shared Hosting) |
| Web-Server | Apache 2.4 |
| PHP | 8.x (für cPanel) |
| SSL | Let's Encrypt (automatisch) |

### Domains

| Domain | Projekt | Status |
|--------|---------|--------|
| `gap-protection.pro` | Python-Webify Scanner | ✅ Live |
| `gapprotectionltd.com` | MLM-Vertriebssystem | ⏳ Upload ausstehend |

### Supabase-Projekt

| Parameter | Wert |
|-----------|------|
| Projekt-URL | `https://pqnzsihfryjnnhdubisk.supabase.co` |
| Region | EU (Frankfurt) |
| Datenbank | PostgreSQL 15 |
| Edge Functions | 60 Funktionen |
| Auth | Supabase Auth (JWT) |

### Build-Prozess

**MLM-System (React):**
```bash
cd remix-of-mlm-main
npm install
npm run build
# Output: dist/ (statische Dateien)
```

**Python-Webify:**
```bash
cd Python-Webify
npm install && npm run build
# Output: dist/public/ (Frontend)
# Backend: Python Flask (app.py)
```

### Deployment-Prozess

```
1. Lokaler Build
   npm run build → dist/

2. Upload via cPanel File Manager
   dist/ → public_html/ (gapprotectionltd.com)
   dist/public/ → public_html/ (gap-protection.pro)

3. .htaccess konfigurieren
   (bereits vorhanden in beiden Projekten)

4. Supabase Migrations ausführen
   SQL Editor → Migration einfügen → Ausführen

5. Edge Functions deployen
   supabase functions deploy --project-ref pqnzsihfryjnnhdubisk
```

### .htaccess Konfiguration

Beide Projekte haben eine `.htaccess`-Datei für:
- React Router (alle Routen auf `index.html` umleiten)
- HTTPS-Weiterleitung
- Sicherheits-Headers
- Caching-Regeln

---

## 12. Offene Aufgaben

### Priorität 1 — Supabase Migration ausführen

Die finale Rolling 5-Level Migration muss im Supabase SQL Editor ausgeführt werden:

**Datei:** `remix-of-mlm-main/supabase/migrations/20260316300000_rolling_5level_final.sql`

**Schritte:**
1. Supabase Dashboard öffnen: `https://supabase.com/dashboard`
2. Projekt `pqnzsihfryjnnhdubisk` auswählen
3. SQL Editor öffnen
4. Inhalt der Datei einfügen
5. Ausführen (Run)

**Was diese Migration macht:**
- Provisionssätze in `mlm_settings` eintragen (10%, 8%, 6%, 4%, 2%)
- `calculate_hierarchy()` Trigger-Funktion aktualisieren (Sliding Window)
- `get_commission_recipients()` Funktion erstellen
- `active_commission_chain` View erstellen
- Bestehende Hierarchie-Daten korrigieren

### Priorität 2 — Website-Upload

`gapprotectionltd.com` muss aktualisiert werden:

**Schritte:**
1. cPanel öffnen: `http://76.13.5.114/cpanel`
2. Login: `u429102106_GALAL1` / `galal123.DEg`
3. File Manager öffnen
4. `public_html/gapprotectionltd.com/` navigieren
5. Alle alten Dateien löschen
6. Inhalt von `remix-of-mlm-main/dist/` hochladen

### Priorität 3 — Edge Functions deployen (optional)

Falls Edge Functions aktualisiert wurden:
```bash
supabase functions deploy calculate-commissions --project-ref pqnzsihfryjnnhdubisk
supabase functions deploy mlm-dashboard --project-ref pqnzsihfryjnnhdubisk
supabase functions deploy broker-dashboard --project-ref pqnzsihfryjnnhdubisk
```

---

## 13. Zusammenfassung — Systemstatus

### Vollständige Modulübersicht

| Modul | Beschreibung | Status |
|-------|-------------|--------|
| **MLM-Vertriebssystem** | Vollständiges MLM mit Sliding Window | ✅ Fertig |
| **Rolling 5-Level Hierarchie** | Sliding Window Provisionsmodell | ✅ Fertig |
| **Promotioncode-System** | Mitarbeiternummer = Promotioncode | ✅ Fertig |
| **Provisionsberechnung** | Automatisch bei jedem Verkauf | ✅ Fertig |
| **Partner-Dashboard** | Persönliche Statistiken, Wallet, Downline | ✅ Fertig |
| **MLM-Admin-Dashboard** | Vollständige Verwaltung (1.606 Zeilen) | ✅ Fertig |
| **Broker-Dashboard** | Call-Center-Broker Verwaltung | ✅ Fertig |
| **Call-Center-Dashboard** | Mitarbeiter & Verkaufstracking | ✅ Fertig |
| **CRM-System** | Kundenverwaltung mit Status-Tracking | ✅ Fertig |
| **Buchhaltungs-Dashboard** | Umsatz, MwSt, Berichte | ✅ Fertig |
| **Sicherheits-Dashboard** | WAF, Scans, Bedrohungen | ✅ Fertig |
| **Kunden-Portal** | Self-Service für Endkunden | ✅ Fertig |
| **Wallet-System** | Guthaben, Einzahlungen, Auszahlungen | ✅ Fertig |
| **2FA-Authentifizierung** | TOTP-basierte Zwei-Faktor-Auth | ✅ Fertig |
| **Fraud Detection** | Betrugserkennung | ✅ Fertig |
| **WAF** | Web Application Firewall | ✅ Fertig |
| **SIEM** | Security Event Management | ✅ Fertig |
| **Audit Logs** | Vollständiges Aktivitätsprotokoll | ✅ Fertig |
| **Row Level Security** | Datenbankzugriffskontrolle | ✅ Fertig |
| **Cybersecurity Scanner** | Python-basierter Sicherheitsscanner | ✅ Fertig |
| **11.445 Vuln-Templates** | YAML-Vulnerability-Datenbank | ✅ Fertig |
| **PDF-Berichte** | Professionelle Sicherheitsberichte | ✅ Fertig |
| **Easybill-Integration** | Buchhaltungssystem-Anbindung | ✅ Fertig |
| **E-Mail-System** | Willkommens-E-Mails, Benachrichtigungen | ✅ Fertig |
| **60 Edge Functions** | Vollständige Backend-API | ✅ Fertig |
| **50 SQL-Migrations** | Vollständige Datenbankstruktur | ✅ Fertig |
| **gap-protection.pro** | Scanner-Website live | ✅ Live |
| **gapprotectionltd.com** | MLM-Website | ⏳ Upload ausstehend |
| **Supabase Migration** | Rolling 5-Level SQL | ⏳ Ausführen ausstehend |

### Statistiken

| Kennzahl | Wert |
|----------|------|
| Frontend-Seiten | 17 |
| Edge Functions | 60 |
| SQL-Migrations | 50 |
| Vulnerability-Templates | 11.445 |
| Scanner-Module | 8 |
| Benutzerrollen | 5 |
| Hierarchieebenen | 5 (unbegrenzte Tiefe) |
| Provisionsstufen | 5 (konfigurierbar) |
| Verkaufspreis | 299 € |
| Gesamtprovision | 30% = 89,70 € pro Verkauf |

### Fazit

Die GAP Protection Ltd. Plattform ist **vollständig entwickelt und produktionsbereit**. Beide Projekte — das MLM-Vertriebssystem und der Cybersecurity-Scanner — sind funktionsfähig, sicher und skalierbar.

Das System kann sofort für den produktiven Einsatz genutzt werden, sobald:
1. Die Supabase-Migration `20260316300000_rolling_5level_final.sql` ausgeführt wurde
2. Die Website `gapprotectionltd.com` über cPanel aktualisiert wurde

---

*Dokumentation erstellt: März 2026*
*Projekt: GAP Protection Ltd.*
*Supabase: pqnzsihfryjnnhdubisk.supabase.co*
*Server: 76.13.5.114*
