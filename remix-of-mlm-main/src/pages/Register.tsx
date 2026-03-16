import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { 
  Loader2, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle, 
  Shield, 
  User, 
  MapPin, 
  Globe, 
  CreditCard, 
  FileCheck,
  Lock,
  ArrowRight
} from 'lucide-react';
import { IBANInput } from '@/components/ui/iban-input';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { validateIBAN } from '@/lib/iban-validation';
import { ParsedAddress } from '@/hooks/use-address-autocomplete';

// Import assets
import cyberBg from '@/assets/cyber-bg.jpg';
import logoHorizontal from '@/assets/gap-logo-horizontal-navy.png';

// Helper: Calculate age from date of birth
const calculateAge = (birthDate: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Enhanced validation schemas with strict rules
const personalSchema = z.object({
  firstName: z.string()
    .min(2, 'Vorname muss mindestens 2 Zeichen haben')
    .max(50, 'Vorname darf maximal 50 Zeichen haben')
    .regex(/^[a-zA-ZäöüÄÖÜß\s-]+$/, 'Vorname darf nur Buchstaben enthalten'),
  lastName: z.string()
    .min(2, 'Nachname muss mindestens 2 Zeichen haben')
    .max(50, 'Nachname darf maximal 50 Zeichen haben')
    .regex(/^[a-zA-ZäöüÄÖÜß\s-]+$/, 'Nachname darf nur Buchstaben enthalten'),
  email: z.string()
    .email('Ungültige E-Mail-Adresse')
    .max(100, 'E-Mail darf maximal 100 Zeichen haben'),
  phone: z.string()
    .optional()
    .refine(val => !val || /^[+]?[\d\s\-()]{6,20}$/.test(val), 'Ungültige Telefonnummer'),
  idNumber: z.string()
    .min(6, 'Ausweisnummer muss mindestens 6 Zeichen haben')
    .max(20, 'Ausweisnummer darf maximal 20 Zeichen haben')
    .regex(/^[A-Z0-9]+$/i, 'Ausweisnummer darf nur Buchstaben und Zahlen enthalten'),
  dateOfBirth: z.string()
    .min(1, 'Geburtsdatum ist erforderlich')
    .refine(val => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, 'Ungültiges Datum')
    .refine(val => {
      const date = new Date(val);
      const age = calculateAge(date);
      return age >= 18;
    }, 'Sie müssen mindestens 18 Jahre alt sein'),
});

const addressSchema = z.object({
  street: z.string()
    .min(2, 'Straße muss mindestens 2 Zeichen haben')
    .max(100, 'Straße darf maximal 100 Zeichen haben'),
  houseNumber: z.string()
    .min(1, 'Hausnummer ist erforderlich')
    .max(10, 'Hausnummer darf maximal 10 Zeichen haben'),
  postalCode: z.string()
    .regex(/^\d{4,5}$/, 'Postleitzahl muss 4-5 Ziffern haben'),
  city: z.string()
    .min(2, 'Stadt muss mindestens 2 Zeichen haben')
    .max(50, 'Stadt darf maximal 50 Zeichen haben'),
});

const domainSchema = z.object({
  domain: z.string().min(1, 'Domain ist erforderlich').regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/, 'Ungültige Domain'),
  ipAddress: z.string().optional(),
});

const paymentSchema = z.object({
  iban: z.string().transform(val => val.replace(/\s/g, '')).refine(
    (val) => validateIBAN(val).valid,
    (val) => ({ message: validateIBAN(val).error || 'Ungültige IBAN' })
  ),
  bic: z.string().optional(),
  bankName: z.string().min(1, 'Bankname ist erforderlich'),
  accountHolder: z.string().min(1, 'Kontoinhaber ist erforderlich'),
});

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  idNumber: string;
  password: string;
  dateOfBirth: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  domain: string;
  ipAddress: string;
  iban: string;
  bic: string;
  bankName: string;
  accountHolder: string;
  promotionCode: string;
  domainOwner: boolean;
  sepaMandate: boolean;
  terms: boolean;
  privacy: boolean;
  ageConfirmation: boolean;
}

const initialFormData: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  idNumber: '',
  password: '',
  dateOfBirth: '',
  street: '',
  houseNumber: '',
  postalCode: '',
  city: '',
  country: 'Deutschland',
  domain: '',
  ipAddress: '',
  iban: '',
  bic: '',
  bankName: '',
  accountHolder: '',
  promotionCode: '',
  domainOwner: false,
  sepaMandate: false,
  terms: false,
  privacy: false,
  ageConfirmation: false,
};

const steps = [
  { id: 1, title: 'Persönlich', icon: User },
  { id: 2, title: 'Adresse', icon: MapPin },
  { id: 3, title: 'Domain', icon: Globe },
  { id: 4, title: 'Zahlung', icon: CreditCard },
  { id: 5, title: 'Bestätigung', icon: FileCheck },
];

export default function RegisterPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    ...initialFormData,
    promotionCode: searchParams.get('code') || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ibanValid, setIbanValid] = useState(false);

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const updateFormData = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleAddressSelect = (address: ParsedAddress) => {
    setFormData(prev => ({
      ...prev,
      street: address.street,
      houseNumber: address.houseNumber || prev.houseNumber,
      postalCode: address.postalCode || prev.postalCode,
      city: address.city || prev.city,
    }));
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.street;
      if (address.houseNumber) delete newErrors.houseNumber;
      if (address.postalCode) delete newErrors.postalCode;
      if (address.city) delete newErrors.city;
      return newErrors;
    });
  };

  const validateStep = (stepNumber: number): boolean => {
    let schema;
    let data;
    
    switch (stepNumber) {
      case 1:
        schema = personalSchema;
        data = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          idNumber: formData.idNumber,
          dateOfBirth: formData.dateOfBirth,
        };
        
        if (!formData.password || formData.password.length < 8) {
          setErrors({ password: 'Passwort muss mindestens 8 Zeichen haben' });
          return false;
        }
        
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
          setErrors({ password: 'Passwort muss Groß-/Kleinbuchstaben und Zahl enthalten' });
          return false;
        }
        break;
      case 2:
        schema = addressSchema;
        data = {
          street: formData.street,
          houseNumber: formData.houseNumber,
          postalCode: formData.postalCode,
          city: formData.city,
        };
        break;
      case 3:
        schema = domainSchema;
        data = {
          domain: formData.domain,
          ipAddress: formData.ipAddress,
        };
        break;
      case 4:
        schema = paymentSchema;
        data = {
          iban: formData.iban,
          bic: formData.bic,
          bankName: formData.bankName,
          accountHolder: formData.accountHolder,
        };
        break;
      case 5: {
        const checkErrors: Record<string, string> = {};
        if (!formData.domainOwner) checkErrors.domainOwner = t('registration.validation.mustAccept');
        if (!formData.sepaMandate) checkErrors.sepaMandate = t('registration.validation.mustAccept');
        if (!formData.terms) checkErrors.terms = t('registration.validation.mustAccept');
        if (!formData.privacy) checkErrors.privacy = t('registration.validation.mustAccept');
        if (!formData.ageConfirmation) checkErrors.ageConfirmation = 'Sie müssen die Alters- und Datenbestätigung akzeptieren';
        if (!formData.promotionCode) checkErrors.promotionCode = t('registration.validation.required');

        if (Object.keys(checkErrors).length > 0) {
          setErrors(checkErrors);
          return false;
        }
        return true;
      }
      default:
        return true;
    }
    
    try {
      schema.parse(data);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || undefined,
          idNumber: formData.idNumber,
          dateOfBirth: formData.dateOfBirth,
          street: formData.street,
          houseNumber: formData.houseNumber,
          postalCode: formData.postalCode,
          city: formData.city,
          country: formData.country,
          domain: formData.domain,
          ipAddress: formData.ipAddress || undefined,
          iban: formData.iban.replace(/\s/g, ''),
          bic: formData.bic || undefined,
          bankName: formData.bankName,
          accountHolder: formData.accountHolder,
          promotionCode: formData.promotionCode.toUpperCase(),
          domainOwner: formData.domainOwner,
          sepaMandate: formData.sepaMandate,
          terms: formData.terms,
          privacy: formData.privacy,
          ageConfirmation: formData.ageConfirmation,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error?.includes('Promotion Code') || data.error?.includes('Promocode')) {
          setErrors({ promotionCode: t('registration.validation.invalidPromotionCode') });
          setIsLoading(false);
          return;
        }
        throw new Error(data.error || 'Registrierung fehlgeschlagen');
      }
      
      setIsSuccess(true);
      
      toast({
        title: t('registration.success.title'),
        description: t('registration.success.message'),
      });
      
    } catch (error: any) {
      console.error('Registration error:', error);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error.message || t('auth.errors.generic'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Success Screen
  if (isSuccess) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-4">
        {/* Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${cyberBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/90 to-accent/30" />
        
        <Card className="relative z-10 max-w-md w-full bg-card/95 backdrop-blur-xl border-accent/20 shadow-2xl">
          <CardContent className="pt-12 pb-10 text-center">
            <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6 cyber-glow">
              <CheckCircle className="h-10 w-10 text-accent" />
            </div>
            <h2 className="text-2xl font-bold mb-3">{t('registration.success.title')}</h2>
            <p className="text-muted-foreground mb-8">{t('registration.success.message')}</p>
            <Button 
              onClick={() => navigate('/auth')}
              className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
            >
              Zum Login
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background with cyber pattern */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${cyberBg})` }}
      />
      <div className="fixed inset-0 bg-gradient-to-br from-primary/95 via-primary/90 to-accent/20" />
      <div className="fixed inset-0 bg-grid-pattern opacity-20" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen py-8 px-4">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-8">
          <Link to="/" className="inline-block">
            <div className="bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg">
              <img 
                src={logoHorizontal} 
                alt="GAP Protection" 
                className="h-12 object-contain"
              />
            </div>
          </Link>
        </div>

        {/* Main Card */}
        <div className="max-w-4xl mx-auto">
          <Card className="bg-card/95 backdrop-blur-xl border-accent/20 shadow-2xl overflow-hidden">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-primary to-primary/80 px-4 sm:px-8 py-5 sm:py-6 text-primary-foreground">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-accent/20 rounded-lg shrink-0">
                  <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold">Partner Registrierung</h1>
                  <p className="text-primary-foreground/80 text-xs sm:text-sm">
                    Werden Sie Teil unseres Netzwerks für Cyber-Sicherheit
                  </p>
                </div>
              </div>
            </div>

            {/* Step Indicators */}
            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-4">
                {steps.map((s, index) => {
                  const Icon = s.icon;
                  const isActive = step === s.id;
                  const isCompleted = step > s.id;

                  return (
                    <div key={s.id} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div
                          className={`
                            w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-300
                            ${isActive ? 'bg-accent text-accent-foreground shadow-lg scale-110' : ''}
                            ${isCompleted ? 'bg-accent/20 text-accent' : ''}
                            ${!isActive && !isCompleted ? 'bg-muted text-muted-foreground' : ''}
                          `}
                        >
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                          ) : (
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                          )}
                        </div>
                        <span className={`
                          text-[10px] sm:text-xs mt-1 sm:mt-2 font-medium
                          ${isActive ? 'text-accent' : 'text-muted-foreground'}
                        `}>
                          {s.title}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div className={`
                          w-4 sm:w-8 md:w-16 h-0.5 mx-1 sm:mx-2 transition-all duration-300
                          ${step > s.id ? 'bg-accent' : 'bg-muted'}
                        `} />
                      )}
                    </div>
                  );
                })}
              </div>
              <Progress value={progress} className="h-1.5 bg-muted" />
            </div>

            {/* Form Content */}
            <CardContent className="p-4 sm:p-6 md:p-8">
              {/* Step 1: Personal Data */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <User className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Persönliche Daten</h2>
                      <p className="text-sm text-muted-foreground">Bitte geben Sie Ihre persönlichen Informationen ein</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="flex items-center gap-1">
                        Vorname <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => updateFormData('firstName', e.target.value)}
                        placeholder="Max"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.firstName && <p className="text-sm text-destructive">{errors.firstName}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="flex items-center gap-1">
                        Nachname <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => updateFormData('lastName', e.target.value)}
                        placeholder="Mustermann"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.lastName && <p className="text-sm text-destructive">{errors.lastName}</p>}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-1">
                      E-Mail Adresse <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateFormData('email', e.target.value)}
                      placeholder="max@mustermann.de"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent"
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="flex items-center gap-1">
                      <Lock className="h-4 w-4 mr-1" />
                      Passwort <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => updateFormData('password', e.target.value)}
                      placeholder="Mindestens 8 Zeichen (Groß-/Kleinbuchstaben + Zahl)"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent"
                    />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefonnummer</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => updateFormData('phone', e.target.value)}
                        placeholder="+49 123 456789"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth" className="flex items-center gap-1">
                        Geburtsdatum <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => updateFormData('dateOfBirth', e.target.value)}
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.dateOfBirth && <p className="text-sm text-destructive">{errors.dateOfBirth}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="idNumber" className="flex items-center gap-1">
                      Ausweisnummer <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="idNumber"
                      value={formData.idNumber}
                      onChange={(e) => updateFormData('idNumber', e.target.value.toUpperCase())}
                      placeholder="L12345678"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent"
                    />
                    {errors.idNumber && <p className="text-sm text-destructive">{errors.idNumber}</p>}
                  </div>
                </div>
              )}

              {/* Step 2: Address */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <MapPin className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Adresse</h2>
                      <p className="text-sm text-muted-foreground">Ihre Geschäftsadresse für offizielle Dokumente</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Straße suchen</Label>
                    <AddressAutocomplete
                      value={formData.street}
                      onChange={(value) => updateFormData('street', value)}
                      onAddressSelect={handleAddressSelect}
                      placeholder="Beginnen Sie mit der Eingabe..."
                      className="h-12"
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="street" className="flex items-center gap-1">
                        Straße <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="street"
                        value={formData.street}
                        onChange={(e) => updateFormData('street', e.target.value)}
                        placeholder="Musterstraße"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.street && <p className="text-sm text-destructive">{errors.street}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="houseNumber" className="flex items-center gap-1">
                        Nr. <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="houseNumber"
                        value={formData.houseNumber}
                        onChange={(e) => updateFormData('houseNumber', e.target.value)}
                        placeholder="123"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.houseNumber && <p className="text-sm text-destructive">{errors.houseNumber}</p>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="postalCode" className="flex items-center gap-1">
                        PLZ <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="postalCode"
                        value={formData.postalCode}
                        onChange={(e) => updateFormData('postalCode', e.target.value)}
                        placeholder="12345"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.postalCode && <p className="text-sm text-destructive">{errors.postalCode}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city" className="flex items-center gap-1">
                        Stadt <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => updateFormData('city', e.target.value)}
                        placeholder="Berlin"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.city && <p className="text-sm text-destructive">{errors.city}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Land</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => updateFormData('country', e.target.value)}
                      placeholder="Deutschland"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Domain */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <Globe className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Domain & Website</h2>
                      <p className="text-sm text-muted-foreground">Die Domain, die Sie schützen möchten</p>
                    </div>
                  </div>

                  <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl mb-6">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-accent mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-accent">Schutz ab dem ersten Tag</p>
                        <p className="text-muted-foreground">
                          Nach der Registrierung wird Ihre Domain automatisch in unser Sicherheits-Monitoring aufgenommen.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="domain" className="flex items-center gap-1">
                      Domain <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="domain"
                        value={formData.domain}
                        onChange={(e) => updateFormData('domain', e.target.value.toLowerCase())}
                        placeholder="beispiel.de"
                        className="h-12 pl-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                    </div>
                    {errors.domain && <p className="text-sm text-destructive">{errors.domain}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ipAddress">Server IP-Adresse (optional)</Label>
                    <Input
                      id="ipAddress"
                      value={formData.ipAddress}
                      onChange={(e) => updateFormData('ipAddress', e.target.value)}
                      placeholder="192.168.1.1"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Payment */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <CreditCard className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Zahlungsdaten</h2>
                      <p className="text-sm text-muted-foreground">Bankverbindung für SEPA-Lastschrift</p>
                    </div>
                  </div>

                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl mb-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Monatlicher Beitrag</p>
                        <p className="text-2xl font-bold text-primary">399,00 € <span className="text-sm font-normal text-muted-foreground">netto/Monat</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Inkl. MwSt.</p>
                        <p className="text-lg font-semibold">355,81 €</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountHolder" className="flex items-center gap-1">
                      Kontoinhaber <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="accountHolder"
                      value={formData.accountHolder}
                      onChange={(e) => updateFormData('accountHolder', e.target.value)}
                      placeholder="Max Mustermann"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent"
                    />
                    {errors.accountHolder && <p className="text-sm text-destructive">{errors.accountHolder}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="iban" className="flex items-center gap-1">
                      IBAN <span className="text-destructive">*</span>
                    </Label>
                    <IBANInput
                      value={formData.iban}
                      onChange={(value) => updateFormData('iban', value)}
                      onValidationChange={(valid) => setIbanValid(valid)}
                      placeholder="DE89 3704 0044 0532 0130 00"
                      className="h-12"
                    />
                    {errors.iban && <p className="text-sm text-destructive">{errors.iban}</p>}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bic">BIC (optional)</Label>
                      <Input
                        id="bic"
                        value={formData.bic}
                        onChange={(e) => updateFormData('bic', e.target.value.toUpperCase())}
                        placeholder="COBADEFFXXX"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bankName" className="flex items-center gap-1">
                        Bankname <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="bankName"
                        value={formData.bankName}
                        onChange={(e) => updateFormData('bankName', e.target.value)}
                        placeholder="Commerzbank"
                        className="h-12 bg-background/50 border-border/50 focus:border-accent"
                      />
                      {errors.bankName && <p className="text-sm text-destructive">{errors.bankName}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Confirmation */}
              {step === 5 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <FileCheck className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Bestätigung & Promo-Code</h2>
                      <p className="text-sm text-muted-foreground">Überprüfen und bestätigen Sie Ihre Registrierung</p>
                    </div>
                  </div>

                  {/* Summary Card */}
                  <div className="p-5 bg-muted/30 rounded-xl border space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-accent" />
                      Zusammenfassung
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Name</p>
                        <p className="font-medium">{formData.firstName} {formData.lastName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">E-Mail</p>
                        <p className="font-medium">{formData.email}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Domain</p>
                        <p className="font-medium">{formData.domain}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Monatsbeitrag</p>
                        <p className="font-medium">399,00 € netto</p>
                      </div>
                    </div>
                  </div>

                  {/* Promo Code */}
                  <div className="space-y-2">
                    <Label htmlFor="promotionCode" className="flex items-center gap-1">
                      Promo-Code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="promotionCode"
                      value={formData.promotionCode}
                      onChange={(e) => updateFormData('promotionCode', e.target.value.toUpperCase())}
                      placeholder="PARTNER-CODE"
                      className="h-12 bg-background/50 border-border/50 focus:border-accent font-mono uppercase"
                    />
                    {errors.promotionCode && <p className="text-sm text-destructive">{errors.promotionCode}</p>}
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-4 pt-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="domainOwner"
                        checked={formData.domainOwner}
                        onCheckedChange={(checked) => updateFormData('domainOwner', checked === true)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="domainOwner" className="font-normal cursor-pointer">
                          Ich bestätige, dass ich Eigentümer oder bevollmächtigter Vertreter der angegebenen Domain bin.
                        </Label>
                        {errors.domainOwner && <p className="text-sm text-destructive">{errors.domainOwner}</p>}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="sepaMandate"
                        checked={formData.sepaMandate}
                        onCheckedChange={(checked) => updateFormData('sepaMandate', checked === true)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="sepaMandate" className="font-normal cursor-pointer">
                          Ich ermächtige GAP PROTECTION GmbH, Zahlungen von meinem Konto mittels SEPA-Lastschrift einzuziehen.
                        </Label>
                        {errors.sepaMandate && <p className="text-sm text-destructive">{errors.sepaMandate}</p>}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="terms"
                        checked={formData.terms}
                        onCheckedChange={(checked) => updateFormData('terms', checked === true)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="terms" className="font-normal cursor-pointer">
                          Ich akzeptiere die <Link to="/legal/terms" target="_blank" className="text-accent hover:underline">Allgemeinen Geschäftsbedingungen</Link>.
                        </Label>
                        {errors.terms && <p className="text-sm text-destructive">{errors.terms}</p>}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="privacy"
                        checked={formData.privacy}
                        onCheckedChange={(checked) => updateFormData('privacy', checked === true)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="privacy" className="font-normal cursor-pointer">
                          Ich habe die <Link to="/legal/privacy" target="_blank" className="text-accent hover:underline">Datenschutzerklärung</Link> gelesen und akzeptiert.
                        </Label>
                        {errors.privacy && <p className="text-sm text-destructive">{errors.privacy}</p>}
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="ageConfirmation"
                        checked={formData.ageConfirmation}
                        onCheckedChange={(checked) => updateFormData('ageConfirmation', checked === true)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="ageConfirmation" className="font-normal cursor-pointer">
                          Ich bestätige, dass ich mindestens 18 Jahre alt bin und alle Angaben wahrheitsgemäß gemacht habe.
                        </Label>
                        {errors.ageConfirmation && <p className="text-sm text-destructive">{errors.ageConfirmation}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={step === 1 || isLoading}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Zurück
                </Button>

                {step < totalSteps ? (
                  <Button 
                    onClick={nextStep}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
                  >
                    Weiter
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2 min-w-[160px]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird registriert...
                      </>
                    ) : (
                      <>
                        Registrierung abschließen
                        <CheckCircle className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center mt-6 text-primary-foreground/70 text-sm">
            <p>
              Bereits registriert?{' '}
              <Link to="/auth" className="text-accent hover:underline font-medium">
                Hier anmelden
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
