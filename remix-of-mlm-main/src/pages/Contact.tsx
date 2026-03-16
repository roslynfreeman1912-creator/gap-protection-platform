import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { securityApi } from '@/lib/securityApi';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Phone, MapPin, Send, Loader2, MessageCircle } from 'lucide-react';
import { AIChatWidget } from '@/components/chat/AIChatWidget';

export default function ContactPage() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [formData, setFormData] = useState({
    name: profile ? `${profile.first_name} ${profile.last_name}` : '',
    email: profile?.email || '',
    phone: '',
    subject: '',
    priority: 'normal',
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await securityApi.insert('support_tickets', {
        profile_id: profile?.id || null,
        subject: formData.subject || 'Kontaktanfrage',
        message: `Name: ${formData.name}\nE-Mail: ${formData.email}\nTelefon: ${formData.phone}\n\n${formData.message}`,
        channel: 'email',
        priority: formData.priority as 'low' | 'normal' | 'high' | 'urgent',
        status: 'open'
      });

      toast({
        title: 'Nachricht gesendet',
        description: 'Wir werden uns schnellstmöglich bei Ihnen melden.'
      });

      setFormData({ ...formData, subject: '', message: '' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Kontakt aufnehmen</h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Haben Sie Fragen? Unser Team ist für Sie da. Nutzen Sie das Kontaktformular,
            den AI-Assistenten oder kontaktieren Sie uns direkt.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Contact Info */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-1 gap-4 sm:gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  AI-Assistent
                </CardTitle>
                <CardDescription>
                  Schnelle Hilfe rund um die Uhr
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => setShowChat(true)} 
                  className="w-full"
                  variant="default"
                >
                  Chat starten
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  E-Mail
                </CardTitle>
              </CardHeader>
              <CardContent>
                <a 
                  href="mailto:support@gapprotection.de" 
                  className="text-primary hover:underline"
                >
                  support@gapprotection.de
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  Telefon
                </CardTitle>
              </CardHeader>
              <CardContent>
                <a 
                  href="tel:+4930123456789" 
                  className="text-primary hover:underline"
                >
                  +49 30 123 456 789
                </a>
                <p className="text-sm text-muted-foreground mt-1">
                  Mo-Fr 9:00 - 18:00 Uhr
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Adresse
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  GAP Protection GmbH<br />
                  Musterstraße 123<br />
                  10115 Berlin<br />
                  Deutschland
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Schreiben Sie uns</CardTitle>
              <CardDescription>
                Füllen Sie das Formular aus und wir melden uns schnellstmöglich bei Ihnen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priorität</Label>
                    <Select 
                      value={formData.priority} 
                      onValueChange={(v) => setFormData({ ...formData, priority: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Niedrig</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Hoch</SelectItem>
                        <SelectItem value="urgent">Dringend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Betreff *</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Nachricht *</Label>
                  <Textarea
                    id="message"
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Nachricht senden
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Chat Widget */}
      <AIChatWidget isOpen={showChat} onClose={() => setShowChat(false)} />
    </Layout>
  );
}
