import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { 
  MessageCircle, X, Send, Loader2, Bot, User, 
  AlertTriangle, Phone 
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AIChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIChatWidget({ isOpen, onClose }: AIChatWidgetProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hallo! Ich bin Ihr AI-Assistent für GAP Protection. Wie kann ich Ihnen heute helfen? Ich kann Fragen zu unseren Dienstleistungen, Sicherheit und Ihrem Konto beantworten.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call AI chat endpoint
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: messages.concat(userMessage).map(m => ({
            role: m.role,
            content: m.content
          })),
          profileId: profile?.id
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Check if escalation is needed
      if (data.escalated && data.ticketId) {
        setTicketId(data.ticketId);
      }

      // Save messages to database if user is logged in
      if (profile?.id && data.ticketId) {
        await securityApi.batchInsert('chat_messages', [
          { profile_id: profile.id, ticket_id: data.ticketId, role: 'user', content: userMessage.content },
          { profile_id: profile.id, ticket_id: data.ticketId, role: 'assistant', content: data.response }
        ]);
      }

    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut oder kontaktieren Sie uns direkt unter support@gapprotection.de.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const escalateToHuman = async () => {
    try {
      const data = await securityApi.insert('support_tickets', {
        profile_id: profile?.id || null,
        subject: 'Chat-Eskalation',
        message: messages.map(m => `${m.role}: ${m.content}`).join('\n\n'),
        channel: 'ai',
        priority: 'high',
        status: 'escalated',
        escalated_at: new Date().toISOString()
      });

      setTicketId(data.id);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `🎫 Ticket #${data.id.slice(0, 8)} wurde erstellt. Ein Mitarbeiter wird sich schnellstmöglich bei Ihnen melden.`,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Escalation error:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <Card className="shadow-2xl border-2">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b bg-primary text-primary-foreground rounded-t-lg">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle className="text-base font-medium">AI-Assistent</CardTitle>
            {ticketId && (
              <Badge variant="secondary" className="text-xs">
                Ticket aktiv
              </Badge>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {/* Messages */}
          <ScrollArea className="h-80 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  {message.role === 'system' && (
                    <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.role === 'system'
                        ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
                        : 'bg-muted'
                    }`}
                  >
                    {message.content}
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Escalate Button */}
          {!ticketId && (
            <div className="px-4 py-2 border-t">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                onClick={escalateToHuman}
              >
                <Phone className="h-3 w-3 mr-2" />
                Mit einem Mitarbeiter sprechen
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Schreiben Sie Ihre Nachricht..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              onClick={sendMessage} 
              disabled={isLoading || !input.trim()}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Floating button version for global use
export function AIChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      <AIChatWidget isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
