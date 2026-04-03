import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { authClient } from "../lib/auth-client";

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        await authClient.signIn.email(
          { email, password },
          {
            onSuccess: () => {
              window.location.href = "/dashboard";
            },
            onError: (ctx) => {
              setError(ctx.error.message ?? "Erro ao entrar");
            },
          }
        );
      } else {
        await authClient.signUp.email(
          { email, password, name },
          {
            onSuccess: () => {
              window.location.href = "/dashboard";
            },
            onError: (ctx) => {
              setError(ctx.error.message ?? "Erro ao criar conta");
            },
          }
        );
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <a href="/" className="text-2xl font-bold tracking-tight hover:no-underline">
            pote<span className="text-emerald-500">barato</span>
          </a>
          <p className="text-zinc-400 mt-2">
            {isLogin ? "Entre na sua conta" : "Crie sua conta grátis"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-4"
        >
          {!isLogin && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition"
                placeholder="Seu nome"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition"
          >
            {loading ? "Carregando..." : isLogin ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-400">
          {isLogin ? "Não tem conta? " : "Já tem conta? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="text-emerald-500 hover:underline"
          >
            {isLogin ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<AuthPage />);
