import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Shield, User, LogOut, LayoutDashboard, Globe, Menu, Settings, Building2, BookOpenCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import gapLogoHorizontal from '@/assets/gap-logo-horizontal-navy.png';

export function Header() {
  const { t, language, setLanguage } = useLanguage();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCallcenter, setIsCallcenter] = useState(false);

  // Check if user is admin or callcenter using secure functions
  useEffect(() => {
    const checkRoles = async () => {
      if (user && profile) {
        const [adminRes, ccRes] = await Promise.all([
          supabase.rpc('is_admin'),
          supabase.rpc('is_callcenter'),
        ]);
        setIsAdmin(!!adminRes.data);
        setIsCallcenter(!!ccRes.data);
      } else {
        setIsAdmin(false);
        setIsCallcenter(false);
      }
    };
    checkRoles();
  }, [user, profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const toggleLanguage = () => {
    setLanguage(language === 'de' ? 'en' : 'de');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img 
            src={gapLogoHorizontal} 
            alt="GAP Protection" 
            className="h-10 object-contain"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">
            {t('nav.home')}
          </Link>
          <Link to="/security-test" className="text-sm font-medium hover:text-primary transition-colors">
            {t('nav.securityTest')}
          </Link>
          <Link to="/contact" className="text-sm font-medium hover:text-primary transition-colors">
            Kontakt
          </Link>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Language Switcher */}
          <Button variant="ghost" size="icon" onClick={toggleLanguage}>
            <Globe className="h-5 w-5" />
            <span className="sr-only">Toggle Language</span>
          </Button>

          {/* Auth */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  {profile?.first_name || user.email?.split('@')[0]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  {t('nav.dashboard')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/crm')}>
                  <BookOpenCheck className="mr-2 h-4 w-4" />
                  CRM
                </DropdownMenuItem>
                {(isAdmin || isCallcenter) && (
                  <DropdownMenuItem onClick={() => navigate('/callcenter')}>
                    <Building2 className="mr-2 h-4 w-4" />
                    Call Center
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Administration
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
                {t('nav.login')}
              </Button>
              <Button size="sm" onClick={() => navigate('/register')}>
                {t('nav.register')}
              </Button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container py-4 flex flex-col gap-3">
            <Link
              to="/"
              className="text-sm font-medium hover:text-primary py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('nav.home')}
            </Link>
            <Link
              to="/security-test"
              className="text-sm font-medium hover:text-primary py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('nav.securityTest')}
            </Link>
            <Link
              to="/contact"
              className="text-sm font-medium hover:text-primary py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Kontakt
            </Link>
            {user && (
              <Link
                to="/crm"
                className="text-sm font-medium hover:text-primary py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                CRM
              </Link>
            )}
            {!user && (
              <div className="flex flex-col gap-2 pt-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => { navigate('/auth'); setMobileMenuOpen(false); }}
                >
                  {t('nav.login')}
                </Button>
                <Button
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => { navigate('/register'); setMobileMenuOpen(false); }}
                >
                  {t('nav.register')}
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
