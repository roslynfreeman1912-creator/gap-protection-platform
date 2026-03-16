import { useState, useEffect, useRef } from "react";
import { Shield, Globe, Search, AlertTriangle, CheckCircle, Download, Play, Loader2, Server, Bug, Link, Radio, ChevronDown, ChevronUp } from "lucide-react";

interface ReconicScan {
  id: string;
  target: string;
  status: "running" | "completed" | "error";
  startTime: string;
  endTime?: string;
  results?: ReconicResults;
  error?: string;
  logs: string[];
}

interface ReconicResults {
  target: string;
  scan_date: string;
  tools_used: Record<string, boolean>;
  subdomains: string[];
  alive_hosts: Array<{ url?: string; host?: string; status_code?: number; title?: string; tech?: string[] }>;
  endpoints: string[];
  takeovers: Array<{ subdomain: string; cname: string; service: string }>;
  nuclei_findings?: Array<{ info?: { name?: string; severity?: string; description?: string }; host?: string; matched_at?: string; template?: string }>;
  nuclei_results?: string;
}

interface ToolStatus {
  subfinder: boolean;
  httpx: boolean;
  katana: boolean;
  nuclei: boolean;
  amass: boolean;
  python3: boolean;
  reconic: boolean;
}

export default function Reconic() {
  const [target, setTarget] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [currentScan, setCurrentScan] = useState<ReconicScan | null>(null);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "subdomains" | "hosts" | "endpoints" | "takeovers" | "nuclei">("overview");
  const [options, setOptions] = useState({
    subfinder: true,
    amass: false,
    katana: true,
    nuclei: true,
    httpx: true,
    takeover: true,
    depth: 3,
    timeout: 20,
  });
  const [showOptions, setShowOptions] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTools();
    fetchHistory();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchTools = async () => {
    try {
      const res = await fetch("/api/reconic/tools");
      const data = await res.json();
      setTools(data.tools);
    } catch (e) {
      console.error("Failed to fetch tools:", e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/reconic/scans");
      const data = await res.json();
      setScanHistory(data.scans || []);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  };

  const startScan = async () => {
    if (!target.trim()) return;
    setIsScanning(true);
    setLogs([]);
    setCurrentScan(null);
    setActiveTab("overview");

    try {
      const res = await fetch("/api/reconic/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim(), options }),
      });
      const data = await res.json();

      if (data.scanId) {
        // Connect to SSE stream
        const evtSource = new EventSource(`/api/reconic/scan/${data.scanId}/stream`);

        evtSource.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "log") {
              setLogs((prev) => [...prev, msg.message]);
            } else if (msg.type === "complete") {
              setIsScanning(false);
              if (msg.results) {
                setCurrentScan({
                  id: data.scanId,
                  target: target,
                  status: msg.status,
                  startTime: new Date().toISOString(),
                  results: msg.results,
                  logs: [],
                });
              }
              evtSource.close();
              fetchHistory();
            }
          } catch {}
        };

        evtSource.onerror = () => {
          // Poll fallback
          evtSource.close();
          pollScanResults(data.scanId);
        };
      }
    } catch (error) {
      setIsScanning(false);
      console.error("Scan failed:", error);
    }
  };

  const pollScanResults = async (scanId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/reconic/scan/${scanId}`);
        const data = await res.json();
        if (data.status === "running") {
          setLogs(data.logs || []);
          setTimeout(poll, 2000);
        } else {
          setIsScanning(false);
          setCurrentScan(data);
          setLogs(data.logs || []);
          fetchHistory();
        }
      } catch {
        setIsScanning(false);
      }
    };
    poll();
  };

  const downloadReport = async (scanId: string) => {
    try {
      const res = await fetch("/api/reconic/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GAP-Reconic-Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const loadScan = async (scanId: string) => {
    try {
      const res = await fetch(`/api/reconic/scan/${scanId}`);
      const data = await res.json();
      setCurrentScan(data);
      setLogs(data.logs || []);
      setActiveTab("overview");
    } catch {}
  };

  const r = currentScan?.results;

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      {/* Header */}
      <div className="border-b border-cyan-500/20 bg-[#0D1220]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                GAP RECONIC
              </h1>
              <p className="text-xs text-gray-500">Automated Reconnaissance Framework</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tools && (
              <div className="flex gap-1">
                {Object.entries(tools).map(([name, available]) => (
                  <span
                    key={name}
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      available ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Scan Input */}
        <div className="bg-[#111827] border border-cyan-500/20 rounded-xl p-6 mb-6">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-1 block">Target Domain</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500/50" />
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isScanning && startScan()}
                  placeholder="example.com"
                  className="w-full bg-[#0A0E1A] border border-cyan-500/20 rounded-lg py-3 pl-11 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                  disabled={isScanning}
                />
              </div>
            </div>
            <button
              onClick={startScan}
              disabled={isScanning || !target.trim()}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-lg flex items-center gap-2 transition-all"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Start Recon
                </>
              )}
            </button>
          </div>

          {/* Scan Options */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="mt-3 text-sm text-gray-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
          >
            {showOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Scan Options
          </button>

          {showOptions && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "subfinder", label: "Subfinder", desc: "Subdomain enumeration" },
                { key: "amass", label: "Amass", desc: "Deep enumeration (slow)" },
                { key: "httpx", label: "httpx", desc: "Alive host probe" },
                { key: "katana", label: "Katana", desc: "Endpoint crawling" },
                { key: "nuclei", label: "Nuclei", desc: "Vulnerability scan" },
                { key: "takeover", label: "Takeover", desc: "Subdomain takeover" },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center gap-2 bg-[#0A0E1A] border border-cyan-500/10 rounded-lg p-3 cursor-pointer hover:border-cyan-500/30 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={(options as any)[opt.key]}
                    onChange={(e) => setOptions({ ...options, [opt.key]: e.target.checked })}
                    className="accent-cyan-500"
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-gray-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Live Logs */}
        {(isScanning || logs.length > 0) && (
          <div className="bg-[#111827] border border-cyan-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                <Radio className="w-4 h-4" />
                {isScanning ? "Live Scan Output" : "Scan Logs"}
              </h3>
              {isScanning && <span className="text-xs text-green-400 animate-pulse">● Running</span>}
            </div>
            <div className="bg-black/50 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs text-green-400/80 space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className={`${log.includes("✓") ? "text-green-400" : log.includes("⚠") || log.includes("ERROR") ? "text-red-400" : log.includes("[*]") ? "text-cyan-400" : ""}`}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Results */}
        {currentScan?.results && (
          <div className="space-y-6">
            {/* Result Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {[
                { id: "overview", label: "Overview", icon: Shield, count: null },
                { id: "subdomains", label: "Subdomains", icon: Globe, count: r?.subdomains?.length || 0 },
                { id: "hosts", label: "Alive Hosts", icon: Server, count: r?.alive_hosts?.length || 0 },
                { id: "endpoints", label: "Endpoints", icon: Link, count: r?.endpoints?.length || 0 },
                { id: "takeovers", label: "Takeovers", icon: AlertTriangle, count: r?.takeovers?.length || 0 },
                { id: "nuclei", label: "Nuclei", icon: Bug, count: r?.nuclei_findings?.length || 0 },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "bg-[#111827] text-gray-400 border border-transparent hover:text-white"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count !== null && tab.count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      tab.id === "takeovers" && tab.count > 0 ? "bg-red-500/30 text-red-400" : "bg-cyan-500/20 text-cyan-300"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
              
              {/* Download Report */}
              <button
                onClick={() => downloadReport(currentScan.id)}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg text-sm font-medium transition-all"
              >
                <Download className="w-4 h-4" />
                PDF Report
              </button>
            </div>

            {/* Tab Content */}
            <div className="bg-[#111827] border border-cyan-500/20 rounded-xl p-6">
              {activeTab === "overview" && r && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard label="Subdomains" value={r.subdomains?.length || 0} icon={Globe} color="cyan" />
                    <SummaryCard label="Alive Hosts" value={r.alive_hosts?.length || 0} icon={Server} color="green" />
                    <SummaryCard label="Endpoints" value={r.endpoints?.length || 0} icon={Link} color="yellow" />
                    <SummaryCard label="Takeovers" value={r.takeovers?.length || 0} icon={AlertTriangle} color={r.takeovers?.length > 0 ? "red" : "green"} />
                  </div>

                  {/* Tools Used */}
                  {r.tools_used && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-400 mb-3">Tools Used</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(r.tools_used).map(([tool, used]) => (
                          <span
                            key={tool}
                            className={`text-xs px-3 py-1 rounded-full flex items-center gap-1 ${
                              used ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-gray-500/10 text-gray-500 border border-gray-500/20"
                            }`}
                          >
                            {used ? <CheckCircle className="w-3 h-3" /> : null}
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "subdomains" && r && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Discovered Subdomains ({r.subdomains?.length || 0})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto">
                    {r.subdomains?.map((sub, i) => (
                      <div key={i} className="bg-[#0A0E1A] rounded px-3 py-2 text-sm font-mono text-cyan-300 hover:bg-cyan-500/10 transition-colors">
                        {sub}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "hosts" && r && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Alive Hosts ({r.alive_hosts?.length || 0})
                  </h3>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {r.alive_hosts?.map((host, i) => (
                      <div key={i} className="bg-[#0A0E1A] rounded-lg p-3 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-cyan-300 truncate">{host.url || host.host}</div>
                          {host.title && <div className="text-xs text-gray-500 truncate">{host.title}</div>}
                        </div>
                        {host.status_code && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            host.status_code < 300 ? "bg-green-500/20 text-green-400" :
                            host.status_code < 400 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>
                            {host.status_code}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "endpoints" && r && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Discovered Endpoints ({r.endpoints?.length || 0})
                  </h3>
                  <div className="space-y-1 max-h-[500px] overflow-y-auto font-mono text-xs">
                    {r.endpoints?.map((ep, i) => (
                      <div key={i} className="bg-[#0A0E1A] rounded px-3 py-1.5 text-gray-300 hover:bg-cyan-500/10 truncate transition-colors">
                        {ep}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "takeovers" && r && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    Subdomain Takeover Vulnerabilities ({r.takeovers?.length || 0})
                  </h3>
                  {r.takeovers?.length ? (
                    <div className="space-y-3">
                      {r.takeovers.map((t, i) => (
                        <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                          <div className="font-mono text-sm text-red-400 font-bold">{t.subdomain}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            CNAME: <span className="text-white">{t.cname}</span> | Service: <span className="text-yellow-400">{t.service}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500/40" />
                      <p>No subdomain takeover vulnerabilities detected</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "nuclei" && r && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Bug className="w-5 h-5 text-yellow-400" />
                    Nuclei Findings ({r.nuclei_findings?.length || 0})
                  </h3>
                  {r.nuclei_findings?.length ? (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {r.nuclei_findings.map((f, i) => {
                        const severity = f.info?.severity || "unknown";
                        const sevColors: Record<string, string> = {
                          critical: "border-red-500/40 bg-red-500/5",
                          high: "border-orange-500/40 bg-orange-500/5",
                          medium: "border-yellow-500/40 bg-yellow-500/5",
                          low: "border-blue-500/40 bg-blue-500/5",
                          info: "border-gray-500/40 bg-gray-500/5",
                        };
                        const sevBadge: Record<string, string> = {
                          critical: "bg-red-500 text-white",
                          high: "bg-orange-500 text-white",
                          medium: "bg-yellow-500 text-black",
                          low: "bg-blue-500 text-white",
                          info: "bg-gray-500 text-white",
                        };
                        return (
                          <div key={i} className={`border rounded-lg p-3 ${sevColors[severity] || sevColors.info}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${sevBadge[severity] || sevBadge.info}`}>
                                {severity}
                              </span>
                              <span className="text-sm font-medium">{f.info?.name || f.template || "Unknown"}</span>
                            </div>
                            {(f.host || f.matched_at) && (
                              <div className="text-xs text-gray-400 font-mono">{f.matched_at || f.host}</div>
                            )}
                            {f.info?.description && (
                              <div className="text-xs text-gray-500 mt-1">{f.info.description}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500/40" />
                      <p>No vulnerabilities detected by Nuclei</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scan History */}
        {scanHistory.length > 0 && (
          <div className="mt-6 bg-[#111827] border border-cyan-500/20 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              Scan History
            </h3>
            <div className="space-y-2">
              {scanHistory.map((scan) => (
                <div
                  key={scan.id}
                  onClick={() => loadScan(scan.id)}
                  className="bg-[#0A0E1A] rounded-lg p-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-cyan-500/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-cyan-300 truncate">{scan.target}</div>
                    <div className="text-xs text-gray-500">{new Date(scan.startTime).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{scan.subdomainCount} subs</span>
                    <span>{scan.aliveHostCount} alive</span>
                    <span>{scan.endpointCount} eps</span>
                    {scan.takeoverCount > 0 && <span className="text-red-400">{scan.takeoverCount} takeovers!</span>}
                    <span className={`px-2 py-0.5 rounded ${
                      scan.status === "completed" ? "bg-green-500/20 text-green-400" :
                      scan.status === "running" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>
                      {scan.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  const colors: Record<string, string> = {
    cyan: "from-cyan-500/10 to-blue-500/10 border-cyan-500/20",
    green: "from-green-500/10 to-emerald-500/10 border-green-500/20",
    yellow: "from-yellow-500/10 to-orange-500/10 border-yellow-500/20",
    red: "from-red-500/10 to-pink-500/10 border-red-500/20",
  };
  const textColors: Record<string, string> = {
    cyan: "text-cyan-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-4`}>
      <div className="flex items-center justify-between">
        <Icon className={`w-5 h-5 ${textColors[color]}`} />
        <span className={`text-3xl font-bold ${textColors[color]}`}>{value}</span>
      </div>
      <div className="text-xs text-gray-400 mt-2">{label}</div>
    </div>
  );
}
