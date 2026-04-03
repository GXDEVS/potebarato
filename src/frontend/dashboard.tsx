import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { authClient } from "../lib/auth-client";

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  enabled: boolean;
  createdAt: string;
}

interface Usage {
  used: number;
  max: number;
  remaining: number;
}

interface ScrapeStatus {
  total_products: number;
  last_update: string | null;
}

const CRON_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getNextCronRun(lastUpdate: string | null): string {
  if (!lastUpdate) return "Aguardando primeiro scraping";
  const last = new Date(lastUpdate);
  const next = new Date(last.getTime() + CRON_INTERVAL_MS);
  const now = new Date();
  if (next <= now) return "Em breve";
  const diff = next.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `em ${h}h ${m}min`;
}

function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Admin state
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");

  const isAdmin = (session?.user as any)?.role === "admin";

  useEffect(() => {
    if (!isPending && !session) {
      window.location.href = "/auth";
    }
  }, [session, isPending]);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data?.keys) ? data.keys : []);
      }
    } catch {
      setKeys([]);
    }
  }, []);

  const fetchScrapeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scrape/status", { credentials: "include" });
      if (res.ok) {
        setScrapeStatus(await res.json());
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (session) {
      fetchKeys();
      if (isAdmin) fetchScrapeStatus();
    }
  }, [session, fetchKeys, fetchScrapeStatus, isAdmin]);

  // Poll scrape status every 30s for admin
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(fetchScrapeStatus, 30_000);
    return () => clearInterval(interval);
  }, [isAdmin, fetchScrapeStatus]);

  // WebSocket for real-time usage
  useEffect(() => {
    if (!session?.user?.id || keys.length === 0) {
      setUsage(null);
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/usage/${session.user.id}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "usage") {
          setUsage({ used: data.used, max: data.max, remaining: data.remaining });
        }
      } catch {}
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [session, keys]);

  const createKey = async () => {
    if (loading || keys.length > 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/keys", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setNewKey(data.key);
        await fetchKeys();
      } else {
        setError(data.error ?? "Erro ao criar API key");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (id: string) => {
    await fetch(`/api/keys/${id}`, { method: "DELETE", credentials: "include" });
    setNewKey(null);
    setUsage(null);
    await fetchKeys();
  };

  const triggerScrape = async () => {
    setScraping(true);
    setScrapeMsg("");
    try {
      const res = await fetch("/api/scrape", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setScrapeMsg(`Scraping iniciado (PID: ${data.pid})`);
        // Refresh status after a delay
        setTimeout(fetchScrapeStatus, 5000);
      } else {
        setScrapeMsg(data.error ?? "Erro ao iniciar scraping");
      }
    } catch {
      setScrapeMsg("Erro de conexão");
    } finally {
      setScraping(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const logout = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        Carregando...
      </div>
    );
  }

  const activeKey = keys.find((k) => k.enabled);
  const used = usage?.used ?? 0;
  const max = usage?.max ?? 100;
  const remaining = usage?.remaining ?? max;
  const usagePercent = max > 0 ? (used / max) * 100 : 0;
  const blocked = remaining <= 0 && activeKey != null;

  const curlCommand = `curl -H "x-api-key: SUA_KEY" \\\n  ${window.location.origin}/api/products`;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-8 py-4 border-b border-[#262626]">
        <a href="/" className="text-xl font-bold tracking-tight hover:no-underline">
          pote<span className="text-emerald-500">barato</span>
        </a>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <span className="text-xs bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded">
              Admin
            </span>
          )}
          <span className="text-sm text-zinc-400">{session?.user?.name}</span>
          <button
            onClick={logout}
            className="text-sm text-zinc-500 hover:text-white transition"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* Admin: Scraping Panel */}
        {isAdmin && (
          <div className="bg-[#141414] border border-emerald-900 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Scraping
                <span className="text-xs bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded">
                  Admin
                </span>
              </h2>
              <button
                onClick={triggerScrape}
                disabled={scraping}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {scraping ? "Iniciando..." : "Iniciar Scraping"}
              </button>
            </div>

            {scrapeMsg && (
              <p className={`text-sm ${scrapeMsg.includes("Erro") ? "text-red-400" : "text-emerald-400"}`}>
                {scrapeMsg}
              </p>
            )}

            {scrapeStatus && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-emerald-500">
                    {scrapeStatus.total_products}
                  </div>
                  <div className="text-xs text-zinc-500">Produtos</div>
                </div>
                <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 text-center">
                  <div className="text-sm font-medium text-zinc-300">
                    {scrapeStatus.last_update
                      ? new Date(scrapeStatus.last_update).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Nunca"}
                  </div>
                  <div className="text-xs text-zinc-500">Última atualização</div>
                </div>
                <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 text-center">
                  <div className="text-sm font-medium text-zinc-300">
                    {getNextCronRun(scrapeStatus.last_update)}
                  </div>
                  <div className="text-xs text-zinc-500">Próximo cron</div>
                </div>
              </div>
            )}
          </div>
        )}

        {newKey && (
          <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-4 space-y-2">
            <p className="text-sm text-emerald-400 font-medium">
              Sua API key foi criada! Copie agora — ela não será exibida novamente.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#0a0a0a] px-4 py-2 rounded-lg text-sm font-mono text-white break-all">
                {newKey}
              </code>
              <button
                onClick={() => copyToClipboard(newKey, "newkey")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm transition shrink-0"
              >
                {copied === "newkey" ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {blocked && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-400 font-medium">
              Limite atingido — sua API está bloqueada até o próximo reset (1 hora).
            </p>
          </div>
        )}

        {/* API Key Card */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">API Key</h2>
            <a href="/docs" className="text-sm text-emerald-500 hover:underline">
              Ver docs
            </a>
          </div>

          {activeKey ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono text-zinc-400">
                  {activeKey.start
                    ? `${activeKey.start}${"•".repeat(20)}`
                    : activeKey.prefix
                    ? `${activeKey.prefix}_${"•".repeat(20)}`
                    : "•".repeat(30)}
                </code>
                <button
                  onClick={() => revokeKey(activeKey.id)}
                  className="text-sm text-red-400 hover:text-red-300 transition"
                >
                  Revogar
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Uso nesta hora</span>
                  <span className={blocked ? "text-red-400 font-medium" : "text-zinc-400"}>
                    {used}/{max} requests usados
                  </span>
                </div>
                <div className="w-full bg-[#262626] rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${blocked ? "bg-red-500" : usagePercent > 80 ? "bg-yellow-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-600">
                  <span>{remaining} restantes</span>
                  <span>Reseta a cada 1 hora</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-zinc-400">Você ainda não tem uma API key.</p>
              <button
                onClick={createKey}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium transition"
              >
                {loading ? "Criando..." : "Gerar API Key"}
              </button>
            </div>
          )}
        </div>

        {/* Quick Start */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Quick Start</h2>
            <button
              onClick={() => copyToClipboard(curlCommand, "curl")}
              className="text-sm bg-[#262626] hover:bg-[#333] text-zinc-300 px-3 py-1.5 rounded-lg transition"
            >
              {copied === "curl" ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <pre className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 text-sm font-mono text-zinc-300 overflow-x-auto">
{curlCommand}
          </pre>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Dashboard />);
