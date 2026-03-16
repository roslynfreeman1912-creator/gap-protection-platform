import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import werbekarteDark from '@/assets/werbekarte-dark.jpg';
import gapLogoColor from '@/assets/logo-stacked-white.png';

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
  'Mindestens 8 Zeichen, Groß-/Kleinbuchstabe und Zahl erforderlich'
);

export default function AuthPage() {
  const { t } = useLanguage();
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateLogin = () => {
    const newErrors: Record<string, string> = {};
    
    try {
      emailSchema.parse(loginEmail);
    } catch {
      newErrors.loginEmail = t('registration.validation.invalidEmail');
    }
    
    if (!loginPassword) {
      newErrors.loginPassword = t('registration.validation.required');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRegister = () => {
    const newErrors: Record<string, string> = {};
    
    try {
      emailSchema.parse(registerEmail);
    } catch {
      newErrors.registerEmail = t('registration.validation.invalidEmail');
    }
    
    try {
      passwordSchema.parse(registerPassword);
    } catch {
      newErrors.registerPassword = t('auth.errors.weakPassword');
    }
    
    if (registerPassword !== registerConfirmPassword) {
      newErrors.registerConfirmPassword = t('auth.errors.passwordMismatch');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLogin()) return;
    
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('auth.errors.invalidCredentials'),
      });
    } else {
      toast({
        title: t('common.success'),
        description: t('auth.success.loggedIn'),
      });
      navigate('/dashboard');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateRegister()) return;
    
    setIsLoading(true);
    const { error } = await signUp(registerEmail, registerPassword);
    setIsLoading(false);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('auth.errors.generic'),
      });
    } else {
      toast({
        title: t('common.success'),
        description: t('auth.success.registered'),
      });
    }
  };

  return (
    <Layout>
      <div className="relative min-h-[80vh] flex items-center justify-center px-4 sm:px-6">
        {/* Background */}
        <img src={werbekarteDark} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
        <div className="absolute inset-0 bg-[hsl(222,47%,6%,0.88)]" />

        <div className="relative z-10 w-full max-w-md py-8 sm:py-16">
          {/* Logo */}
          <div className="text-center mb-6 sm:mb-8">
            <img src={gapLogoColor} alt="GAP Protection" className="h-20 sm:h-24 mx-auto drop-shadow-2xl" />
          </div>
        <Card className="bg-card/95 backdrop-blur-xl border-accent/20 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle>{t('auth.login.title')}</CardTitle>
            <CardDescription>
              {t('auth.login.noAccount')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t('auth.login.title')}</TabsTrigger>
                <TabsTrigger value="register">{t('auth.register.title')}</TabsTrigger>
              </TabsList>
              
              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('auth.login.email')}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="max@beispiel.de"
                    />
                    {errors.loginEmail && (
                      <p className="text-sm text-destructive">{errors.loginEmail}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t('auth.login.password')}</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    {errors.loginPassword && (
                      <p className="text-sm text-destructive">{errors.loginPassword}</p>
                    )}
                  </div>
                  
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      t('auth.login.button')
                    )}
                  </Button>
                </form>
              </TabsContent>
              
              {/* Register Tab */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-email">{t('auth.register.email')}</Label>
                    <Input
                      id="register-email"
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="max@beispiel.de"
                    />
                    {errors.registerEmail && (
                      <p className="text-sm text-destructive">{errors.registerEmail}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-password">{t('auth.register.password')}</Label>
                    <Input
                      id="register-password"
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                    />
                    {errors.registerPassword && (
                      <p className="text-sm text-destructive">{errors.registerPassword}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">{t('auth.register.confirmPassword')}</Label>
                    <Input
                      id="register-confirm-password"
                      type="password"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    />
                    {errors.registerConfirmPassword && (
                      <p className="text-sm text-destructive">{errors.registerConfirmPassword}</p>
                    )}
                  </div>
                  
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      t('auth.register.button')
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t('auth.login.noAccount')}{' '}
                <Link to="/register" className="text-primary hover:underline">
                  {t('auth.login.register')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </Layout>
  );
}
