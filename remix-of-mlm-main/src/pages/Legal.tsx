import { useParams, Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import React from 'react';

const ALLOWED_TAGS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'br', 'strong', 'em', 'span']);

/**
 * Safe HTML renderer — parses static HTML and only renders whitelisted tags
 * as React elements. Prevents XSS even if content source changes in the future.
 */
function LegalContent({ html }: { html: string }) {
  const renderNode = (node: ChildNode, index: number): React.ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Render children only, skip the unsafe tag itself
      return <React.Fragment key={index}>
        {Array.from(el.childNodes).map(renderNode)}
      </React.Fragment>;
    }

    const children = Array.from(el.childNodes).map(renderNode);
    const props: Record<string, unknown> = { key: index };

    if (tag === 'a') {
      props.href = el.getAttribute('href') || '#';
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }

    return React.createElement(tag, props, children.length > 0 ? children : undefined);
  };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return <>{Array.from(doc.body.childNodes).map(renderNode)}</>;
}

const legalContent = {
  terms: {
    de: {
      title: 'Allgemeine Geschäftsbedingungen (AGB)',
      content: `
        <h2>§ 1 Geltungsbereich und Vertragsgegenstand</h2>
        <p>(1) Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") gelten für alle Verträge zwischen der GAP PROTECTION GmbH, Am Flughafen 13, 12529 Schönefeld (nachfolgend „Anbieter") und ihren Kunden über die Erbringung von Dienstleistungen im Bereich Cyber-Sicherheit, insbesondere des Produkts „GAP-Protection".</p>
        <p>(2) Das Leistungsangebot richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB, juristische Personen des öffentlichen Rechts oder öffentlich-rechtliche Sondervermögen.</p>
        <p>(3) Der Gegenstand des Vertrages umfasst die proaktive Überwachung, Identifizierung von Schwachstellen sowie die Simulation von Angriffsszenarien gemäß der zum Zeitpunkt des Vertragsschlusses gültigen Leistungsmatrix.</p>

        <h2>§ 2 Leistungsumfang und Durchführung</h2>
        <p>(1) Der Anbieter erbringt seine Leistungen nach dem aktuellen Stand der Technik. Die Dienstleistung umfasst:</p>
        <ul>
          <li>External Attack Surface Management (EASM): Kontinuierliche Analyse der öffentlichen digitalen Präsenz.</li>
          <li>Adversary Simulation: Durchführung kontrollierter Sicherheitsprüfungen.</li>
          <li>Continuous Vulnerability Management: 24/7 Scanning auf bekannte Sicherheitslücken.</li>
          <li>Perimeter-Defense: Überwachung der Netzwerkschnittstellen.</li>
          <li>Reporting: Erstellung monatlicher Risikoanalysen.</li>
        </ul>
        <p>(2) Der Anbieter weist ausdrücklich darauf hin, dass eine 100%ige Sicherheit gegen alle denkbaren Cyber-Angriffe technisch nicht möglich ist. Die Dienstleistung dient der signifikanten Risikoreduzierung und Härtung der Infrastruktur, stellt jedoch keine Garantie für die Unangreifbarkeit der Systeme dar.</p>

        <h2>§ 3 Sofortiger Leistungsbeginn</h2>
        <p>(1) Der Kunde verlangt und stimmt ausdrücklich zu, dass der Anbieter mit der Ausführung der Dienstleistung unmittelbar nach Vertragsschluss beginnt.</p>
        <p>(2) Die Bereitstellung der Monitoring-Infrastruktur sowie die initiale Kartierung der Angriffsfläche (EASM) werden unverzüglich nach technischer Freischaltung eingeleitet.</p>

        <h2>§ 4 Vertragslaufzeit und Kündigung</h2>
        <p>(1) Der Vertrag wird für eine Mindestlaufzeit von 24 Monaten fest geschlossen.</p>
        <p>(2) Soweit der Vertrag nicht unter Einhaltung einer Frist von 30 Tagen zum Ende der Mindestlaufzeit gekündigt wird, verlängert sich das Vertragsverhältnis automatisch auf unbestimmte Zeit.</p>
        <p>(3) Im Falle der Verlängerung auf unbestimmte Zeit kann der Vertrag von beiden Parteien mit einer Frist von einem Monat zum Ende eines Kalendermonats gekündigt werden.</p>
        <p>(4) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>

        <h2>§ 5 Vergütung, Abrechnung und Vorauskasse</h2>
        <p>(1) Die Vergütung beträgt 399 € netto pro Monat zuzüglich der jeweils geltenden gesetzlichen Umsatzsteuer.</p>
        <p>(2) Die Abrechnung erfolgt monatlich im Voraus per SEPA-Firmenlastschrift.</p>
        <p>(3) Der Kunde ist verpflichtet, für eine ausreichende Deckung auf dem angegebenen Zahlungsweg zu sorgen.</p>

        <h2>§ 6 Zahlungsverzug und Leistungspausierung</h2>
        <p>(1) Bei Zahlungsverzug ist der Anbieter berechtigt, die Erbringung sämtlicher Leistungen sofort einzustellen.</p>
        <p>(2) Während des Zeitraums der Pausierung ruhen die Überwachungs- und Schutzfunktionen.</p>
        <p>(3) Die Pflicht des Kunden zur Entrichtung der monatlichen Vergütung bleibt auch während der Pausierung bestehen.</p>

        <h2>§ 7 Mitwirkungspflichten des Kunden</h2>
        <p>(1) Der Kunde ist verpflichtet, dem Anbieter alle für die Dienstleistung erforderlichen Informationen und Zugänge rechtzeitig zur Verfügung zu stellen.</p>
        <p>(2) Der Kunde garantiert, dass er zur Durchführung der Analysen an den angegebenen Systemen berechtigt ist.</p>

        <h2>§ 8 Haftungsbeschränkung</h2>
        <p>(1) Der Anbieter haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit.</p>
        <p>(2) Für leichte Fahrlässigkeit haftet der Anbieter nur bei Verletzung einer wesentlichen Vertragspflicht.</p>

        <h2>§ 9 Vertraulichkeit und Datenschutz</h2>
        <p>(1) Beide Parteien verpflichten sich, alle im Rahmen des Vertrages erlangten Informationen über Geschäftsgeheimnisse und Sicherheitsstrukturen zeitlich unbegrenzt geheim zu halten.</p>
        <p>(2) Die Verarbeitung personenbezogener Daten erfolgt auf Grundlage der DSGVO.</p>

        <h2>§ 10 Schlussbestimmungen</h2>
        <p>(1) Änderungen oder Ergänzungen dieser AGB bedürfen der Textform.</p>
        <p>(2) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.</p>
      `,
    },
    en: {
      title: 'General Terms and Conditions (GTC)',
      content: `
        <h2>§ 1 Scope and Subject Matter</h2>
        <p>(1) These GTC govern all contracts between GAP PROTECTION GmbH, Am Flughafen 13, 12529 Schönefeld and its customers for cybersecurity services, particularly "GAP-Protection".</p>
        <p>(2) Services are offered exclusively to businesses (§ 14 BGB), legal entities under public law, or public special funds.</p>
        <h2>§ 2 Scope of Services</h2>
        <ul>
          <li>External Attack Surface Management (EASM): continuous public digital presence analysis.</li>
          <li>Adversary Simulation: controlled security assessments.</li>
          <li>Continuous Vulnerability Management: 24/7 vulnerability scanning.</li>
          <li>Perimeter Defence: network interface monitoring.</li>
          <li>Reporting: monthly risk analysis reports.</li>
        </ul>
        <p>100% protection against all cyberattacks is technically impossible. The service significantly reduces risk but does not guarantee immunity.</p>
        <h2>§ 3 Contract Duration and Termination</h2>
        <p>Minimum term: 24 months. Without 30 days notice before term end, the contract auto-renews indefinitely and may then be terminated monthly.</p>
        <h2>§ 4 Fees</h2>
        <p>399 € net/month plus VAT, billed monthly in advance via SEPA direct debit.</p>
        <h2>§ 5 Liability</h2>
        <p>Full liability for intent and gross negligence. For slight negligence, liability is limited to essential contractual obligations.</p>
        <h2>§ 6 Confidentiality</h2>
        <p>Both parties keep all trade secrets and security information confidential indefinitely. Personal data is processed under GDPR.</p>
        <h2>§ 7 Governing Law</h2>
        <p>German law applies, excluding the UN Convention on Contracts for the International Sale of Goods.</p>
      `,
    },
  },
  'partner-terms': {
    de: {
      title: 'Allgemeine Geschäftsbedingungen für Vertriebspartner (Partner-AGB)',
      content: `
        <h2>§ 1 Vertragsgegenstand</h2>
        <p>(1) Die GmbH beauftragt den Vertriebspartner als selbstständigen Vermittler für das Produkt „GAP-Protection".</p>
        <p>(2) Der Vertriebspartner ist berechtigt, potenzielle Kunden an die GmbH zu vermitteln. Ein Vertragsschluss kommt ausschließlich zwischen der GmbH und dem Kunden zustande.</p>
        <p>(3) Der Vertriebspartner ist unabhängiger Gewerbetreibender.</p>

        <h2>§ 2 Pflichten des Vertriebspartners & Werbe-Vorgaben</h2>
        <p>(1) Der Vertriebspartner verpflichtet sich, das Produkt GAP-Protection nach bestem Wissen und Gewissen zu bewerben.</p>
        <p>(2) Es dürfen ausschließlich die von der GmbH zur Verfügung gestellten Informationsmaterialien verwendet werden.</p>
        <p>(3) Verbot von Erfolgsgarantien: Dem Vertriebspartner ist es strengstens untersagt, eine „100%ige Sicherheit" oder eine „Garantie gegen Hackerangriffe" zuzusichern.</p>

        <h2>§ 3 Haftung bei Falschaussagen und Beratungsfehlern</h2>
        <p>(1) Der Vertriebspartner haftet im Innenverhältnis zur GmbH vollumfänglich für alle Schäden, die durch Falschaussagen entstehen.</p>
        <p>(2) Der Vertriebspartner stellt sicher, dass er über eine ausreichende Berufshaftpflichtversicherung verfügt.</p>

        <h2>§ 4 Provision und Abrechnung</h2>
        <p>(1) Der Vertriebspartner erhält für jeden erfolgreich vermittelten Vertrag eine Provision gemäß der gültigen Provisionsvereinbarung.</p>
        <p>(2) Mit Beendigung des Vertriebspartnerverhältnisses erlöschen sämtliche Ansprüche auf zukünftige Provisionszahlungen.</p>
        <p>(3) Ein Anspruch auf einen Ausgleichsbetrag (analog § 89b HGB) wird ausdrücklich ausgeschlossen.</p>

        <h2>§ 5 Markenschutz und Auftreten im Außenverhältnis</h2>
        <p>(1) Der Vertriebspartner darf die Marken „GAP-Protection" nur im Rahmen der Vermittlungstätigkeit nutzen.</p>

        <h2>§ 6 Geheimhaltung und Kundenschutz</h2>
        <p>(1) Der Vertriebspartner verpflichtet sich, alle Geschäftsgeheimnisse streng vertraulich zu behandeln.</p>
        <p>(2) Es gilt ein 12-monatiges Abwerbeverbot nach Vertragsende.</p>

        <h2>§ 7 Vertragsbeendigung</h2>
        <p>(1) Das Vertriebspartnerverhältnis kann jederzeit ohne Einhaltung einer Kündigungsfrist beendet werden.</p>

        <h2>§ 8 Schlussbestimmungen</h2>
        <p>(1) Es gilt das Recht der Bundesrepublik Deutschland.</p>
        <p>(2) Gerichtsstand ist der Sitz der GAP PROTECTION GmbH.</p>
      `,
    },
    en: {
      title: 'Partner Terms and Conditions',
      content: `
        <h2>§ 1 Subject Matter</h2>
        <p>GAP PROTECTION GmbH appoints the sales partner as an independent intermediary for "GAP-Protection". Contracts are concluded exclusively between GAP PROTECTION GmbH and the end customer.</p>
        <h2>§ 2 Partner Obligations</h2>
        <ul>
          <li>Promote GAP-Protection to the best of their knowledge and belief.</li>
          <li>Use only marketing materials provided by GAP PROTECTION GmbH.</li>
          <li>Never guarantee "100% security" or immunity from attacks.</li>
        </ul>
        <h2>§ 3 Commission</h2>
        <p>Commission is paid per successfully referred contract per the applicable commission agreement. All entitlements to future commissions expire upon termination. Any balancing payment claim (§ 89b HGB) is expressly excluded.</p>
        <h2>§ 4 Confidentiality</h2>
        <p>All trade secrets must be kept strictly confidential. A 12-month non-solicitation clause applies post-termination.</p>
        <h2>§ 5 Termination</h2>
        <p>The partner relationship may be terminated at any time without notice. German law applies; venue is the registered office of GAP PROTECTION GmbH.</p>
      `,
    },
  },
  privacy: {
    de: {
      title: 'Datenschutzerklärung',
      content: `
        <h2>1. Verantwortliche Stelle</h2>
        <p>Verantwortlich für die Datenverarbeitung im Rahmen der Vertragsbeziehung und der Zahlungsabwicklung ist die:</p>
        <p>GAP PROTECTION GmbH<br>Am Flughafen 13<br>12529 Schönefeld<br>E-Mail: info@gap-protection.com</p>

        <h2>2. Zweckbindung und Datentrennung</h2>
        <p>Wir unterscheiden strikt zwischen kaufmännischen Verwaltungsdaten und technischen Analysedaten:</p>
        <ul>
          <li><strong>Kaufmännische Daten (Zahlungsdaten):</strong> Diese verbleiben ausschließlich bei der GAP PROTECTION GmbH in Deutschland.</li>
          <li><strong>Technische Daten (Infrastrukturdaten):</strong> Diese werden zur Ausführung der Sicherheitsdienstleistung an unseren technischen Dienstleister übermittelt.</li>
        </ul>

        <h2>3. SEPA-Firmenlastschrift (Zahlungsverkehr)</h2>
        <p>Die Abrechnung erfolgt über das SEPA-Firmenlastschriftverfahren.</p>
        <ul>
          <li><strong>Verarbeitung:</strong> Ihre Bankverbindung (IBAN/BIC) und die Mandatsdaten werden ausschließlich durch die GAP PROTECTION GmbH verarbeitet.</li>
          <li><strong>Keine Weitergabe:</strong> Es erfolgt keine Übermittlung Ihrer Bankverbindungsdaten an Dritte.</li>
        </ul>

        <h2>4. Technische Durchführung durch die Gap-Protection Ltd. (UK)</h2>
        <p>Für die Erbringung der spezialisierten Cyber-Security-Leistungen setzen wir unser Partnerunternehmen ein: Gap-Protection Ltd., England, UK.</p>
        <p>An dieses Unternehmen werden ausschließlich die für die technische Analyse notwendigen Daten übertragen (z. B. IP-Adressen, Domainnamen).</p>

        <h2>5. Datentransfer in Drittstaaten</h2>
        <p>Da die technische Durchführung im Vereinigten Königreich (UK) erfolgt, werden technische Parameter dorthin übertragen. Das Datenschutzniveau ist durch den Angemessenheitsbeschluss der EU-Kommission für das UK abgesichert.</p>

        <h2>6. Ihre Rechte</h2>
        <p>Sie haben das Recht auf:</p>
        <ul>
          <li>Auskunft über Ihre gespeicherten Daten</li>
          <li>Berichtigung unrichtiger Daten</li>
          <li>Löschung Ihrer Daten</li>
          <li>Einschränkung der Verarbeitung</li>
          <li>Datenübertragbarkeit</li>
          <li>Widerspruch gegen die Verarbeitung</li>
        </ul>

        <h2>7. Cookies und Tracking</h2>
        <p>Diese Website verwendet nur technisch notwendige Cookies. Es findet kein Tracking durch Drittanbieter statt.</p>

        <h2>8. Kontakt</h2>
        <p>Bei Fragen zum Datenschutz wenden Sie sich an: datenschutz@gap-protection.com</p>
      `,
    },
    en: {
      title: 'Privacy Policy',
      content: `
        <h2>1. Data Controller</h2>
        <p>GAP PROTECTION GmbH, Am Flughafen 13, 12529 Schönefeld. Email: info@gap-protection.com</p>
        <h2>2. Data We Process</h2>
        <ul>
          <li><strong>Commercial data (payment):</strong> Stored solely by GAP PROTECTION GmbH in Germany. Never shared with third parties.</li>
          <li><strong>Technical data (infrastructure):</strong> IP addresses, domain names forwarded to our technical partner for service execution only.</li>
        </ul>
        <h2>3. Payment</h2>
        <p>Billing via SEPA direct debit. Your IBAN/BIC is processed exclusively by GAP PROTECTION GmbH — not shared with third parties.</p>
        <h2>4. UK Partner Processing</h2>
        <p>Technical cybersecurity services are performed by Gap-Protection Ltd., England, UK. Only technically necessary data (IP addresses, domain names) is transferred. The EU-UK adequacy decision ensures an adequate level of protection.</p>
        <h2>5. Your Rights</h2>
        <p>You have the right to: access, rectification, erasure, restriction of processing, data portability, and objection. Contact: datenschutz@gap-protection.com</p>
        <h2>6. Cookies</h2>
        <p>Only technically necessary cookies are used. No third-party tracking.</p>
      `,
    },
  },
  imprint: {
    de: {
      title: 'Impressum',
      content: `
        <h2>Angaben gemäß § 5 TMG</h2>
        <p>
          GAP PROTECTION GmbH<br>
          Am Flughafen 13<br>
          12529 Schönefeld<br>
          Deutschland
        </p>

        <h2>Vertreten durch</h2>
        <p>Geschäftsführer: Judith Hassel</p>

        <h2>Kontakt</h2>
        <p>
          Telefon: +49 (0) 30 123456789<br>
          E-Mail: info@gap-protection.com
        </p>

        <h2>Registereintrag</h2>
        <p>
          Eintragung im Handelsregister.<br>
          Registergericht: Amtsgericht Cottbus<br>
          Registernummer: [HRB-NUMMER_EINTRAGEN]
        </p>

        <h2>Umsatzsteuer-ID</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br>
          [UMSATZSTEUER_ID_EINTRAGEN]
        </p>

        <h2>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
        <p>
          Judith Hassel<br>
          Am Flughafen 13<br>
          12529 Schönefeld
        </p>

        <h2>EU-Streitschlichtung</h2>
        <p>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: 
          <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr/
          </a>
        </p>
        <p>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>

        <h2>Verbraucherstreitbeilegung/Universalschlichtungsstelle</h2>
        <p>
          Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer 
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      `,
    },
    en: {
      title: 'Legal Notice (Imprint)',
      content: `
        <h2>Information pursuant to § 5 TMG</h2>
        <p>GAP PROTECTION GmbH<br/>Am Flughafen 13<br/>12529 Schönefeld<br/>Germany</p>
        <h2>Represented by</h2>
        <p>Managing Director: Judith Hassel</p>
        <h2>Contact</h2>
        <p>Phone: +49 (0) 30 123456789<br/>Email: info@gap-protection.com</p>
        <h2>Commercial Register</h2>
        <p>Registration Court: Amtsgericht Cottbus<br/>Registration Number: HRB XXXXX</p>
        <h2>VAT ID</h2>
        <p>DE XXXXXXXXX</p>
        <h2>EU Dispute Resolution</h2>
        <p>Online dispute resolution: <a href="https://ec.europa.eu/consumers/odr/">https://ec.europa.eu/consumers/odr/</a><br/>We are not obliged to participate in consumer arbitration proceedings.</p>
      `,
    },
  },
};

type LegalType = keyof typeof legalContent;

export default function LegalPage() {
  const { type } = useParams<{ type: string }>();
  const { language } = useLanguage();

  if (!type || !legalContent[type as LegalType]) {
    return <Navigate to="/" replace />;
  }

  const content = legalContent[type as LegalType][language];

  return (
    <Layout>
      <div className="container px-4 sm:px-6 max-w-4xl py-8 sm:py-12">
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-xl sm:text-2xl md:text-3xl">{content.title}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="prose prose-sm sm:prose prose-gray dark:prose-invert max-w-none text-left">
              <LegalContent html={content.content} />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
