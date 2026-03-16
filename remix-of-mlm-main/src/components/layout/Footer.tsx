import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import logoStacked from '@/assets/gap-logo-stacked-navy.png';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          <div className="col-span-2 sm:col-span-2 md:col-span-1">
            <img
              src={logoStacked}
              alt="GAP Protection"
              className="h-14 sm:h-16 mb-4"
            />
            <p className="text-sm text-muted-foreground">
              Ganzheitliche Cyber-Resilienz & Infrastruktur-Härtung für Ihr Unternehmen.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              GAP PROTECTION GmbH<br />
              Am Flughafen 13<br />
              12529 Schönefeld
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Produkt</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/security-test" className="text-muted-foreground hover:text-primary transition-colors">
                  Sicherheitstest
                </Link>
              </li>
              <li>
                <Link to="/register" className="text-muted-foreground hover:text-primary transition-colors">
                  Registrierung
                </Link>
              </li>
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                  Leistungen
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Partner</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">
                  Partner-Login
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-muted-foreground hover:text-primary transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/legal/partner-terms" className="text-muted-foreground hover:text-primary transition-colors">
                  Partner-AGB
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Rechtliches</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/legal/terms" className="text-muted-foreground hover:text-primary transition-colors">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/legal/privacy" className="text-muted-foreground hover:text-primary transition-colors">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/legal/imprint" className="text-muted-foreground hover:text-primary transition-colors">
                  {t('footer.imprint')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground text-center md:text-left">
          <p>{t('footer.copyright')}</p>
          <p>E-Mail: info@gap-protection.com</p>
        </div>
      </div>
    </footer>
  );
}
