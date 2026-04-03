import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { authClient } from "../lib/auth-client";

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  enabled: boolean;
  rateLimitMax: number | null;
  rateLimitEnabled: boolean | null;
  remaining: number | null;
  requestCount: number | null;
  lastRefillAt: string | null;
  createdAt: string;
  [key: string]: unknown;
}

function normalizeKey(raw: Record<string, unknown>): ApiKey {
  return {
    id: String(raw.id ?? ""),
    name: raw.name != null ? String(raw.name) : null,
    start: raw.start != null ? String(raw.start) : null,
    prefix: raw.prefix != null ? String(raw.prefix) : null,
    enabled: raw.enabled !== false,
    rateLimitMax: raw.rateLimitMax != null ? Number(raw.rateLimitMax) : (raw.rate_limit_max != null ? Number(raw.rate_limit_max) : null),
    rateLimitEnabled: raw.rateLimitEnabled != null ? Boolean(raw.rateLimitEnabled) : (raw.rate_limit_enabled != null ? Boolean(raw.rate_limit_enabled) : null),
    remaining: raw.remaining != null ? Number(raw.remaining) : null,
    requestCount: raw.requestCount != null ? Number(raw.requestCount) : (raw.request_count != null ? Number(raw.request_count) : null),
    lastRefillAt: raw.lastRefillAt != null ? String(raw.lastRefillAt) : (raw.last_refill_at != null ? String(raw.last_refill_at) : null),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !session) {
      window.location.href = "/auth";
    }
  }, [session, isPending]);

  useEffect(() => {
    if (session) {
      fetchKeys();
    }
  }, [session]);

  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/keys", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const raw = Array.isArray(data) ? data : Array.isArray(data?.keys) ? data.keys : [];
        setKeys(raw.map(normalizeKey));
      }
    } catch {
      setKeys([]);
    }
  };

  const createKey = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        credentials: "include",
      });
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
    await fetch(`/api/keys/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setNewKey(null);
    await fetchKeys();
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
  const remaining = activeKey?.remaining ?? 0;
  const max = activeKey?.rateLimitMax ?? 100;
  const usagePercent = max > 0 ? (remaining / max) * 100 : 0;
  const hasKey = keys.length > 0;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-8 py-4 border-b border-[#262626]">
        <a href="/" className="text-xl font-bold tracking-tight hover:no-underline">
          pote<span className="text-emerald-500">barato</span>
        </a>
        <div className="flex items-center gap-4">
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
                onClick={() => copyKey(newKey)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm transition shrink-0"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

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
                  <span className="text-zinc-400">Uso</span>
                  <span className="text-zinc-400">
                    {remaining}/{max} requests restantes
                  </span>
                </div>
                <div className="w-full bg-[#262626] rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-600">
                  Reseta a cada 1 hora &middot; Limite: {max} requests/hora
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-zinc-400">
                {hasKey
                  ? "Sua API key está desativada."
                  : "Você ainda não tem uma API key."}
              </p>
              {!hasKey && (
                <button
                  onClick={createKey}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium transition"
                >
                  {loading ? "Criando..." : "Gerar API Key"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold">Quick Start</h2>
          <pre className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 text-sm font-mono text-zinc-300 overflow-x-auto">
{`curl -H "x-api-key: SUA_KEY" \\
  ${window.location.origin}/api/products`}
          </pre>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Dashboard />);
