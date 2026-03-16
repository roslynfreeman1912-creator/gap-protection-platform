import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

const SYSTEM_PROMPT = `Du bist der AI-Assistent für GAP Protection, einen Cybersecurity-Dienstleister. 

Deine Aufgaben:
- Beantworte Fragen zu unseren Sicherheitsdiensten (Domain-Schutz, Vulnerability Scanning, etc.)
- Hilf bei technischen Fragen zur Nutzung der Plattform
- Unterstütze bei Kontofragen (Login, Registrierung, Dashboard)
- Erkläre unser Partner-Programm und MLM-Struktur

Wichtige Regeln:
1. Sei freundlich und professionell
2. Antworte auf Deutsch
3. Wenn du eine Frage nicht beantworten kannst, sage es ehrlich
4. Bei komplexen Problemen oder Beschwerden, empfehle die Eskalation an einen Mitarbeiter
5. Gib keine sensiblen Informationen preis
6. Halte Antworten präzise und hilfreich

Preise:
- Domain-Schutz: 399€/Monat
- Kostenloser Sicherheitstest verfügbar

Kontakt:
- E-Mail: support@gapprotection.de
- Telefon: +49 30 123 456 789`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate: any logged-in user
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response

    const { supabase } = getSupabaseAdmin()
    const aiApiKey = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('GROQ_API_KEY')
    if (!aiApiKey) throw new Error('AI API key not configured (OPENROUTER_API_KEY or GROQ_API_KEY)')
    
    const { messages, profileId: requestedProfileId } = await req.json()
    // Use authenticated user's profile ID to prevent spoofing
    const profileId = authResult.auth.profileId || requestedProfileId
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Input size limits to prevent excessive AI API costs
    const MAX_MESSAGES = 20
    const MAX_MESSAGE_LENGTH = 2000
    const sanitizedMessages = messages.slice(-MAX_MESSAGES).map((m: any) => ({
      role: m.role === 'system' ? 'assistant' : m.role,
      content: String(m.content || '').slice(0, MAX_MESSAGE_LENGTH)
    }))

    // Call OpenRouter AI Gateway
    const isGroq = !Deno.env.get('OPENROUTER_API_KEY')
    const aiUrl = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'
    const aiModel = isGroq ? 'llama-3.3-70b-versatile' : 'google/gemini-2.0-flash-001'

    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...sanitizedMessages
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      console.error('AI Gateway error:', aiResponse.status, errorText)
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      throw new Error('AI service unavailable')
    }

    const aiData = await aiResponse.json()
    const responseContent = aiData.choices?.[0]?.message?.content || 
      'Entschuldigung, ich konnte keine Antwort generieren. Bitte versuchen Sie es erneut.';

    // Check if escalation keywords are present
    const escalationKeywords = ['beschwerde', 'problem', 'fehler', 'funktioniert nicht', 'hilfe', 'dringend', 'rückerstattung', 'kündigung']
    const userMessage = messages[messages.length - 1]?.content?.toLowerCase() || ''
    const needsEscalation = escalationKeywords.some(kw => userMessage.includes(kw))

    let ticketId = null
    
    // Auto-create ticket for escalation cases
    if (needsEscalation && profileId) {
      const { data: ticket } = await supabase
        .from('support_tickets')
        .insert({
          profile_id: profileId,
          subject: 'AI Chat - Automatische Eskalation',
          message: userMessage,
          channel: 'ai',
          priority: 'high',
          status: 'open',
          ai_response: responseContent
        })
        .select()
        .single()
      
      ticketId = ticket?.id
    }

    return new Response(
      JSON.stringify({ 
        response: responseContent,
        escalated: needsEscalation,
        ticketId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('AI Chat error:', error)
    return new Response(
      JSON.stringify({ 
        response: 'Entschuldigung, es gab einen technischen Fehler. Bitte kontaktieren Sie uns unter support@gapprotection.de oder +49 30 123 456 789.',
        error: 'Interner Fehler'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
