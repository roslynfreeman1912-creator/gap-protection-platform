import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { ScanResult } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPhase, setCurrentPhase] = useState("");
  const [reportLang, setReportLang] = useState<"de" | "en">("de");
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSource, setAiSource] = useState<string>("");
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [deepScanProgress, setDeepScanProgress] = useState("");
  // Real-time partial results
  const [liveVulnerabilities, setLiveVulnerabilities] = useState<any[]>([]);
  const [liveAdminPanels, setLiveAdminPanels] = useState<string[]>([]);
  const [liveSubdomains, setLiveSubdomains] = useState<any[]>([]);
  const [liveOpenPorts, setLiveOpenPorts] = useState<any[]>([]);
  const [liveDnsRecords, setLiveDnsRecords] = useState<any[]>([]);
  const [liveDirectories, setLiveDirectories] = useState<any[]>([]);
  const [liveWaybackUrls, setLiveWaybackUrls] = useState<any[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const saveScanHistory = (data: ScanResult) => {
    const history = JSON.parse(localStorage.getItem("scanHistory") || "[]");
    history.unshift({
      id: data.id,
      targetUrl: data.targetUrl,
      timestamp: data.timestamp,
      duration: data.duration,
      vulnerabilities: data.vulnerabilities.length,
      critical: data.summary?.critical || 0,
      high: data.summary?.high || 0,
      medium: data.summary?.medium || 0,
      low: data.summary?.low || 0,
      vulnDetails: data.vulnerabilities || [],
      openPorts: data.openPorts || [],
      serverInfo: data.serverInfo || {},
      sslCertificate: data.sslCertificate || {},
      dnsRecords: data.dnsRecords || [],
      subdomains: data.subdomains || [],
      securityHeaders: (data as any).securityHeaders || {},
    });
    localStorage.setItem("scanHistory", JSON.stringify(history.slice(0, 50)));
  };

  const downloadReport = async (lang?: "de" | "en") => {
    if (!scanResult) return;
    const selectedLang = lang || reportLang;
    
    // Auto-run Claude AI analysis before PDF if not done yet
    if (!aiAnalysis) {
      addLog(`[AI] Auto-Analyse vor PDF-Erstellung...`);
      try {
        const aiResp = await fetch("/api/ai-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanResult: {
              targetUrl: scanResult.targetUrl,
              vulnerabilities: scanResult.vulnerabilities,
              summary: scanResult.summary,
              openPorts: scanResult.openPorts,
              serverInfo: scanResult.serverInfo,
              sslCertificate: scanResult.sslCertificate,
              dnsRecords: scanResult.dnsRecords,
              subdomains: scanResult.subdomains,
              adminPanels: scanResult.adminPanels,
              directories: scanResult.directories,
              securityHeaders: (scanResult as any).securityHeaders,
            },
            language: selectedLang,
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          setAiAnalysis(aiData.analysis);
          setAiSource(aiData.source || "unknown");
          addLog(`[AI] Auto-Analyse abgeschlossen (${aiData.source})`);
        }
      } catch { /* continue without AI */ }
    }
    
    addLog(`[GAP] ${selectedLang === "de" ? "Bericht wird generiert..." : "Report is being generated..."}`);
    try {
      // Send full scan data including live results for comprehensive PDF
      const reportData = {
        ...scanResult,
        openPorts: scanResult.openPorts || liveOpenPorts,
        subdomains: scanResult.subdomains || liveSubdomains,
        dnsRecords: scanResult.dnsRecords || liveDnsRecords,
        directories: scanResult.directories || liveDirectories,
        adminPanels: scanResult.adminPanels || liveAdminPanels,
        waybackUrls: scanResult.waybackUrls || liveWaybackUrls,
        language: selectedLang,
        aiAnalysis: aiAnalysis,
      };
      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `TEUFEL-Shield-Report-${selectedLang.toUpperCase()}-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        addLog(`[GAP] ${selectedLang === "de" ? "Bericht erfolgreich heruntergeladen!" : "Report downloaded successfully!"}`);
        toast({ title: selectedLang === "de" ? "Bericht Generiert" : "Report Generated", description: selectedLang === "de" ? "Professioneller PDF-Bericht heruntergeladen" : "Professional PDF report downloaded" });
      } else {
        addLog("[FEHLER] PDF-Generierung fehlgeschlagen: " + response.status);
        toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht generiert werden" });
      }
    } catch (error) {
      addLog("[FEHLER] Bericht konnte nicht generiert werden");
      toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht generiert werden" });
    }
  };

  // AI Analysis of scan results (Claude AI with key rotation)
  const runAiAnalysis = async () => {
    if (!scanResult) return;
    setIsAnalyzing(true);
    setAiSource("");
    addLog("[AI] Starte Claude KI-Analyse der Scan-Ergebnisse...");
    
    try {
      const response = await fetch("/api/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanResult: {
            targetUrl: scanResult.targetUrl,
            vulnerabilities: scanResult.vulnerabilities,
            summary: scanResult.summary,
            openPorts: scanResult.openPorts,
            serverInfo: scanResult.serverInfo,
            sslCertificate: scanResult.sslCertificate,
            dnsRecords: scanResult.dnsRecords,
            subdomains: scanResult.subdomains,
            adminPanels: scanResult.adminPanels,
            directories: scanResult.directories,
            securityHeaders: (scanResult as any).securityHeaders,
          },
          language: reportLang,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiAnalysis(data.analysis);
        setAiSource(data.source || "unknown");
        const srcLabel = data.source === "claude" ? "Claude AI" : data.source === "local-fallback" ? "Lokal (Fallback)" : "Lokal";
        addLog(`[AI] KI-Analyse abgeschlossen! (${srcLabel}${data.keyUsed ? ` Key #${data.keyUsed}` : ""})`);
        toast({ title: "KI-Analyse", description: `Analyse via ${srcLabel} abgeschlossen` });
      } else {
        addLog("[FEHLER] KI-Analyse fehlgeschlagen");
        toast({ variant: "destructive", title: "Fehler", description: "KI-Analyse fehlgeschlagen" });
      }
    } catch (error) {
      addLog("[FEHLER] KI-Analyse nicht verfügbar");
      toast({ variant: "destructive", title: "Fehler", description: "KI-Analyse nicht verfügbar" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Deep AI Scan - Multi-pass with key rotation (uses different key per pass)
  const runDeepAiScan = async () => {
    if (!scanResult) return;
    setIsDeepScanning(true);
    setAiSource("");
    setDeepScanProgress("Pass 1/3...");
    addLog("[AI DEEP] Starte Multi-Pass Tiefenanalyse mit Key-Rotation...");
    
    try {
      const response = await fetch("/api/ai-deep-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanResult: {
            targetUrl: scanResult.targetUrl,
            vulnerabilities: scanResult.vulnerabilities,
            summary: scanResult.summary,
            openPorts: scanResult.openPorts,
            serverInfo: scanResult.serverInfo,
            sslCertificate: scanResult.sslCertificate,
            dnsRecords: scanResult.dnsRecords,
            subdomains: scanResult.subdomains,
            adminPanels: scanResult.adminPanels,
            directories: scanResult.directories,
            securityHeaders: (scanResult as any).securityHeaders,
            waybackUrls: scanResult.waybackUrls,
          },
          language: reportLang,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiAnalysis(data.analysis);
        setAiSource("claude-deep");
        const successCount = data.successfulPasses || 0;
        const totalPasses = data.totalPasses || 3;
        addLog(`[AI DEEP] Tiefenanalyse abgeschlossen! ${successCount}/${totalPasses} Durchgänge erfolgreich`);
        if (data.passes) {
          data.passes.forEach((p: any) => {
            addLog(`  [${p.status === "success" ? "OK" : "FAIL"}] ${p.name}${p.keyUsed ? ` (Key #${p.keyUsed})` : ""}`);
          });
        }
        toast({ title: "KI-Tiefenanalyse", description: `${successCount}/${totalPasses} Durchgänge abgeschlossen` });
      } else {
        addLog("[FEHLER] Tiefenanalyse fehlgeschlagen");
        toast({ variant: "destructive", title: "Fehler", description: "Tiefenanalyse fehlgeschlagen" });
      }
    } catch (error) {
      addLog("[FEHLER] Tiefenanalyse nicht verfügbar");
      toast({ variant: "destructive", title: "Fehler", description: "Tiefenanalyse nicht verfügbar" });
    } finally {
      setIsDeepScanning(false);
      setDeepScanProgress("");
    }
  };

  // Start real-time SSE streaming scan
  const startStreamingScan = useCallback(() => {
    if (!targetUrl) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine Ziel-URL ein",
        variant: "destructive",
      });
      return;
    }

    // Clear previous state
    setTerminalLogs([]);
    setScanResult(null);
    setIsStreaming(true);
    setShowLogs(true);
    // Clear live results
    setLiveVulnerabilities([]);
    setLiveAdminPanels([]);
    setLiveSubdomains([]);
    setLiveOpenPorts([]);
    setLiveDnsRecords([]);
    setLiveDirectories([]);
    setLiveWaybackUrls([]);

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const encodedUrl = encodeURIComponent(targetUrl);
    const eventSource = new EventSource(`/api/scan/stream?target=${encodedUrl}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "log") {
          addLog(`[${data.category}] ${data.message}`);
        } else if (data.type === "phase") {
          setCurrentPhase(data.name);
          addLog(`[PHASE ${data.phase}] ${data.name} - ${data.status.toUpperCase()}`);
        } else if (data.type === "result") {
          // Handle real-time partial results
          if (data.resultType === "vulnerability") {
            setLiveVulnerabilities(prev => [...prev, data.data]);
          } else if (data.resultType === "admin_panel") {
            setLiveAdminPanels(prev => [...prev, data.data]);
          } else if (data.resultType === "subdomain") {
            setLiveSubdomains(prev => [...prev, data.data]);
          } else if (data.resultType === "open_port") {
            setLiveOpenPorts(prev => [...prev, data.data]);
          } else if (data.resultType === "dns_record") {
            setLiveDnsRecords(prev => [...prev, data.data]);
          } else if (data.resultType === "directory") {
            setLiveDirectories(prev => [...prev, data.data]);
          } else if (data.resultType === "wayback_url") {
            setLiveWaybackUrls(prev => [...prev, data.data]);
          }
        } else if (data.type === "complete") {
          setScanResult(data.result);
          saveScanHistory(data.result);
          setIsStreaming(false);
          eventSource.close();
          toast({
            title: "Scan Complete - TEUFEL Shield",
            description: `${data.result.summary?.total || data.result.vulnerabilities.length} Schwachstellen in ${data.result.duration} gefunden`,
          });
          // Auto-download PDF report after scan completion
          setTimeout(() => {
            const autoDownload = async () => {
              try {
                const reportData = {
                  ...data.result,
                  language: "de",
                };
                const resp = await fetch("/api/generate-pdf", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(reportData),
                });
                if (resp.ok) {
                  const blob = await resp.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `TEUFEL-Shield-Report-${Date.now()}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  a.remove();
                }
              } catch {}
            };
            autoDownload();
          }, 1500);
        } else if (data.type === "error") {
          addLog(`[FEHLER] ${data.message}`);
          setIsStreaming(false);
          eventSource.close();
          toast({
            title: "Scan Fehlgeschlagen",
            description: data.message,
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = () => {
      if (isStreaming) {
        addLog("[FEHLER] Verbindung zum Server verloren");
        setIsStreaming(false);
        eventSource.close();
      }
    };
  }, [targetUrl, toast, addLog, isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    startStreamingScan();
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case "critical": return "severity-critical";
      case "high": return "severity-high";
      case "medium": return "severity-medium";
      case "low": return "severity-low";
      default: return "severity-info";
    }
  };

  const summary = scanResult?.summary || {
    total: scanResult?.vulnerabilities.length || 0,
    critical: scanResult?.vulnerabilities.filter(v => v.severity === "critical").length || 0,
    high: scanResult?.vulnerabilities.filter(v => v.severity === "high").length || 0,
    medium: scanResult?.vulnerabilities.filter(v => v.severity === "medium").length || 0,
    low: scanResult?.vulnerabilities.filter(v => v.severity === "low").length || 0,
    info: scanResult?.vulnerabilities.filter(v => v.severity === "info").length || 0,
  };

  return (
    <div className="terminal-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        
        .terminal-container {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          background: #0a0a0a;
          color: #00ff00;
          min-height: 100vh;
          padding: 0;
          font-size: 13px;
          line-height: 1.4;
        }
        
        .terminal-window {
          max-width: 1200px;
          margin: 0 auto;
          background: #0d0d0d;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 20px;
          margin-bottom: 20px;
        }
        
        .terminal-header {
          background: #1a1a1a;
          padding: 10px 15px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #333;
        }
        
        .terminal-btn { width: 12px; height: 12px; border-radius: 50%; }
        .btn-red { background: #ff5f56; }
        .btn-yellow { background: #ffbd2e; }
        .btn-green { background: #27ca3f; }
        
        .terminal-title { color: #888; margin-left: 10px; font-size: 12px; }
        
        .terminal-body { padding: 20px; min-height: 600px; overflow-y: auto; }
        
        .banner { color: #ff0000; white-space: pre; font-size: 9px; line-height: 1.1; margin-bottom: 15px; overflow-x: auto; }
        
        .info-line { color: #00ff00; margin: 4px 0; word-break: break-all; }
        .info-line.red { color: #ff0000; }
        .info-line.yellow { color: #ffaa00; }
        .info-line.cyan { color: #00ffff; }
        .info-line.magenta { color: #ff00ff; }
        .info-line.blue { color: #00aaff; }
        .info-line.white { color: #ffffff; }
        
        .input-form { display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; }
        
        .input-form input {
          flex: 1; min-width: 250px; padding: 10px 15px; font-size: 13px;
          background: #111; border: 1px solid #00ff00; color: #00ff00;
          font-family: inherit; border-radius: 4px;
        }
        .input-form input::placeholder { color: #555; }
        
        .input-form button {
          padding: 10px 25px; font-size: 13px; background: #00ff00;
          border: none; color: #000; cursor: pointer; font-weight: bold;
          font-family: inherit; border-radius: 4px; transition: all 0.2s;
        }
        .input-form button:hover { background: #00cc00; }
        .input-form button:disabled { background: #333; color: #666; cursor: not-allowed; }
        
        .box { border: 1px solid #444; border-radius: 4px; margin: 12px 0; overflow: hidden; }
        .box-header { background: #1a1a1a; padding: 6px 12px; border-bottom: 1px solid #444; color: #00ff00; font-weight: bold; font-size: 12px; }
        .box-content { padding: 12px; max-height: 300px; overflow-y: auto; }
        
        .table-container { overflow-x: auto; }
        .data-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
        .data-table th, .data-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
        .data-table th { background: #1a1a1a; color: #00ffff; }
        .data-table td { color: #00ff00; }
        
        .vuln-box { border-radius: 4px; margin: 12px 0; }
        .vuln-box.severity-critical { border: 1px solid #ff0000; background: #1a0000; }
        .vuln-box.severity-high { border: 1px solid #ff6600; background: #1a0d00; }
        .vuln-box.severity-medium { border: 1px solid #ffaa00; background: #1a1500; }
        .vuln-box.severity-low { border: 1px solid #888; background: #111; }
        .vuln-box.severity-info { border: 1px solid #00aaff; background: #001a1a; }
        
        .vuln-header { padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 1px solid; }
        .vuln-box.severity-critical .vuln-header { color: #ff0000; border-color: #ff0000; }
        .vuln-box.severity-high .vuln-header { color: #ff6600; border-color: #ff6600; }
        .vuln-box.severity-medium .vuln-header { color: #ffaa00; border-color: #ffaa00; }
        .vuln-box.severity-low .vuln-header { color: #888; border-color: #888; }
        .vuln-box.severity-info .vuln-header { color: #00aaff; border-color: #00aaff; }
        
        .vuln-content { padding: 12px; font-size: 11px; }
        .vuln-content p { margin: 4px 0; color: #ccc; word-break: break-all; }
        .vuln-content .label { color: #00ffff; }
        
        .phase-box { border: 1px solid #00ffff; border-radius: 4px; margin: 15px 0; padding: 8px 12px; display: inline-block; }
        .phase-box h3 { color: #00ffff; font-size: 12px; margin: 0; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 15px 0; }
        @media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 500px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
        
        .nav-buttons { display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; }
        .nav-btn {
          padding: 8px 16px; font-size: 11px; font-family: inherit;
          border: 1px solid; background: transparent; cursor: pointer;
          border-radius: 4px; transition: all 0.2s; font-weight: bold;
        }
        .nav-btn.dashboard-btn { color: #00ffff; border-color: #00ffff; }
        .nav-btn.dashboard-btn:hover { background: #00ffff22; }
        .nav-btn.pdf-btn { color: #ff00ff; border-color: #ff00ff; }
        .nav-btn.pdf-btn:hover { background: #ff00ff22; }
        .nav-btn.log-btn { color: #ffaa00; border-color: #ffaa00; }
        .nav-btn.log-btn:hover { background: #ffaa0022; }
        .nav-btn.shield-btn { color: #22c55e; border-color: #22c55e; }
        .nav-btn.shield-btn:hover { background: #22c55e22; }
        
        .terminal-output {
          border: 2px solid #00ff00; border-radius: 4px; margin: 15px 0;
          background: #000000; max-height: 400px; overflow: visible;
          -webkit-box-shadow: 0 0 20px rgba(0, 255, 0, 0.4), inset 0 0 10px rgba(0, 255, 0, 0.1);
          -moz-box-shadow: 0 0 20px rgba(0, 255, 0, 0.4), inset 0 0 10px rgba(0, 255, 0, 0.1);
          box-shadow: 0 0 20px rgba(0, 255, 0, 0.4), inset 0 0 10px rgba(0, 255, 0, 0.1);
          position: relative;
        }
        .terminal-output-header {
          background: #0a0a0a; padding: 10px 15px; border-bottom: 2px solid #00ff00;
          display: flex; justify-content: space-between; font-size: 12px;
          color: #00ff00; font-weight: bold;
        }
        .terminal-output-body {
          padding: 15px; max-height: 500px; overflow-y: auto; font-size: 11px;
          background: linear-gradient(180deg, #000 0%, #050505 100%);
          scroll-behavior: smooth;
        }
        .terminal-output-body::-webkit-scrollbar { width: 8px; }
        .terminal-output-body::-webkit-scrollbar-track { background: #111; }
        .terminal-output-body::-webkit-scrollbar-thumb { background: #00ff00; border-radius: 4px; }
        .log-line { margin: 2px 0; color: #00ff00; font-family: 'JetBrains Mono', 'Fira Code', monospace; letter-spacing: 0.3px; line-height: 1.4; }
        .log-line.success { color: #00ff88; }
        .log-line.warning { color: #ffaa00; }
        .log-line.error { color: #ff4444; font-weight: bold; }
        .log-line.gap { color: #ff0000; font-weight: bold; }
        .log-line.error { color: #ff0000; }
        .log-line.warn { color: #ffaa00; }
        .log-line.info { color: #00ffff; }
        .log-line.success { color: #00ff00; font-weight: bold; }
        
        .stat-box { background: #111; border: 1px solid #333; padding: 12px; text-align: center; border-radius: 4px; }
        .stat-box.critical { border-color: #ff0000; }
        .stat-box.high { border-color: #ff6600; }
        .stat-box.medium { border-color: #ffaa00; }
        .stat-box.low { border-color: #888; }
        .stat-box.info { border-color: #00aaff; }
        
        .stat-number { font-size: 24px; font-weight: bold; display: block; }
        .stat-number.critical { color: #ff0000; }
        .stat-number.high { color: #ff6600; }
        .stat-number.medium { color: #ffaa00; }
        .stat-number.low { color: #888; }
        .stat-number.info { color: #00aaff; }
        
        .stat-label { color: #888; font-size: 11px; }
        
        .scrollable-box { max-height: 200px; overflow-y: auto; }
        
        .loading-spinner {
          display: inline-block; width: 20px; height: 20px;
          border: 2px solid #333; border-top-color: #00ff00;
          border-radius: 50%; animation: spin 1s linear infinite;
          margin-right: 10px; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .loading-text { color: #00ff00; animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: 0.5; } }
        
        .phases-container { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
        .phase-item { background: #111; border: 1px solid #333; padding: 8px 12px; border-radius: 4px; font-size: 11px; }
        .phase-item.complete { border-color: #00ff00; }
        .phase-item .phase-name { color: #00ffff; font-weight: bold; }
        .phase-item .phase-details { color: #888; margin-top: 4px; }
      `}</style>
      
      <div className="terminal-window">
        <div className="terminal-header">
          <div className="terminal-btn btn-red"></div>
          <div className="terminal-btn btn-yellow"></div>
          <div className="terminal-btn btn-green"></div>
          <span className="terminal-title">TEUFEL SHIELD - Security Scanner | GAP PROTECTION</span>
        </div>
        
        <div className="terminal-body">
          <pre className="banner">{`
╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                                                   ║
║   ████████╗███████╗██╗   ██╗███████╗███████╗██╗         ███████╗██╗  ██╗██╗███████╗██╗     ██████╗                ║
║   ╚══██╔══╝██╔════╝██║   ██║██╔════╝██╔════╝██║         ██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗               ║
║      ██║   █████╗  ██║   ██║█████╗  █████╗  ██║         ███████╗███████║██║█████╗  ██║     ██║  ██║               ║
║      ██║   ██╔══╝  ██║   ██║██╔══╝  ██╔══╝  ██║         ╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║               ║
║      ██║   ███████╗╚██████╔╝██║     ███████╗███████╗    ███████║██║  ██║██║███████╗███████╗██████╔╝               ║
║      ╚═╝   ╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚══════╝    ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝                ║
║                                                                                                                   ║
║   [+] TEUFEL SHIELD - Enterprise Vulnerability Scanner v3.0 | GAP PROTECTION                                     ║
║   [+] SQL Injection | XSS | LFI | RCE | SSTI | SSRF | XXE | Open Redirect | CORS | Clickjacking                   ║
║   [+] Admin-Panels | Backup-Dateien | Sensitive Dateien | WAF-Bypass | Technologie-Erkennung                       ║
║   [+] gap-protection.pro - Full Exploitation & Remediation Guidance + KI-Analyse                                  ║
║                                                                                                                   ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
          `}</pre>
          
          <p className="info-line red">[*] TEUFEL Shield Scanner ready! Enterprise mode activated!</p>
          <p className="info-line">[+] Professioneller Schwachstellenscanner - VOLLES HACKER-ARSENAL</p>
          <p className="info-line cyan">[+] 23 Scan-Phasen | 500+ Admin-Pfade | 300+ Backup-Dateien | 150+ Sensitive Dateien</p>
          <p className="info-line cyan">[+] Port-Scanner | DNS-Enumeration | SSL-Analyse | Subdomain-Crawler | Verzeichnis-Bruteforce</p>
          <p className="info-line magenta">[+] 57+ Schwachstellentypen | WAF-Bypass | Wayback-Machine | Cookie-Extraktion</p>
          <p className="info-line yellow">[+] Echtzeit-Terminal | Exploit-Anleitungen | Behebungslosungen | KI-Analyse</p>
          
          <div className="nav-buttons">
            <Link href="/dashboard">
              <button type="button" className="nav-btn dashboard-btn" data-testid="link-dashboard">
                [ DASHBOARD ]
              </button>
            </Link>
            <Link href="/shield">
              <button type="button" className="nav-btn shield-btn" data-testid="link-shield">
                [ TEUFEL SHIELD WAF ]
              </button>
            </Link>
            {scanResult && (
              <>
                <button type="button" onClick={() => downloadReport("de")} className="nav-btn pdf-btn" data-testid="button-download-report-de">
                  [ BERICHT PDF (DE) ]
                </button>
                <button type="button" onClick={() => downloadReport("en")} className="nav-btn pdf-btn" style={{ borderColor: "#00aaff", color: "#00aaff" }} data-testid="button-download-report-en">
                  [ REPORT PDF (EN) ]
                </button>
                <button type="button" onClick={runAiAnalysis} disabled={isAnalyzing || isDeepScanning} className="nav-btn" style={{ borderColor: "#ff6600", color: "#ff6600" }} data-testid="button-ai-analyze">
                  {isAnalyzing ? "[ CLAUDE ANALYSIERT... ]" : "[ CLAUDE AI-ANALYSE ]"}
                </button>
                <button type="button" onClick={runDeepAiScan} disabled={isAnalyzing || isDeepScanning} className="nav-btn" style={{ borderColor: "#ff00ff", color: "#ff00ff" }} data-testid="button-ai-deep-scan">
                  {isDeepScanning ? `[ DEEP SCAN ${deepScanProgress} ]` : "[ AI DEEP SCAN ]"}
                </button>
              </>
            )}
            <button type="button" onClick={() => setShowLogs(!showLogs)} className="nav-btn log-btn" data-testid="button-toggle-logs">
              [ {showLogs ? "TERMINAL AUSBLENDEN" : "TERMINAL ANZEIGEN"} ]
            </button>
            <select
              value={reportLang}
              onChange={(e) => setReportLang(e.target.value as "de" | "en")}
              style={{ background: "#111", border: "1px solid #00ffff", color: "#00ffff", padding: "8px 12px", borderRadius: "4px", fontSize: "11px", fontFamily: "inherit", cursor: "pointer" }}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          
          <form onSubmit={handleScan} className="input-form">
            <input 
              type="text" 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="Ziel-URL eingeben (z.B. https://example.com)" 
              data-testid="input-target-url"
            />
            <button type="submit" disabled={isStreaming} data-testid="button-start-scan">
              {isStreaming ? "[ SCANNING... REAL-TIME ]" : "[ START GAP SCAN ]"}
            </button>
          </form>
          
          {showLogs && terminalLogs.length > 0 && (
            <div className="terminal-output">
              <div className="terminal-output-header">
                <span style={{ color: "#00ffff" }}>GAP Protection Terminal Output</span>
                <span style={{ color: "#888" }}>{terminalLogs.length} Eintrage</span>
              </div>
              <div className="terminal-output-body" ref={terminalRef}>
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className={`log-line ${log.includes("[FEHLER]") || log.includes("[ERROR]") ? "error" : log.includes("[GAP]") ? "gap" : log.includes("✓") ? "success" : log.includes("⚠") ? "warning" : ""}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {isStreaming && (
            <div style={{ padding: "20px 0" }}>
              <span className="loading-spinner"></span>
              <span className="loading-text">ECHTZEIT-SCAN LAUFT... {currentPhase && `Phase: ${currentPhase}`}</span>
              <p className="info-line yellow" style={{ marginTop: "10px" }}>[*] Terminal zeigt alle Operationen in Echtzeit!</p>
              <p className="info-line cyan">[*] GAP Protection - All tests displayed in real-time!</p>
              
              {/* LIVE RESULTS SECTION - Shows during scan */}
              <div className="live-results" style={{ marginTop: "20px" }}>
                {liveOpenPorts.length > 0 && (
                  <div className="box" style={{ borderColor: "#00ff00", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#00ff00" }}>LIVE: Offene Ports ({liveOpenPorts.length})</div>
                    <div className="box-content">
                      {liveOpenPorts.map((port, idx) => (
                        <p key={idx} className="info-line">Port {port.port} - {port.service} [{port.state}]</p>
                      ))}
                    </div>
                  </div>
                )}
                
                {liveDnsRecords.length > 0 && (
                  <div className="box" style={{ borderColor: "#00ffff", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#00ffff" }}>LIVE: DNS Records ({liveDnsRecords.length})</div>
                    <div className="box-content">
                      {liveDnsRecords.map((rec, idx) => (
                        <p key={idx} className="info-line">{rec.type}: {rec.value}</p>
                      ))}
                    </div>
                  </div>
                )}
                
                {liveSubdomains.length > 0 && (
                  <div className="box" style={{ borderColor: "#aa00ff", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#aa00ff" }}>LIVE: Subdomains ({liveSubdomains.length})</div>
                    <div className="box-content">
                      {liveSubdomains.map((sub, idx) => (
                        <p key={idx} className="info-line">{sub.subdomain} - {sub.ip}</p>
                      ))}
                    </div>
                  </div>
                )}
                
                {liveAdminPanels.length > 0 && (
                  <div className="box" style={{ borderColor: "#ff6600", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#ff6600" }}>LIVE: Admin Panels ({liveAdminPanels.length})</div>
                    <div className="box-content">
                      {liveAdminPanels.map((panel, idx) => (
                        <p key={idx} className="info-line link">{panel}</p>
                      ))}
                    </div>
                  </div>
                )}
                
                {liveDirectories.length > 0 && (
                  <div className="box" style={{ borderColor: "#ffaa00", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#ffaa00" }}>LIVE: Verzeichnisse ({liveDirectories.length})</div>
                    <div className="box-content">
                      {liveDirectories.map((dir, idx) => (
                        <p key={idx} className="info-line">{dir.path} [{dir.status}]</p>
                      ))}
                    </div>
                  </div>
                )}
                
                {liveWaybackUrls.length > 0 && (
                  <div className="box" style={{ borderColor: "#00ffaa", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#00ffaa" }}>LIVE: Wayback URLs ({liveWaybackUrls.length})</div>
                    <div className="box-content">
                      {liveWaybackUrls.slice(0, 20).map((wb, idx) => (
                        <p key={idx} className="info-line">{wb.url}</p>
                      ))}
                      {liveWaybackUrls.length > 20 && <p className="info-line yellow">... +{liveWaybackUrls.length - 20} mehr</p>}
                    </div>
                  </div>
                )}
                
                {liveVulnerabilities.length > 0 && (
                  <div className="box" style={{ borderColor: "#ff0000", marginBottom: "15px" }}>
                    <div className="box-header" style={{ color: "#ff0000" }}>LIVE: Schwachstellen ({liveVulnerabilities.length})</div>
                    <div className="box-content">
                      {liveVulnerabilities.map((vuln, idx) => (
                        <div key={idx} className={`vuln-item ${vuln.severity}`} style={{ marginBottom: "10px", padding: "10px", border: "1px solid #333" }}>
                          <p className="info-line red">[{vuln.severity?.toUpperCase()}] {vuln.type}</p>
                          <p className="info-line">{vuln.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {scanResult && (
            <>
              {/* Scan Phases */}
              {scanResult.scanPhases && scanResult.scanPhases.length > 0 && (
                <div className="box" style={{ borderColor: "#00ffff" }}>
                  <div className="box-header" style={{ color: "#00ffff" }}>Scan-Phasen ({scanResult.scanPhases.length})</div>
                  <div className="phases-container box-content">
                    {scanResult.scanPhases.map((phase, idx) => (
                      <div key={idx} className={`phase-item ${phase.status === "Complete" || phase.status === "Done" ? "complete" : ""}`}>
                        <div className="phase-name">Phase {phase.phase}: {phase.name}</div>
                        <div className="phase-details">{phase.details}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EXECUTIVE SUMMARY - Professional Risk Assessment */}
              <div className="executive-summary" data-testid="executive-summary" style={{ background: "#0a0a0a", border: "2px solid #00ff00", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
                  <div style={{ width: "8px", height: "40px", background: "#00ff00" }}></div>
                  <h2 style={{ color: "#00ff00", margin: 0, fontSize: "18px" }} data-testid="text-executive-title">EXECUTIVE SUMMARY - Security Assessment Report</h2>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "15px" }}>
                  <div style={{ background: "#111", padding: "15px", borderRadius: "6px", borderLeft: "4px solid #00ffff" }} data-testid="card-target">
                    <p style={{ color: "#888", margin: 0, fontSize: "11px" }}>TARGET</p>
                    <p style={{ color: "#00ffff", margin: "5px 0 0 0", fontSize: "14px", wordBreak: "break-all" }} data-testid="text-target-url">{scanResult.targetUrl}</p>
                  </div>
                  <div style={{ background: "#111", padding: "15px", borderRadius: "6px", borderLeft: "4px solid #aa00ff" }} data-testid="card-duration">
                    <p style={{ color: "#888", margin: 0, fontSize: "11px" }}>SCAN DURATION</p>
                    <p style={{ color: "#aa00ff", margin: "5px 0 0 0", fontSize: "14px" }} data-testid="text-scan-duration">{scanResult.duration}</p>
                  </div>
                  <div style={{ background: "#111", padding: "15px", borderRadius: "6px", borderLeft: "4px solid #00aa00" }} data-testid="card-status">
                    <p style={{ color: "#888", margin: 0, fontSize: "11px" }}>HTTP STATUS</p>
                    <p style={{ color: "#00aa00", margin: "5px 0 0 0", fontSize: "14px" }} data-testid="text-http-status">{scanResult.status}</p>
                  </div>
                  <div style={{ background: "#111", padding: "15px", borderRadius: "6px", borderLeft: summary.critical > 0 ? "4px solid #ff0000" : summary.high > 0 ? "4px solid #ff6600" : "4px solid #00ff00" }} data-testid="card-risk">
                    <p style={{ color: "#888", margin: 0, fontSize: "11px" }}>OVERALL RISK</p>
                    <p style={{ color: summary.critical > 0 ? "#ff0000" : summary.high > 0 ? "#ff6600" : summary.medium > 0 ? "#ffaa00" : "#00ff00", margin: "5px 0 0 0", fontSize: "14px", fontWeight: "bold" }} data-testid="text-overall-risk">
                      {summary.critical > 0 ? "CRITICAL" : summary.high > 0 ? "HIGH" : summary.medium > 0 ? "MEDIUM" : "LOW"}
                    </p>
                  </div>
                </div>
                
                {/* Risk Matrix */}
                <div style={{ background: "#111", padding: "15px", borderRadius: "6px" }} data-testid="risk-matrix">
                  <p style={{ color: "#00ff00", margin: "0 0 10px 0", fontSize: "12px", fontWeight: "bold" }}>VULNERABILITY DISTRIBUTION</p>
                  <div style={{ display: "flex", gap: "5px", height: "30px", borderRadius: "4px", overflow: "hidden" }} data-testid="risk-distribution-bar">
                    {summary.critical > 0 && <div style={{ flex: summary.critical, background: "#ff0000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "10px" }}>{summary.critical} Critical</div>}
                    {summary.high > 0 && <div style={{ flex: summary.high, background: "#ff6600", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "10px" }}>{summary.high} High</div>}
                    {summary.medium > 0 && <div style={{ flex: summary.medium, background: "#ffaa00", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontSize: "10px" }}>{summary.medium} Medium</div>}
                    {summary.low > 0 && <div style={{ flex: summary.low, background: "#888", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "10px" }}>{summary.low} Low</div>}
                    {summary.info > 0 && <div style={{ flex: summary.info, background: "#00aaff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "10px" }}>{summary.info} Info</div>}
                    {summary.total === 0 && <div style={{ flex: 1, background: "#00ff00", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontSize: "10px" }}>No Vulnerabilities Found</div>}
                  </div>
                </div>
                
                {/* Key Findings Summary */}
                <div style={{ marginTop: "15px", padding: "10px", background: "#111", borderRadius: "6px" }} data-testid="key-findings">
                  <p style={{ color: "#00ff00", margin: "0 0 8px 0", fontSize: "12px", fontWeight: "bold" }}>KEY FINDINGS</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", fontSize: "11px" }}>
                    <span style={{ color: "#888" }} data-testid="text-open-ports">Open Ports: <span style={{ color: "#00ffff" }}>{scanResult.openPorts?.length || 0}</span></span>
                    <span style={{ color: "#888" }} data-testid="text-subdomains">Subdomains: <span style={{ color: "#aa00ff" }}>{scanResult.subdomains?.length || 0}</span></span>
                    <span style={{ color: "#888" }} data-testid="text-admin-panels">Admin Panels: <span style={{ color: "#ff6600" }}>{scanResult.adminPanels?.length || 0}</span></span>
                    <span style={{ color: "#888" }} data-testid="text-sensitive-files">Sensitive Files: <span style={{ color: "#ff0000" }}>{scanResult.sensitiveFiles?.length || 0}</span></span>
                    <span style={{ color: "#888" }} data-testid="text-directories">Directories: <span style={{ color: "#ffaa00" }}>{scanResult.directories?.length || 0}</span></span>
                    <span style={{ color: "#888" }} data-testid="text-wayback-urls">Wayback URLs: <span style={{ color: "#00ffaa" }}>{scanResult.waybackUrls?.length || 0}</span></span>
                  </div>
                </div>
              </div>
              
              {/* Tech Stack / Server Info */}
              {scanResult.techStack && Object.keys(scanResult.techStack).length > 0 && (
                <>
                  <div className="phase-box" style={{ marginTop: "15px" }}>
                    <h3>Server-Informationen & Technologie-Erkennung</h3>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>[+] Kategorie</th>
                          <th>[+] Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(scanResult.techStack).map(([key, value]) => (
                          <tr key={key}>
                            <td style={{ color: key.includes("Protection") || key.includes("WAF") ? "#ff0000" : "#00ffff" }}>{key}</td>
                            <td style={{ color: key.includes("Sensitive") ? "#ff0000" : "#00ff00" }}>
                              {Array.isArray(value) ? value.join(" | ") : String(value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              
              {/* Vulnerability Summary */}
              <div className="phase-box">
                <h3>Schwachstellen-Zusammenfassung - {summary.total} Probleme gefunden</h3>
              </div>
              
              <div className="stats-grid">
                <div className="stat-box critical" data-testid="stat-critical">
                  <span className="stat-number critical" data-testid="stat-critical-value">{summary.critical}</span>
                  <span className="stat-label">Kritisch</span>
                </div>
                <div className="stat-box high" data-testid="stat-high">
                  <span className="stat-number high" data-testid="stat-high-value">{summary.high}</span>
                  <span className="stat-label">Hoch</span>
                </div>
                <div className="stat-box medium" data-testid="stat-medium">
                  <span className="stat-number medium" data-testid="stat-medium-value">{summary.medium}</span>
                  <span className="stat-label">Mittel</span>
                </div>
                <div className="stat-box low" data-testid="stat-low">
                  <span className="stat-number low" data-testid="stat-low-value">{summary.low}</span>
                  <span className="stat-label">Niedrig</span>
                </div>
                <div className="stat-box info" data-testid="stat-info">
                  <span className="stat-number info" data-testid="stat-info-value">{summary.info}</span>
                  <span className="stat-label">Info</span>
                </div>
              </div>
              
              {/* Server Response Headers Table */}
              {scanResult.serverHeaders && scanResult.serverHeaders.length > 0 && (
                <>
                  <div className="phase-box" style={{ marginTop: "15px" }}>
                    <h3>[^_^] Server-Antwort-Header</h3>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>[+] Header</th>
                          <th>[+] Wert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.serverHeaders.map((header, idx) => (
                          <tr key={idx}>
                            <td style={{ color: "#00ffff" }}>{header.name}</td>
                            <td>{header.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Server Informationen Box */}
              {scanResult.serverInfo && (
                <div className="box" style={{ borderColor: "#00ffff" }}>
                  <div className="box-header" style={{ color: "#00ffff" }}>Server-Informationen</div>
                  <div className="box-content">
                    <p className="info-line">Server: {scanResult.serverInfo.server}</p>
                    <p className="info-line">X-Powered-By: {scanResult.serverInfo.poweredBy}</p>
                    <p className="info-line">Content-Type: {scanResult.serverInfo.contentType}</p>
                    <p className="info-line">URL: {scanResult.serverInfo.url}</p>
                    <p className="info-line">Port: {scanResult.serverInfo.port}</p>
                    {scanResult.serverInfo.ip && <p className="info-line cyan">Echte IP: {scanResult.serverInfo.ip}</p>}
                  </div>
                </div>
              )}

              {/* WAF Detection */}
              {scanResult.wafDetected && scanResult.wafDetected.length > 0 && (
                <div className="box" style={{ borderColor: "#ff0000" }}>
                  <div className="box-header" style={{ color: "#ff0000" }}>WAF/Protection Detected</div>
                  <div className="box-content">
                    {scanResult.wafDetected.map((waf, idx) => (
                      <p key={idx} className="info-line red">[!] {waf}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Vulnerabilities with full details - PROFESSIONAL DISPLAY */}
              {scanResult.vulnerabilities.map((vuln, idx) => (
                <div key={vuln.id || idx} className={`vuln-box ${getSeverityClass(vuln.severity)}`} data-testid={`vuln-finding-${vuln.id}`}>
                  <div className="vuln-header">
                    <span>{vuln.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} Vulnerability Found!</span>
                    {vuln.cvss && (
                      <span style={{ float: "right", background: vuln.cvss.score >= 9 ? "#ff0000" : vuln.cvss.score >= 7 ? "#ff6600" : vuln.cvss.score >= 4 ? "#ffaa00" : "#00aa00", color: "#fff", padding: "2px 8px", borderRadius: "3px", fontSize: "11px" }}>
                        CVSS: {vuln.cvss.score}
                      </span>
                    )}
                  </div>
                  <div className="vuln-content">
                    <div className="vuln-meta" style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "10px", fontSize: "11px" }}>
                      <span style={{ background: "#222", padding: "3px 8px", borderRadius: "3px" }}>
                        <span style={{ color: "#888" }}>Type:</span> <span style={{ color: "#fff" }}>{vuln.type.replace(/_/g, " ").toUpperCase()}</span>
                      </span>
                      <span style={{ background: vuln.severity === "critical" ? "#440000" : vuln.severity === "high" ? "#442200" : vuln.severity === "medium" ? "#443300" : "#333", padding: "3px 8px", borderRadius: "3px" }}>
                        <span style={{ color: "#888" }}>Severity:</span> <span style={{ color: vuln.severity === "critical" ? "#ff0000" : vuln.severity === "high" ? "#ff6600" : vuln.severity === "medium" ? "#ffaa00" : "#888" }}>{vuln.severity.toUpperCase()}</span>
                      </span>
                      {vuln.cwe && (
                        <span style={{ background: "#222", padding: "3px 8px", borderRadius: "3px" }}>
                          <span style={{ color: "#888" }}>CWE:</span> <span style={{ color: "#00aaff" }}>{vuln.cwe}</span>
                        </span>
                      )}
                      {vuln.owasp && (
                        <span style={{ background: "#222", padding: "3px 8px", borderRadius: "3px" }}>
                          <span style={{ color: "#888" }}>OWASP:</span> <span style={{ color: "#aa00ff" }}>{vuln.owasp}</span>
                        </span>
                      )}
                      {vuln.exploitability && (
                        <span style={{ background: "#222", padding: "3px 8px", borderRadius: "3px" }}>
                          <span style={{ color: "#888" }}>Exploitability:</span> <span style={{ color: vuln.exploitability === "Easy" ? "#ff0000" : vuln.exploitability === "Medium" ? "#ffaa00" : "#00aa00" }}>{vuln.exploitability}</span>
                        </span>
                      )}
                      {vuln.verified && (
                        <span style={{ background: "#003300", padding: "3px 8px", borderRadius: "3px", color: "#00ff00" }}>VERIFIED</span>
                      )}
                    </div>
                    
                    <p><span className="label">Description:</span> {vuln.description}</p>
                    <p><span className="label">URL:</span> <a href={vuln.url} target="_blank" rel="noopener noreferrer" style={{ color: "#00aaff" }}>{vuln.url}</a></p>
                    {vuln.parameter && <p><span className="label">Parameter:</span> <code style={{ background: "#111", padding: "2px 6px", borderRadius: "3px", color: "#ff6600" }}>{vuln.parameter}</code></p>}
                    {vuln.payload && <p><span className="label">Payload:</span> <code style={{ background: "#111", padding: "2px 6px", borderRadius: "3px", color: "#ff0000" }}>{vuln.payload}</code></p>}
                    
                    {vuln.why && (
                      <div style={{ background: "#1a0d00", border: "1px solid #ff6600", borderRadius: "4px", padding: "10px", margin: "10px 0" }}>
                        <p style={{ margin: 0 }}><span className="label" style={{ color: "#ff6600" }}>Why is this dangerous?</span></p>
                        <p style={{ margin: "5px 0 0 0", color: "#ccc" }}>{vuln.why}</p>
                      </div>
                    )}
                    
                    {vuln.solution && (
                      <div style={{ background: "#001a00", border: "1px solid #00ff00", borderRadius: "4px", padding: "10px", margin: "10px 0" }}>
                        <p style={{ margin: 0 }}><span className="label" style={{ color: "#00ff00" }}>Recommended Solution:</span></p>
                        <p style={{ margin: "5px 0 0 0", color: "#ccc" }}>{vuln.solution}</p>
                      </div>
                    )}
                    
                    {vuln.cvss && (
                      <div style={{ background: "#111", border: "1px solid #444", borderRadius: "4px", padding: "10px", margin: "10px 0" }}>
                        <p style={{ margin: 0, marginBottom: "8px" }}><span className="label" style={{ color: "#00aaff" }}>CVSS 3.1 Vector:</span> <code style={{ fontSize: "10px", color: "#888" }}>{vuln.cvss.vector}</code></p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "10px" }}>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>AV: {vuln.cvss.attackVector}</span>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>AC: {vuln.cvss.attackComplexity}</span>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>PR: {vuln.cvss.privilegesRequired}</span>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>UI: {vuln.cvss.userInteraction}</span>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>C: {vuln.cvss.confidentiality}</span>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>I: {vuln.cvss.integrity}</span>
                          <span style={{ background: "#222", padding: "2px 6px", borderRadius: "3px" }}>A: {vuln.cvss.availability}</span>
                        </div>
                      </div>
                    )}
                    
                    {vuln.reference && (
                      <p><span className="label" style={{ color: "#00aaff" }}>Reference:</span> <a href={vuln.reference} target="_blank" rel="noopener noreferrer" style={{ color: "#00aaff", textDecoration: "underline" }}>{vuln.reference}</a></p>
                    )}
                    
                    {vuln.poc && (
                      <div style={{ background: "#1a0000", border: "1px solid #ff0000", borderRadius: "4px", padding: "10px", margin: "10px 0" }}>
                        <p style={{ margin: 0 }}><span className="label" style={{ color: "#ff0000" }}>Proof of Concept (PoC):</span></p>
                        <pre style={{ margin: "5px 0 0 0", color: "#ff6600", fontSize: "11px", overflow: "auto", whiteSpace: "pre-wrap" }}>{vuln.poc}</pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {scanResult.vulnerabilities.length === 0 && (
                <div className="box" style={{ borderColor: "#00ff00" }}>
                  <div className="box-header" style={{ color: "#00ff00" }}>Keine kritischen Schwachstellen gefunden</div>
                  <div className="box-content">
                    <p className="info-line">Das Ziel scheint gegen bekannte Schwachstellen sicher zu sein.</p>
                  </div>
                </div>
              )}
              
              {/* Discovery Results */}
              <div className="phase-box">
                <h3>Entdeckungs-Ergebnisse</h3>
              </div>
              
              {/* Admin Panels */}
              {scanResult.adminPanels && scanResult.adminPanels.length > 0 && (
                <div className="box" style={{ borderColor: "#ff6600" }}>
                  <div className="box-header" style={{ color: "#ff6600" }}>Admin-Panels gefunden ({scanResult.adminPanels.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.adminPanels.map((panel, idx) => (
                      <p key={idx} className="info-line yellow">[!] {panel}</p>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Backup Files */}
              {scanResult.backupFiles && scanResult.backupFiles.length > 0 && (
                <div className="box" style={{ borderColor: "#ff0000" }}>
                  <div className="box-header" style={{ color: "#ff0000" }}>Backup-Dateien gefunden ({scanResult.backupFiles.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.backupFiles.map((file, idx) => (
                      <p key={idx} className="info-line red">[!] {file}</p>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Sensitive Files */}
              {scanResult.sensitiveFiles && scanResult.sensitiveFiles.length > 0 && (
                <div className="box" style={{ borderColor: "#ff0000" }}>
                  <div className="box-header" style={{ color: "#ff0000" }}>Sensitive Files Exposed ({scanResult.sensitiveFiles.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.sensitiveFiles.map((file, idx) => (
                      <p key={idx} className="info-line red">[!] {file}</p>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Directories/Folders */}
              {scanResult.foldersFound && scanResult.foldersFound.length > 0 && (
                <div className="box">
                  <div className="box-header">Verzeichnisse gefunden ({scanResult.foldersFound.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.foldersFound.map((folder, idx) => (
                      <p key={idx} className="info-line blue">[+] {folder}</p>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Links with Parameters */}
              {scanResult.linksFound && scanResult.linksFound.length > 0 && (
                <div className="box">
                  <div className="box-header">Links mit Parametern ({scanResult.linksFound.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.linksFound.slice(0, 50).map((link, idx) => (
                      <p key={idx} className="info-line">[+] {link}</p>
                    ))}
                    {scanResult.linksFound.length > 50 && (
                      <p className="info-line yellow">[...] und {scanResult.linksFound.length - 50} weitere Links</p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Forms */}
              {scanResult.formsFound && scanResult.formsFound.length > 0 && (
                <div className="box">
                  <div className="box-header">Forms Found ({scanResult.formsFound.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.formsFound.map((form, idx) => (
                      <p key={idx} className="info-line magenta">[+] {form}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Reconnaissance Section */}
              <div className="phase-box" style={{ marginTop: "20px" }}>
                <h3 style={{ color: "#ff00ff" }}>🔍 Advanced Reconnaissance</h3>
              </div>

              {/* Open Ports */}
              {scanResult.openPorts && scanResult.openPorts.length > 0 && (
                <div className="box" style={{ borderColor: "#ff00ff" }}>
                  <div className="box-header" style={{ color: "#ff00ff" }}>🔌 Open Ports ({scanResult.openPorts.length})</div>
                  <div className="box-content scrollable-box">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333" }}>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Port</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Service</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>State</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Banner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.openPorts.map((port, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #222" }}>
                            <td style={{ padding: "4px", color: "#00ff00" }}>{port.port}</td>
                            <td style={{ padding: "4px", color: "#ffaa00" }}>{port.service}</td>
                            <td style={{ padding: "4px", color: port.state === "open" ? "#00ff00" : "#ff0000" }}>{port.state}</td>
                            <td style={{ padding: "4px", color: "#888" }}>{port.banner || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DNS Records */}
              {scanResult.dnsRecords && scanResult.dnsRecords.length > 0 && (
                <div className="box" style={{ borderColor: "#00aaff" }}>
                  <div className="box-header" style={{ color: "#00aaff" }}>🌐 DNS Records ({scanResult.dnsRecords.length})</div>
                  <div className="box-content scrollable-box">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333" }}>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Typ</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Wert</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Prioritat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.dnsRecords.map((record, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #222" }}>
                            <td style={{ padding: "4px", color: "#00aaff" }}>{record.type}</td>
                            <td style={{ padding: "4px", color: "#00ff00" }}>{record.value}</td>
                            <td style={{ padding: "4px", color: "#888" }}>{record.priority || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SSL/TLS Certificate */}
              {scanResult.sslCertificate && (
                <div className="box" style={{ borderColor: scanResult.sslCertificate.isExpired ? "#ff0000" : "#00ff00" }}>
                  <div className="box-header" style={{ color: scanResult.sslCertificate.isExpired ? "#ff0000" : "#00ff00" }}>🔒 SSL/TLS Certificate</div>
                  <div className="box-content">
                    <p className="info-line"><span className="label">Subject:</span> {scanResult.sslCertificate.subject}</p>
                    <p className="info-line"><span className="label">Issuer:</span> {scanResult.sslCertificate.issuer}</p>
                    <p className="info-line"><span className="label">Valid From:</span> {new Date(scanResult.sslCertificate.validFrom).toLocaleDateString()}</p>
                    <p className="info-line"><span className="label">Valid To:</span> {new Date(scanResult.sslCertificate.validTo).toLocaleDateString()}</p>
                    <p className="info-line" style={{ color: scanResult.sslCertificate.daysRemaining < 30 ? "#ff0000" : "#00ff00" }}>
                      <span className="label">Days Remaining:</span> {scanResult.sslCertificate.daysRemaining}
                    </p>
                    <p className="info-line"><span className="label">Protocol:</span> {scanResult.sslCertificate.protocol}</p>
                    <p className="info-line"><span className="label">Cipher:</span> {scanResult.sslCertificate.cipher}</p>
                    <p className="info-line"><span className="label">Key Size:</span> {scanResult.sslCertificate.keySize} bits</p>
                    <p className="info-line" style={{ color: scanResult.sslCertificate.isValid ? "#00ff00" : "#ff0000" }}>
                      <span className="label">Certificate Valid:</span> {scanResult.sslCertificate.isValid ? "YES ✓" : "NO ✗"}
                    </p>
                  </div>
                </div>
              )}

              {/* Subdomains */}
              {scanResult.subdomains && scanResult.subdomains.length > 0 && (
                <div className="box" style={{ borderColor: "#aa00ff" }}>
                  <div className="box-header" style={{ color: "#aa00ff" }}>Subdomains gefunden ({scanResult.subdomains.length})</div>
                  <div className="box-content scrollable-box">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333" }}>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Subdomain</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>IP Address</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.subdomains.map((sub, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #222" }}>
                            <td style={{ padding: "4px", color: "#aa00ff" }}>{sub.subdomain}</td>
                            <td style={{ padding: "4px", color: "#00ff00" }}>{sub.ip || "-"}</td>
                            <td style={{ padding: "4px", color: sub.isAlive ? "#00ff00" : "#ff0000" }}>{sub.isAlive ? "ALIVE" : "DOWN"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Directories Found */}
              {scanResult.directories && scanResult.directories.length > 0 && (
                <div className="box" style={{ borderColor: "#ffaa00" }}>
                  <div className="box-header" style={{ color: "#ffaa00" }}>📁 Directories & Files ({scanResult.directories.length})</div>
                  <div className="box-content scrollable-box">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333" }}>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Path</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Status</th>
                          <th style={{ textAlign: "left", padding: "4px", color: "#888" }}>Redirect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.directories.map((dir, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #222" }}>
                            <td style={{ padding: "4px", color: "#ffaa00" }}>{dir.path}</td>
                            <td style={{ padding: "4px", color: dir.status === 200 ? "#00ff00" : dir.status >= 300 && dir.status < 400 ? "#ffaa00" : "#888" }}>{dir.status}</td>
                            <td style={{ padding: "4px", color: "#888", fontSize: "10px" }}>{dir.redirectTo || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Wayback Machine URLs */}
              {scanResult.waybackUrls && scanResult.waybackUrls.length > 0 && (
                <div className="box" style={{ borderColor: "#00ffaa" }}>
                  <div className="box-header" style={{ color: "#00ffaa" }}>🕐 Wayback Machine URLs ({scanResult.waybackUrls.length})</div>
                  <div className="box-content scrollable-box">
                    {scanResult.waybackUrls.slice(0, 30).map((wb, idx) => (
                      <p key={idx} className="info-line" style={{ color: "#00ffaa", fontSize: "10px" }}>
                        [{wb.timestamp?.substring(0, 8) || "Unknown"}] {wb.url}
                      </p>
                    ))}
                    {scanResult.waybackUrls.length > 30 && (
                      <p className="info-line yellow">[...] and {scanResult.waybackUrls.length - 30} more historical URLs</p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Final Summary */}
              
              {/* AI Analysis Section */}
              {aiAnalysis && (
                <div className="box" style={{ borderColor: aiSource === "claude-deep" ? "#ff00ff" : aiSource === "claude" ? "#ff6600" : "#888", marginBottom: "20px" }}>
                  <div className="box-header" style={{ color: aiSource === "claude-deep" ? "#ff00ff" : aiSource === "claude" ? "#ff6600" : "#888", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{aiSource === "claude-deep" ? "CLAUDE AI DEEP SCAN" : aiSource === "claude" ? "CLAUDE AI ANALYSE" : "KI-SICHERHEITSANALYSE"}</span>
                    <span style={{ fontSize: "10px", opacity: 0.7 }}>
                      {aiSource === "claude" && "Powered by Claude AI"}
                      {aiSource === "claude-deep" && "Multi-Pass Claude AI"}
                      {aiSource === "local" && "Local Analysis"}
                      {aiSource === "local-fallback" && "Fallback (API unavailable)"}
                    </span>
                  </div>
                  <div className="box-content" style={{ whiteSpace: "pre-wrap", color: "#ddd", fontSize: "12px", lineHeight: "1.6" }}>
                    {aiAnalysis}
                  </div>
                </div>
              )}
              
              <div className="box" style={{ borderColor: "#00aaff", marginTop: "20px" }}>
                <div className="box-header" style={{ color: "#00aaff" }}>TEUFEL SHIELD SCAN COMPLETE!</div>
                <div className="box-content">
                  <p className="info-line cyan">[*] Target: {scanResult.targetUrl}</p>
                  <p className="info-line cyan">[*] Dauer: {scanResult.duration}</p>
                  <p className="info-line cyan">[*] Scan-Phasen: {scanResult.scanPhases?.length || 0}</p>
                  <p className="info-line" style={{ marginTop: "10px" }}><strong>═══ SCHWACHSTELLEN ═══</strong></p>
                  <p className="info-line">[+] Gesamte Schwachstellen: {summary.total}</p>
                  <p className="info-line red">[+] Kritisch: {summary.critical} | Hoch: {summary.high}</p>
                  <p className="info-line yellow">[+] Mittel: {summary.medium} | Niedrig: {summary.low} | Info: {summary.info}</p>
                  <p className="info-line" style={{ marginTop: "10px" }}><strong>═══ ENTDECKUNGEN ═══</strong></p>
                  <p className="info-line">[+] Admin-Panels: {scanResult.adminPanels?.length || 0}</p>
                  <p className="info-line">[+] Backup-Dateien: {scanResult.backupFiles?.length || 0}</p>
                  <p className="info-line">[+] Sensitive Dateien: {scanResult.sensitiveFiles?.length || 0}</p>
                  <p className="info-line">[+] Verzeichnisse: {scanResult.directories?.length || 0}</p>
                  <p className="info-line">[+] Links gefunden: {scanResult.linksFound?.length || 0}</p>
                  <p className="info-line">[+] Formulare gefunden: {scanResult.formsFound?.length || 0}</p>
                  <p className="info-line" style={{ marginTop: "10px" }}><strong>═══ AUFKLARUNG ═══</strong></p>
                  <p className="info-line magenta">[+] Offene Ports: {scanResult.openPorts?.length || 0}</p>
                  <p className="info-line magenta">[+] DNS-Eintrage: {scanResult.dnsRecords?.length || 0}</p>
                  <p className="info-line magenta">[+] Subdomains: {scanResult.subdomains?.length || 0}</p>
                  <p className="info-line magenta">[+] Wayback-URLs: {scanResult.waybackUrls?.length || 0}</p>
                  <p className="info-line magenta">[+] SSL-Zertifikat: {scanResult.sslCertificate ? "Analysiert" : "N/A"}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
