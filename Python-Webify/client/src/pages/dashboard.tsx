import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  AlertTriangle, 
  Bug, 
  Globe, 
  FileText, 
  Activity,
  Target,
  Skull,
  Zap,
  Eye,
  Brain,
  Key
} from "lucide-react";

interface ScanHistory {
  id: string;
  targetUrl: string;
  timestamp: string;
  duration: string;
  vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  vulnDetails?: any[];
  openPorts?: any[];
  serverInfo?: any;
  sslCertificate?: any;
  dnsRecords?: any[];
  subdomains?: string[];
  securityHeaders?: any;
}

interface AiStatus {
  totalKeys: number;
  activeKeys: number;
  failedKeys: number;
  model: string;
  configured: boolean;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [scanHistory, setScanHistory] = useState<ScanHistory[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [stats, setStats] = useState({
    totalScans: 0,
    totalVulns: 0,
    criticalVulns: 0,
    highVulns: 0,
    sitesScanned: 0
  });

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("scanHistory") || "[]");
    setScanHistory(history);
    
    let totalVulns = 0;
    let criticalVulns = 0;
    let highVulns = 0;
    
    history.forEach((scan: ScanHistory) => {
      totalVulns += scan.vulnerabilities || 0;
      criticalVulns += scan.critical || 0;
      highVulns += scan.high || 0;
    });
    
    setStats({
      totalScans: history.length,
      totalVulns,
      criticalVulns,
      highVulns,
      sitesScanned: new Set(history.map((s: ScanHistory) => { try { return new URL(s.targetUrl).hostname; } catch { return s.targetUrl; } })).size
    });

    // Fetch AI status
    fetch("/api/ai-status").then(r => r.json()).then(setAiStatus).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-black text-green-500 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="terminal-window mb-6">
          <div className="terminal-header">
            <div className="terminal-btn btn-red"></div>
            <div className="terminal-btn btn-yellow"></div>
            <div className="terminal-btn btn-green"></div>
            <span className="terminal-title">TEUFEL SHIELD - SCANNER DASHBOARD | GAP PROTECTION</span>
          </div>
          
          <div className="terminal-body p-4">
            <pre className="text-green-400 text-xs mb-4">{`
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║    ██████╗  █████╗ ██████╗    ██████╗ ██████╗  ██████╗ ████████╗███████╗ ██████╗████████╗        ║
║   ██╔════╝ ██╔══██╗██╔══██╗   ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝       ║
║   ██║  ███╗███████║██████╔╝   ██████╔╝██████╔╝██║   ██║   ██║   █████╗  ██║        ██║          ║
║   ██║   ██║██╔══██║██╔═══╝    ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██╔══╝  ██║        ██║          ║
║   ╚██████╔╝██║  ██║██║        ██║     ██║  ██║╚██████╔╝   ██║   ███████╗╚██████╗   ██║          ║
║    ╚═════╝ ╚═╝  ╚═╝╚═╝        ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝   ╚══════╝ ╚═════╝   ╚═╝          ║
║                                                                                                   ║
║   [+] TEUFEL SHIELD - Vulnerability Intelligence Dashboard                                        ║
║   [+] Real-time Statistics | Scan History | PDF Reports | KI-Analyse                              ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
            `}</pre>

            <div className="flex gap-2 mb-6">
              <Link href="/">
                <Button variant="outline" className="bg-transparent border-green-500 text-green-500 hover:bg-green-500/20" data-testid="link-scanner">
                  <Target className="w-4 h-4 mr-2" />
                  Scanner
                </Button>
              </Link>
              <Button variant="outline" className="bg-transparent border-red-500 text-red-500 hover:bg-red-500/20" data-testid="button-clear-history" onClick={() => {
                localStorage.removeItem("scanHistory");
                setScanHistory([]);
                setStats({ totalScans: 0, totalVulns: 0, criticalVulns: 0, highVulns: 0, sitesScanned: 0 });
              }}>
                <Skull className="w-4 h-4 mr-2" />
                Clear History
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gray-900 border-green-500/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-400">Total Scans</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500" data-testid="text-total-scans">{stats.totalScans}</div>
              <p className="text-xs text-gray-500">Missions completed</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-green-500/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-400">Sites Scanned</CardTitle>
              <Globe className="h-4 w-4 text-cyan-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-500" data-testid="text-sites-scanned">{stats.sitesScanned}</div>
              <p className="text-xs text-gray-500">Unique targets</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-green-500/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-400">Total Vulnerabilities</CardTitle>
              <Bug className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500" data-testid="text-total-vulns">{stats.totalVulns}</div>
              <p className="text-xs text-gray-500">Bugs discovered</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-red-500/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-400">Critical</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500" data-testid="text-critical-vulns">{stats.criticalVulns}</div>
              <p className="text-xs text-gray-500">Severe issues</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-orange-500/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-400">High</CardTitle>
              <Zap className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500" data-testid="text-high-vulns">{stats.highVulns}</div>
              <p className="text-xs text-gray-500">High severity</p>
            </CardContent>
          </Card>
        </div>

        {/* Claude AI Status Card */}
        <Card className="bg-gray-900 border-purple-500/30 mb-6">
          <CardHeader>
            <CardTitle className="text-purple-400 flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Claude AI Engine Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiStatus ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-black/50 border border-purple-500/20 rounded p-3 text-center">
                  <Key className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                  <div className="text-lg font-bold text-purple-400">{aiStatus.totalKeys}</div>
                  <div className="text-xs text-gray-500">API Keys</div>
                </div>
                <div className="bg-black/50 border border-green-500/20 rounded p-3 text-center">
                  <div className="text-lg font-bold text-green-400">{aiStatus.activeKeys}</div>
                  <div className="text-xs text-gray-500">Active Keys</div>
                </div>
                <div className="bg-black/50 border border-red-500/20 rounded p-3 text-center">
                  <div className="text-lg font-bold text-red-400">{aiStatus.failedKeys}</div>
                  <div className="text-xs text-gray-500">Failed Keys</div>
                </div>
                <div className="bg-black/50 border border-cyan-500/20 rounded p-3 text-center">
                  <div className="text-lg font-bold text-cyan-400 text-xs">{aiStatus.model}</div>
                  <div className="text-xs text-gray-500 mt-1">Model</div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Claude AI not configured</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-green-500/30 mb-6">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              TEUFEL Shield Capabilities - Vulnerability Arsenal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { name: "SQL Injection", color: "text-red-500" },
                { name: "XSS", color: "text-orange-500" },
                { name: "LFI/RFI", color: "text-red-500" },
                { name: "Command Injection", color: "text-red-500" },
                { name: "SSRF", color: "text-purple-500" },
                { name: "XXE", color: "text-pink-500" },
                { name: "SSTI", color: "text-red-500" },
                { name: "Open Redirect", color: "text-yellow-500" },
                { name: "CORS Bypass", color: "text-cyan-500" },
                { name: "Clickjacking", color: "text-blue-500" },
                { name: "IDOR", color: "text-orange-500" },
                { name: "JWT Attacks", color: "text-green-500" },
                { name: "Path Traversal", color: "text-red-500" },
                { name: "File Upload", color: "text-red-500" },
                { name: "Subdomain Takeover", color: "text-purple-500" },
                { name: "WAF Bypass", color: "text-yellow-500" },
                { name: "Header Injection", color: "text-orange-500" },
                { name: "CRLF Injection", color: "text-pink-500" },
              ].map((vuln, idx) => (
                <div key={idx} className={`${vuln.color} bg-black/50 border border-current/30 rounded p-2 text-center text-xs`}>
                  {vuln.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-green-500/30">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Scan History - Mission Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scanHistory.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No scans yet. Start your first mission!</p>
                <Link href="/">
                  <Button className="mt-4 bg-green-600 hover:bg-green-700" data-testid="link-start-scan">
                    <Target className="w-4 h-4 mr-2" />
                    Launch Scanner
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-green-500/30">
                      <th className="text-left py-2 text-green-400">Target</th>
                      <th className="text-left py-2 text-green-400">Date</th>
                      <th className="text-left py-2 text-green-400">Duration</th>
                      <th className="text-center py-2 text-red-400">Critical</th>
                      <th className="text-center py-2 text-orange-400">High</th>
                      <th className="text-center py-2 text-yellow-400">Medium</th>
                      <th className="text-center py-2 text-green-400">Total</th>
                      <th className="text-center py-2 text-purple-400">PDF</th>
                      <th className="text-center py-2 text-orange-400">AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanHistory.slice(0, 10).map((scan, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-green-500/5">
                        <td className="py-2 text-cyan-400">{scan.targetUrl}</td>
                        <td className="py-2 text-gray-400">{new Date(scan.timestamp).toLocaleDateString()}</td>
                        <td className="py-2 text-gray-400">{scan.duration}</td>
                        <td className="py-2 text-center text-red-500">{scan.critical || 0}</td>
                        <td className="py-2 text-center text-orange-500">{scan.high || 0}</td>
                        <td className="py-2 text-center text-yellow-500">{scan.medium || 0}</td>
                        <td className="py-2 text-center text-green-500">{scan.vulnerabilities || 0}</td>
                        <td className="py-2 text-center">
                          <button
                            className="text-purple-400 hover:text-purple-300 text-xs border border-purple-500/30 px-2 py-1 rounded hover:bg-purple-500/10"
                            onClick={async () => {
                              try {
                                const resp = await fetch("/api/generate-pdf", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    targetUrl: scan.targetUrl,
                                    timestamp: scan.timestamp,
                                    duration: scan.duration,
                                    vulnerabilities: scan.vulnDetails || [],
                                    openPorts: scan.openPorts || [],
                                    serverInfo: scan.serverInfo || {},
                                    sslCertificate: scan.sslCertificate || {},
                                    dnsRecords: scan.dnsRecords || [],
                                    subdomains: scan.subdomains || [],
                                    securityHeaders: scan.securityHeaders || {},
                                    summary: { total: scan.vulnerabilities || 0, critical: scan.critical || 0, high: scan.high || 0, medium: scan.medium || 0, low: scan.low || 0 },
                                    language: "de",
                                  }),
                                });
                                if (resp.ok) {
                                  const blob = await resp.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `TEUFEL-Shield-${scan.targetUrl.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  a.remove();
                                  toast({ title: "PDF", description: "PDF-Bericht wurde heruntergeladen" });
                                } else {
                                  toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht erstellt werden" });
                                }
                              } catch (e: any) {
                                toast({ variant: "destructive", title: "Fehler", description: e.message || "PDF-Erstellung fehlgeschlagen" });
                              }
                            }}
                          >
                            <FileText className="w-3 h-3 inline mr-1" />
                            PDF
                          </button>
                        </td>
                        <td className="py-2 text-center">
                          <button
                            className="text-orange-400 hover:text-orange-300 text-xs border border-orange-500/30 px-2 py-1 rounded hover:bg-orange-500/10"
                            onClick={async () => {
                              try {
                                toast({ title: "Claude AI", description: "Analyse wird gestartet..." });
                                const resp = await fetch("/api/ai-analyze", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    scanResult: {
                                      targetUrl: scan.targetUrl,
                                      vulnerabilities: scan.vulnDetails || [],
                                      openPorts: scan.openPorts || [],
                                      serverInfo: scan.serverInfo || {},
                                      sslCertificate: scan.sslCertificate || {},
                                      dnsRecords: scan.dnsRecords || [],
                                      subdomains: scan.subdomains || [],
                                      securityHeaders: scan.securityHeaders || {},
                                      summary: { total: scan.vulnerabilities || 0, critical: scan.critical || 0, high: scan.high || 0, medium: scan.medium || 0, low: scan.low || 0 },
                                    },
                                    language: "de",
                                  }),
                                });
                                if (resp.ok) {
                                  const data = await resp.json();
                                  const blob = new Blob([data.analysis], { type: "text/plain" });
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `AI-Analysis-${scan.targetUrl.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.txt`;
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  a.remove();
                                  const srcLabel = data.source === "claude" ? "Claude AI" : "Local";
                                  toast({ title: "Claude AI", description: `Analyse via ${srcLabel} abgeschlossen` });
                                }
                              } catch {
                                toast({ variant: "destructive", title: "Fehler", description: "AI Analyse fehlgeschlagen" });
                              }
                            }}
                          >
                            <Brain className="w-3 h-3 inline mr-1" />
                            AI
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-gray-600 text-xs">
          <p>[*] TEUFEL SHIELD v3.0 | GAP PROTECTION - Professional Cybersecurity</p>
          <p>gap-protection.pro - Enterprise Vulnerability Assessment Platform</p>
        </div>
      </div>

      <style>{`
        .terminal-window {
          background: #0a0a0a;
          border: 1px solid #00ff00;
          border-radius: 8px;
          overflow: hidden;
        }
        .terminal-header {
          background: #1a1a1a;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #333;
        }
        .terminal-btn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        .btn-red { background: #ff5f56; }
        .btn-yellow { background: #ffbd2e; }
        .btn-green { background: #27ca40; }
        .terminal-title {
          color: #00ff00;
          font-family: monospace;
          margin-left: 8px;
        }
        .terminal-body {
          background: #000;
          padding: 15px;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}
