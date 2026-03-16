import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate: admin only
    const authResult = await authenticateRequest(req, corsHeaders, { requiredRole: 'admin' })
    if (authResult.response) {
      // Return 200 with error in body (supabase.functions.invoke throws on non-2xx)
      const errorBody = await authResult.response.clone().text()
      let errorData = { error: 'Authentifizierung fehlgeschlagen' }
      try { errorData = JSON.parse(errorBody) } catch (_e) { /* ignore */ }
      return jsonResponse(errorData, 200, corsHeaders)
    }

    const AI_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('GROQ_API_KEY');
    if (!AI_API_KEY) throw new Error('AI API key not configured (OPENROUTER_API_KEY or GROQ_API_KEY)');

    const isGroq = !Deno.env.get('OPENROUTER_API_KEY')
    const AI_URL = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'
    const AI_MODEL = isGroq ? 'llama-3.3-70b-versatile' : 'google/gemini-2.0-flash-001'

    const { supabase } = getSupabaseAdmin()

    const { action, data } = await req.json()

    // Input size limit to prevent excessive AI API costs
    const inputStr = JSON.stringify(data || {})
    if (inputStr.length > 50000) {
      return jsonResponse({ error: 'Eingabedaten zu gro\u00df (max 50KB)' }, 200, corsHeaders)
    }

    switch (action) {
      case 'analyze_threat': {
        const { threat_event } = data;
        const systemPrompt = `Du bist ein Elite-Cybersecurity-Analyst bei GAP Protection, einem führenden deutschen Cybersicherheitsunternehmen. 
Analysiere Sicherheitsvorfälle professionell auf Deutsch. Verwende MITRE ATT&CK Framework für Klassifizierung.

Antworte IMMER im folgenden JSON-Format:
{
  "risk_score": <0-100>,
  "severity_assessment": "<critical|high|medium|low>",
  "threat_classification": "<Bedrohungstyp>",
  "mitre_tactic": "<MITRE Taktik>",
  "mitre_technique": "<MITRE Technik ID>",
  "attack_chain": ["<Schritt 1>", "<Schritt 2>", ...],
  "impact_analysis": "<Auswirkungsanalyse>",
  "ioc_indicators": ["<IOC 1>", "<IOC 2>", ...],
  "recommendations": ["<Empfehlung 1>", "<Empfehlung 2>", ...],
  "immediate_actions": ["<Sofortmaßnahme 1>", "<Sofortmaßnahme 2>", ...],
  "long_term_measures": ["<Langfristmaßnahme 1>", ...],
  "summary": "<Zusammenfassung>"
}`;

        const response = await fetch(AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Analysiere diesen Sicherheitsvorfall:\n${JSON.stringify(threat_event, null, 2)}` }
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AI gateway error [${response.status}]: ${errText}`);
        }

        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || '';
        
        let analysis;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, risk_score: 50 };
        } catch {
          analysis = { summary: content, risk_score: 50, recommendations: [] };
        }

        // Save analysis
        await supabase.from('ai_threat_analyses').insert({
          analysis_type: 'event_analysis',
          target_id: threat_event.id || null,
          target_type: 'threat_event',
          input_data: threat_event,
          analysis_result: analysis,
          risk_score: analysis.risk_score || 50,
          recommendations: analysis.recommendations || [],
          summary: analysis.summary || '',
          model_used: AI_MODEL,
          confidence_score: analysis.risk_score || 50,
        });

        return new Response(JSON.stringify({ success: true, analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'risk_assessment': {
        const { assets, recent_events } = data;
        const systemPrompt = `Du bist ein Cybersecurity-Risikobewertungsexperte bei GAP Protection.
Bewerte das Gesamtrisiko basierend auf Assets und aktuellen Bedrohungsereignissen.

Antworte im JSON-Format:
{
  "overall_risk_score": <0-100>,
  "risk_level": "<kritisch|hoch|mittel|niedrig>",
  "top_risks": [{"risk": "<Beschreibung>", "probability": "<hoch|mittel|niedrig>", "impact": "<hoch|mittel|niedrig>"}],
  "vulnerable_assets": [{"asset": "<Name>", "reason": "<Grund>", "risk_score": <0-100>}],
  "threat_trends": "<Trendanalyse>",
  "security_posture": "<Bewertung der Sicherheitslage>",
  "recommendations": ["<Empfehlung 1>", ...],
  "executive_summary": "<Management-Zusammenfassung>"
}`;

        const response = await fetch(AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Assets: ${JSON.stringify(assets)}\n\nAktuelle Events: ${JSON.stringify(recent_events)}` }
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AI gateway error [${response.status}]: ${errText}`);
        }

        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || '';
        
        let assessment;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          assessment = jsonMatch ? JSON.parse(jsonMatch[0]) : { executive_summary: content, overall_risk_score: 50 };
        } catch {
          assessment = { executive_summary: content, overall_risk_score: 50 };
        }

        await supabase.from('ai_threat_analyses').insert({
          analysis_type: 'risk_assessment',
          target_type: 'system',
          input_data: { assets_count: assets?.length, events_count: recent_events?.length },
          analysis_result: assessment,
          risk_score: assessment.overall_risk_score || 50,
          recommendations: assessment.recommendations || [],
          summary: assessment.executive_summary || '',
          model_used: AI_MODEL,
        });

        return new Response(JSON.stringify({ success: true, assessment }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'behavioral_analysis': {
        const { network_data } = data;
        const systemPrompt = `Du bist ein Netzwerk-Verhaltensanalyst bei GAP Protection. 
Analysiere Netzwerkverkehr auf Anomalien und verdächtige Muster.

Antworte im JSON-Format:
{
  "anomalies_detected": <Anzahl>,
  "anomalies": [{"type": "<Typ>", "severity": "<Schwere>", "description": "<Beschreibung>", "source": "<Quelle>"}],
  "behavioral_patterns": ["<Muster 1>", ...],
  "risk_indicators": ["<Indikator 1>", ...],
  "recommendations": ["<Empfehlung 1>", ...],
  "summary": "<Zusammenfassung>"
}`;

        const response = await fetch(AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Netzwerkdaten:\n${JSON.stringify(network_data)}` }
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AI gateway error [${response.status}]: ${errText}`);
        }

        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || '';
        
        let analysis;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content };
        } catch {
          analysis = { summary: content };
        }

        return new Response(JSON.stringify({ success: true, analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return jsonResponse({ error: 'Unknown action' }, 200, corsHeaders);
    }
  } catch (error) {
    console.error('AI threat analysis error:', error);
    return jsonResponse({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 200, corsHeaders);
  }
});
