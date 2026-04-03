import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function Landing() {
  const [stats, setStats] = useState<{
    total_products: number;
    last_update: string | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/scrape/status")
      .then((r) => r.json() as Promise<{ total_products: number; last_update: string | null }>)
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#262626]">
        <span className="text-xl font-bold tracking-tight">
          pote<span className="text-emerald-500">barato</span>
        </span>
        <div className="flex gap-4 items-center">
          <a href="/docs" className="text-sm text-zinc-400 hover:text-white transition">
            Docs
          </a>
          <a
            href="/auth"
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition"
          >
            Entrar
          </a>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold tracking-tight">
            Compare preços de{" "}
            <span className="text-emerald-500">creatina</span>
          </h1>
          <p className="text-lg text-zinc-400">
            API em tempo real com preços de creatina das maiores lojas de
            suplementos do Brasil. Dados atualizados a cada 6 horas.
          </p>

          {stats && (
            <div className="flex gap-6 justify-center pt-4">
              <div className="bg-[#141414] border border-[#262626] rounded-xl px-6 py-4">
                <div className="text-2xl font-bold text-emerald-500">
                  {stats.total_products}
                </div>
                <div className="text-sm text-zinc-400">Produtos</div>
              </div>
              <div className="bg-[#141414] border border-[#262626] rounded-xl px-6 py-4">
                <div className="text-2xl font-bold text-emerald-500">3</div>
                <div className="text-sm text-zinc-400">Marcas</div>
              </div>
              <div className="bg-[#141414] border border-[#262626] rounded-xl px-6 py-4">
                <div className="text-2xl font-bold text-emerald-500">6h</div>
                <div className="text-sm text-zinc-400">Atualização</div>
              </div>
            </div>
          )}

          <div className="flex gap-4 justify-center pt-4">
            <a
              href="/auth"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-medium text-lg transition"
            >
              Começar grátis
            </a>
            <a
              href="/docs"
              className="border border-[#262626] hover:border-zinc-600 text-zinc-300 px-8 py-3 rounded-xl font-medium text-lg transition"
            >
              Ver documentação
            </a>
          </div>
        </div>
      </main>

      <footer className="text-center py-6 text-sm text-zinc-600 border-t border-[#262626]">
        potebarato &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Landing />);
