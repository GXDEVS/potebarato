import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";

interface PricePoint {
  totalPrice: string;
  pricePerGram: string;
  scrapedAt: string;
}

function PriceHistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/landing/products/${product.id}/history`)
      .then((r) => r.json())
      .then((data: PricePoint[]) => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [product.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const prices = history.map((h) => parseFloat(h.totalPrice));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const currentPrice = parseFloat(product.totalPrice);

  // SVG chart
  const W = 400;
  const H = 160;
  const PAD = 30;

  const points = history.length > 1
    ? history.map((h, i) => {
        const x = PAD + ((W - PAD * 2) / (history.length - 1)) * i;
        const range = maxP - minP || 1;
        const y = H - PAD - ((parseFloat(h.totalPrice) - minP) / range) * (H - PAD * 2);
        return { x, y, price: parseFloat(h.totalPrice), date: h.scrapedAt };
      }).reverse()
    : [];

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#141414] border border-[#262626] rounded-2xl max-w-lg w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{product.brand}</div>
            <h3 className="text-base font-bold text-white line-clamp-1">{product.productName}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition text-xl" aria-label="Fechar">
            &times;
          </button>
        </div>

        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Atual: </span>
            <span className="text-white font-bold">R$ {currentPrice.toFixed(2)}</span>
          </div>
          {prices.length > 1 && (
            <>
              <div>
                <span className="text-zinc-500">Min: </span>
                <span className="text-emerald-400 font-medium">R$ {minP.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Max: </span>
                <span className="text-red-400 font-medium">R$ {maxP.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">Carregando histórico...</div>
        ) : history.length <= 1 ? (
          <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">
            Histórico de preços disponível após o próximo scraping
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = PAD + (H - PAD * 2) * (1 - pct);
              const price = minP + (maxP - minP) * pct;
              return (
                <g key={pct}>
                  <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#262626" strokeWidth="1" />
                  <text x={PAD - 4} y={y + 3} fill="#71717a" fontSize="9" textAnchor="end">
                    {price.toFixed(0)}
                  </text>
                </g>
              );
            })}
            {/* Line */}
            <polyline points={polyline} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
            {/* Dots */}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="3" fill="#10b981" stroke="#141414" strokeWidth="1.5" />
            ))}
            {/* Date labels */}
            {points.filter((_, i) => i === 0 || i === points.length - 1).map((p, i) => (
              <text key={i} x={p.x} y={H - 8} fill="#71717a" fontSize="8" textAnchor="middle">
                {new Date(p.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </text>
            ))}
          </svg>
        )}

        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 rounded-lg transition"
        >
          Ver na loja
        </a>
      </div>
    </div>
  );
}

interface Product {
  id: string;
  brand: string;
  productName: string;
  totalPrice: string;
  weightGrams: number;
  pricePerGram: string;
  inStock: boolean;
  url: string;
  imageUrl: string | null;
  previousPrice: string | null;
}

function getPriceDrop(product: Product): number | null {
  if (!product.previousPrice) return null;
  const prev = parseFloat(product.previousPrice);
  const curr = parseFloat(product.totalPrice);
  if (prev <= 0 || prev === curr) return null;
  return Math.round(((prev - curr) / prev) * 100);
}

type SortKey = "price" | "pricePerGram" | "weight";

function ComparePanel({
  products,
  onClose,
  onRemove,
}: {
  products: Product[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const minPrice = Math.min(...products.map((p) => parseFloat(p.totalPrice)));
  const minPpg = Math.min(...products.map((p) => parseFloat(p.pricePerGram)));
  const maxWeight = Math.max(...products.map((p) => p.weightGrams));

  return (
    <div className="mb-10 bg-[#141414] border border-emerald-500/20 rounded-2xl p-6 animate-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Comparativo</h3>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition text-sm"
        >
          Fechar
        </button>
      </div>
      <div className={`grid gap-4 ${
        products.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
        products.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
        products.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      }`}>
        {products.map((p) => {
          const price = parseFloat(p.totalPrice);
          const ppg = parseFloat(p.pricePerGram);
          const isMinPrice = price === minPrice;
          const isMinPpg = ppg === minPpg;
          const isMaxWeight = p.weightGrams === maxWeight;
          return (
            <div key={p.id} className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-5 relative">
              <button
                onClick={() => onRemove(p.id)}
                className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-zinc-600 hover:text-white hover:bg-[#262626] transition text-xs"
              >
                x
              </button>
              <div className="w-full h-24 bg-white rounded-lg flex items-center justify-center mb-4">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.productName} className="h-full w-full object-contain p-2 rounded-lg" loading="lazy" />
                ) : (
                  <span className="text-zinc-400 text-xs">Sem imagem</span>
                )}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{p.brand}</div>
              <div className="text-sm text-zinc-200 mt-1 line-clamp-2 leading-snug font-medium">{p.productName}</div>
              <div className="mt-4 space-y-2.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Preço</span>
                  <span className={`font-bold ${isMinPrice ? "text-emerald-400" : "text-white"}`}>
                    R$ {price.toFixed(2)}
                    {isMinPrice && products.length > 1 && <span className="ml-1.5 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">menor</span>}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Peso</span>
                  <span className={`font-medium ${isMaxWeight ? "text-emerald-400" : "text-white"}`}>
                    {p.weightGrams}g
                    {isMaxWeight && products.length > 1 && <span className="ml-1.5 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">maior</span>}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Custo/g</span>
                  <span className={`font-bold ${isMinPpg ? "text-emerald-400" : "text-white"}`}>
                    R$ {ppg.toFixed(4)}
                    {isMinPpg && products.length > 1 && <span className="ml-1.5 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">melhor</span>}
                  </span>
                </div>
              </div>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block text-center text-xs font-medium text-emerald-400 hover:text-emerald-300 transition py-2 border border-[#262626] rounded-lg hover:border-emerald-500/30"
              >
                Ver na loja
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HighlightCard({
  product,
  badgeLabel,
  badgeColor,
  badgeBg,
  borderColor,
  priceColor,
  priceLabel,
  priceSublabel,
  btnColor,
  btnHover,
}: {
  product: Product;
  badgeLabel: string;
  badgeColor: string;
  badgeBg: string;
  borderColor: string;
  priceColor: string;
  priceLabel: string;
  priceSublabel: string;
  btnColor: string;
  btnHover: string;
}) {
  const price = parseFloat(product.totalPrice);
  const ppg = parseFloat(product.pricePerGram);
  const priceDisplay = priceLabel
    .replace("{price}", price.toFixed(2))
    .replace("{ppg}", ppg.toFixed(4));
  const subDisplay = priceSublabel
    .replace("{price}", price.toFixed(2))
    .replace("{ppg}", ppg.toFixed(4))
    .replace("{weight}", String(product.weightGrams));

  return (
    <div
      style={{ borderColor, background: "#141414" }}
      className="group rounded-xl border-2 overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      <div style={{ display: "flex", padding: 12, gap: 12 }}>
        {/* Image — fixed size, always square, white bg */}
        <div
          style={{
            width: 90,
            minWidth: 90,
            height: 100,
            background: "#ffffff",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.productName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 6,
              }}
              loading="lazy"
            />
          ) : (
            <span style={{ color: "#71717a", fontSize: 10 }}>Sem imagem</span>
          )}
        </div>

        {/* Right side */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badge + brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <span
              style={{
                color: badgeColor,
                backgroundColor: badgeBg,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "2px 8px",
                borderRadius: 999,
                display: "inline-block",
              }}
            >
              {badgeLabel}
            </span>
            <span
              style={{
                color: "#71717a",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {product.brand}
            </span>
          </div>

          {/* Product name */}
          <div
            style={{
              fontSize: 13,
              color: "#d4d4d8",
              fontWeight: 500,
              lineHeight: 1.3,
              marginBottom: 6,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.productName}
          </div>

          {/* Price */}
          <div style={{ fontSize: 18, fontWeight: 700, color: priceColor }}>
            {priceDisplay}
          </div>
          <div style={{ fontSize: 11, color: "#71717a", marginTop: 1 }}>
            {subDisplay}
          </div>
        </div>
      </div>

      {/* Button row */}
      <div style={{ padding: "0 12px 12px" }}>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: btnColor,
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 8,
            padding: "10px 16px",
            textDecoration: "none",
            width: "100%",
            transition: "background 0.15s",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = btnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = btnColor)}
        >
          Ver na loja
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5" />
            <path d="M21 3v5.25" />
            <path d="M14 10l7-7" />
            <path d="M14 3h7v7" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function PriceComparator({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [stockOnly, setStockOnly] = useState(false);
  const [dealsOnly, setDealsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("pricePerGram");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [compareLimitHit, setCompareLimitHit] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    let list = [...products];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }
    if (brandFilter !== "all") {
      list = list.filter((p) => p.brand === brandFilter);
    }
    if (stockOnly) {
      list = list.filter((p) => p.inStock);
    }
    if (dealsOnly) {
      list = list.filter((p) => { const d = getPriceDrop(p); return d !== null && d > 0; });
    }
    list.sort((a, b) => {
      if (sortBy === "price") return parseFloat(a.totalPrice) - parseFloat(b.totalPrice);
      if (sortBy === "pricePerGram") return parseFloat(a.pricePerGram) - parseFloat(b.pricePerGram);
      return b.weightGrams - a.weightGrams;
    });
    return list;
  }, [products, debouncedSearch, brandFilter, stockOnly, dealsOnly, sortBy]);

  const bestByPrice = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.reduce((best, p) =>
      parseFloat(p.totalPrice) < parseFloat(best.totalPrice) ? p : best
    );
  }, [filtered]);

  const bestByValue = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.reduce((best, p) =>
      parseFloat(p.pricePerGram) < parseFloat(best.pricePerGram) ? p : best
    );
  }, [filtered]);

  const comparing = useMemo(
    () => products.filter((p) => compareIds.has(p.id)),
    [products, compareIds]
  );

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setCompareLimitHit(false);
      } else if (next.size < 4) {
        next.add(id);
        setCompareLimitHit(false);
      } else {
        setCompareLimitHit(true);
        setTimeout(() => setCompareLimitHit(false), 2000);
      }
      return next;
    });
  }

  function openCompare() {
    setShowCompare(true);
    setTimeout(() => {
      compareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <section className="py-20 px-4 border-t border-[#262626]" id="comparador">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight text-center mb-3">
          Comparador de <span className="text-emerald-500">preços</span>
        </h2>
        <p className="text-center text-zinc-400 text-sm mb-10">
          Encontre a creatina mais barata ou com melhor custo-benefício
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          <input
            type="text"
            placeholder="Buscar produto ou marca..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 min-w-[200px] bg-[#141414] border border-[#262626] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-500/50 transition"
            aria-label="Buscar produto ou marca"
          />
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-[#141414] border border-[#262626] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 transition"
          >
            <option value="all">Todas as marcas</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-[#141414] border border-[#262626] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 transition"
          >
            <option value="pricePerGram">Melhor custo/g</option>
            <option value="price">Menor preço</option>
            <option value="weight">Maior peso</option>
          </select>
          <button
            type="button"
            onClick={() => setStockOnly(!stockOnly)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition ${
              stockOnly
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-[#141414] border-[#262626] text-zinc-400"
            }`}
          >
            Em estoque
          </button>
          <button
            type="button"
            onClick={() => setDealsOnly(!dealsOnly)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition ${
              dealsOnly
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-[#141414] border-[#262626] text-zinc-400"
            }`}
          >
            Promoções
          </button>
        </div>

        {/* Highlights */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {bestByPrice && (
              <HighlightCard
                product={bestByPrice}
                badgeLabel="Mais barata"
                badgeColor="#10b981"
                badgeBg="#10b98118"
                borderColor="#10b98133"
                priceColor="#10b981"
                priceLabel="R$ {price}"
                priceSublabel="{weight}g · R$ {ppg}/g"
                btnColor="#10b981"
                btnHover="#059669"
              />
            )}
            {bestByValue && (
              <HighlightCard
                product={bestByValue}
                badgeLabel="Melhor custo-benefício"
                badgeColor="#ca8a04"
                badgeBg="#facc1520"
                borderColor="#facc1530"
                priceColor="#ca8a04"
                priceLabel="R$ {ppg}/g"
                priceSublabel="{weight}g · R$ {price}"
                btnColor="#ca8a04"
                btnHover="#a16207"
              />
            )}
          </div>
        )}

        {/* Inline compare panel */}
        <div ref={compareRef}>
          {showCompare && comparing.length > 0 && (
            <ComparePanel
              products={comparing}
              onClose={() => setShowCompare(false)}
              onRemove={(id) => toggleCompare(id)}
            />
          )}
        </div>

        {/* Product cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p, i) => {
            const price = parseFloat(p.totalPrice);
            const ppg = parseFloat(p.pricePerGram);
            const isSelected = compareIds.has(p.id);
            const isBestPrice = bestByPrice?.id === p.id;
            const isBestValue = bestByValue?.id === p.id;
            const priceDrop = getPriceDrop(p);
            const rank = i + 1;

            return (
              <div
                key={p.id}
                className={`group relative bg-[#141414] rounded-xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/5 ${
                  isSelected
                    ? "border-emerald-500/40 shadow-md shadow-emerald-500/5"
                    : rank === 1
                    ? "border-emerald-500/25"
                    : "border-[#262626] hover:border-[#363636]"
                }`}
              >
                {/* Rank badge */}
                {rank <= 3 && (
                  <div className={`absolute top-3 left-3 z-10 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    rank === 1
                      ? "bg-emerald-500 text-white"
                      : rank === 2
                      ? "bg-[#262626] text-zinc-300"
                      : "bg-[#1e1e1e] text-zinc-400"
                  }`}>
                    {rank}
                  </div>
                )}

                {/* Compare checkbox */}
                <button
                  onClick={() => toggleCompare(p.id)}
                  className={`absolute top-3 right-3 z-10 w-7 h-7 rounded-lg border text-xs flex items-center justify-center transition ${
                    isSelected
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-[#363636] text-transparent bg-[#141414]/80 backdrop-blur-sm group-hover:border-zinc-500 group-hover:text-zinc-600"
                  }`}
                  title={isSelected ? "Remover da comparação" : "Adicionar à comparação"}
                >
                  {isSelected ? "\u2713" : "+"}
                </button>

                {/* Image */}
                <div className="w-full h-40 bg-white rounded-t-xl flex items-center justify-center overflow-hidden">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.productName} className="h-full w-full object-contain p-3" loading="lazy" />
                  ) : (
                    <span className="text-zinc-400 text-xs">Sem imagem</span>
                  )}
                </div>

                {/* Body */}
                <div className="p-4">
                  {/* Tags */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{p.brand}</span>
                    {isBestPrice && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                        Mais barata
                      </span>
                    )}
                    {isBestValue && !isBestPrice && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">
                        Melhor custo
                      </span>
                    )}
                    {priceDrop !== null && priceDrop > 0 && (
                      <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                        ▼ {priceDrop}%
                      </span>
                    )}
                    {priceDrop !== null && priceDrop < 0 && (
                      <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                        ▲ {Math.abs(priceDrop)}%
                      </span>
                    )}
                    {!p.inStock && (
                      <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                        Indisponível
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-sm text-zinc-200 font-medium line-clamp-2 leading-snug mb-3 min-h-[2.5em]">
                    {p.productName}
                  </h3>

                  {/* Price row */}
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xl font-bold text-white">R$ {price.toFixed(2)}</span>
                    {priceDrop !== null && priceDrop > 0 && p.previousPrice && (
                      <span className="text-xs text-zinc-500 line-through ml-1.5">R$ {parseFloat(p.previousPrice).toFixed(2)}</span>
                    )}
                    <span className="text-xs text-zinc-500 bg-[#0a0a0a] px-2 py-1 rounded-md">{p.weightGrams}g</span>
                  </div>

                  {/* Cost per gram */}
                  <div className="text-sm text-emerald-400 font-medium mb-4">
                    R$ {ppg.toFixed(4)}<span className="text-zinc-500 text-xs">/g</span>
                  </div>

                  {/* Stock indicator + link */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#262626]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${p.inStock ? "bg-emerald-500" : "bg-zinc-600"}`} />
                      <span className="text-xs text-zinc-500">{p.inStock ? "Em estoque" : "Indisponível"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setHistoryProduct(p)}
                        className="text-xs font-medium text-zinc-500 hover:text-emerald-400 transition"
                      >
                        Histórico
                      </button>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-zinc-400 hover:text-emerald-400 transition"
                      >
                        Ver na loja →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-zinc-500 text-sm bg-[#141414] border border-[#262626] rounded-xl">
            Nenhum produto encontrado com esses filtros
          </div>
        )}

        {/* Results count */}
        {filtered.length > 0 && (
          <div className="mt-4 text-center text-xs text-zinc-600">
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Sticky bottom compare bar */}
      {compareIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#141414]/90 backdrop-blur-xl border-t border-[#262626]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex -space-x-2">
                {comparing.map((p) => (
                  <div key={p.id} className="w-9 h-9 rounded-full border-2 border-[#141414] bg-white overflow-hidden shrink-0">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                    ) : (
                      <div className="w-full h-full bg-[#262626] flex items-center justify-center text-[8px] text-zinc-500">?</div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-sm text-zinc-300">
                {compareIds.size} produto{compareIds.size > 1 ? "s" : ""}
                <span className="text-zinc-600 ml-1 hidden sm:inline">selecionado{compareIds.size > 1 ? "s" : ""}</span>
                {compareLimitHit && (
                  <span className="ml-2 text-xs text-yellow-400" role="status">Máximo de 4</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setCompareIds(new Set()); setShowCompare(false); }}
                className="text-xs text-zinc-500 hover:text-white transition px-3 py-2"
              >
                Limpar
              </button>
              <button
                onClick={openCompare}
                className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
              >
                Comparar
              </button>
            </div>
          </div>
        </div>
      )}
      {historyProduct && (
        <PriceHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}
    </section>
  );
}

function ProductCard({ product }: { product: Product }) {
  const price = parseFloat(product.totalPrice);
  const pricePerGram = parseFloat(product.pricePerGram);

  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      className="marquee-card"
    >
      <div className="marquee-card-image">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.productName}
            loading="lazy"
          />
        ) : (
          <div className="marquee-card-placeholder">
            <span>Sem imagem</span>
          </div>
        )}
      </div>
      <div className="marquee-card-body">
        <span className="marquee-card-brand">{product.brand}</span>
        <span className="marquee-card-name">{product.productName}</span>
        <div className="marquee-card-prices">
          <span className="marquee-card-price">
            R$ {price.toFixed(2)}
          </span>
          <span className="marquee-card-perg">
            R$ {pricePerGram.toFixed(4)}/g
          </span>
        </div>
        <span
          className={`marquee-card-stock ${product.inStock ? "in-stock" : "out-stock"}`}
        >
          {product.inStock ? "Em estoque" : "Indisponível"}
        </span>
      </div>
    </a>
  );
}

function Marquee({ products }: { products: Product[] }) {
  const doubled = [...products, ...products];

  return (
    <div className="marquee-wrapper">
      <div className="marquee-track">
        {doubled.map((p, i) => (
          <ProductCard key={`${p.id}-${i}`} product={p} />
        ))}
      </div>
    </div>
  );
}

function MarqueeSkeleton() {
  return (
    <div className="marquee-wrapper">
      <div className="flex gap-4 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="marquee-card shrink-0 animate-pulse">
            <div className="marquee-card-image bg-zinc-800" />
            <div className="marquee-card-body">
              <div className="h-2.5 w-16 bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-zinc-800 rounded mt-1" />
              <div className="h-3 w-3/4 bg-zinc-800 rounded mt-1" />
              <div className="flex items-baseline gap-2 mt-2">
                <div className="h-5 w-20 bg-zinc-800 rounded" />
                <div className="h-3 w-16 bg-zinc-700 rounded" />
              </div>
              <div className="h-2.5 w-14 bg-zinc-800 rounded mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparatorSkeleton() {
  return (
    <section className="py-20 px-4 border-t border-[#262626]" id="comparador">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight text-center mb-3">
          Comparador de <span className="text-emerald-500">preços</span>
        </h2>
        <p className="text-center text-zinc-400 text-sm mb-10">
          Encontre a creatina mais barata ou com melhor custo-benefício
        </p>

        {/* Skeleton filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          <div className="flex-1 min-w-[200px] h-[42px] bg-[#141414] border border-[#262626] rounded-lg animate-pulse" />
          <div className="w-44 h-[42px] bg-[#141414] border border-[#262626] rounded-lg animate-pulse" />
          <div className="w-36 h-[42px] bg-[#141414] border border-[#262626] rounded-lg animate-pulse" />
          <div className="w-28 h-[42px] bg-[#141414] border border-[#262626] rounded-lg animate-pulse" />
        </div>

        {/* Skeleton highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {[0, 1].map((i) => (
            <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden animate-pulse">
              <div style={{ display: "flex", padding: 12, gap: 12 }}>
                <div style={{ width: 90, minWidth: 90, height: 100, borderRadius: 8 }} className="bg-zinc-800 shrink-0" />
                <div style={{ flex: 1 }}>
                  <div className="h-4 w-24 bg-zinc-800 rounded-full mb-2" />
                  <div className="h-3 w-14 bg-zinc-800 rounded mb-2" />
                  <div className="h-3.5 w-3/4 bg-zinc-800 rounded mb-3" />
                  <div className="h-5 w-20 bg-zinc-800 rounded" />
                  <div className="h-3 w-32 bg-zinc-800 rounded mt-1" />
                </div>
              </div>
              <div style={{ padding: "0 12px 12px" }}>
                <div className="h-10 w-full bg-zinc-800 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Skeleton product cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#141414] rounded-xl border border-[#262626] animate-pulse">
              <div className="w-full h-40 bg-zinc-800 rounded-t-xl" />
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <div className="h-3 w-14 bg-zinc-800 rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-full bg-zinc-800 rounded" />
                  <div className="h-3.5 w-2/3 bg-zinc-800 rounded" />
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="h-6 w-24 bg-zinc-800 rounded" />
                  <div className="h-5 w-12 bg-zinc-800 rounded" />
                </div>
                <div className="h-4 w-28 bg-zinc-800 rounded" />
                <div className="pt-3 border-t border-[#262626] flex justify-between">
                  <div className="h-3 w-20 bg-zinc-800 rounded" />
                  <div className="h-3 w-16 bg-zinc-800 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-6 pt-4 max-w-md sm:max-w-none mx-auto">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl px-3 sm:px-6 py-3 sm:py-4 animate-pulse">
          <div className="h-6 sm:h-7 w-10 bg-zinc-800 rounded mx-auto mb-1" />
          <div className="h-3 sm:h-4 w-14 sm:w-16 bg-zinc-800 rounded mx-auto" />
        </div>
      ))}
    </div>
  );
}

function Landing() {
  const [stats, setStats] = useState<{
    total_products: number;
    last_update: string | null;
  } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, productsRes] = await Promise.all([
          fetch("/api/scrape/status"),
          fetch("/api/landing/products"),
        ]);
        if (!statsRes.ok || !productsRes.ok) {
          setFetchError(true);
          setLoading(false);
          return;
        }
        const [statsData, productsData] = await Promise.all([
          statsRes.json() as Promise<{ total_products: number; last_update: string | null }>,
          productsRes.json() as Promise<Product[]>,
        ]);
        setStats(statsData);
        setProducts(productsData);
      } catch (err) {
        console.error("[landing] Failed to fetch data:", err);
        setFetchError(true);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-[#262626] bg-[#0a0a0a]/80 backdrop-blur-lg">
        <span className="text-xl font-bold tracking-tight">
          pote<span className="text-emerald-500">barato</span>
        </span>
        <div className="flex gap-3 sm:gap-4 items-center">
          <a href="/docs" className="text-sm text-zinc-400 hover:text-white transition">
            Docs
          </a>
          <a
            href="https://github.com/gxdevs/potebarato"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white transition"
            title="GitHub"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a
            href="/auth"
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition"
          >
            Entrar
          </a>
        </div>
      </nav>

      <main className="flex flex-col items-center px-4 sm:px-6 py-14 sm:py-20 lg:py-24">
        <div className="max-w-2xl w-full text-center space-y-5 sm:space-y-6">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Monitoramento em tempo real
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
            Compare preços de{" "}
            <span className="text-emerald-500">creatina</span>
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 max-w-xl mx-auto">
            API em tempo real com preços de creatina das maiores lojas de
            suplementos do Brasil. Dados atualizados a cada 6 horas.
          </p>

          {loading ? (
            <StatsSkeleton />
          ) : stats ? (
            <div className="grid grid-cols-3 gap-3 sm:gap-6 pt-4 max-w-md sm:max-w-none mx-auto">
              <div className="bg-[#141414] border border-[#262626] rounded-xl px-3 sm:px-6 py-3 sm:py-4">
                <div className="text-xl sm:text-2xl font-bold text-emerald-500">
                  {stats.total_products}
                </div>
                <div className="text-xs sm:text-sm text-zinc-400">Produtos</div>
              </div>
              <div className="bg-[#141414] border border-[#262626] rounded-xl px-3 sm:px-6 py-3 sm:py-4">
                <div className="text-xl sm:text-2xl font-bold text-emerald-500">
                  {new Set(products.map((p) => p.brand)).size || "—"}
                </div>
                <div className="text-xs sm:text-sm text-zinc-400">Marcas</div>
              </div>
              <div className="bg-[#141414] border border-[#262626] rounded-xl px-3 sm:px-6 py-3 sm:py-4">
                <div className="text-xl sm:text-2xl font-bold text-emerald-500">6h</div>
                <div className="text-xs sm:text-sm text-zinc-400">Atualização</div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4">
            <a
              href="#comparador"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-medium text-base sm:text-lg transition text-center"
            >
              Comparar preços
            </a>
            <a
              href="/docs"
              className="border border-[#262626] hover:border-zinc-600 text-zinc-300 px-8 py-3 rounded-xl font-medium text-base sm:text-lg transition text-center"
            >
              Ver documentação
            </a>
          </div>
        </div>
      </main>

      {fetchError ? (
        <div className="py-20 px-4 text-center">
          <div className="max-w-md mx-auto bg-red-950/50 border border-red-800/50 rounded-xl p-8">
            <p className="text-red-400 font-medium mb-2">Erro ao carregar produtos</p>
            <p className="text-sm text-zinc-400 mb-4">Não foi possível conectar ao servidor. Tente novamente.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition"
            >
              Recarregar
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="marquee-section">
            <h2 className="marquee-title">
              Produtos monitorados em <span className="text-emerald-500">tempo real</span>
            </h2>
            {loading ? <MarqueeSkeleton /> : products.length > 0 ? <Marquee products={products} /> : null}
          </section>

          {loading ? <ComparatorSkeleton /> : products.length > 0 ? <PriceComparator products={products} /> : null}
        </>
      )}

      <section className="py-20 px-4 border-t border-[#262626]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-12">
            Como <span className="text-emerald-500">funciona</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-lg font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold">Dados do Google</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Todos os preços são coletados de informações publicamente disponíveis
                no Google Shopping e nas próprias lojas. Nenhum dado privado é acessado.
              </p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-lg font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold">Atualização automática</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Um crawler roda a cada 6 horas, visitando as páginas públicas das lojas
                e atualizando os preços automaticamente via API.
              </p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-lg font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold">API REST simples</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Consulte preços, filtre por marca e compare produtos com uma única
                chamada. Documentação completa disponível em /docs.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-[#262626]">
        <div className="max-w-2xl mx-auto bg-[#141414] border border-[#262626] rounded-xl p-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">
            Projeto educacional
          </div>
          <h3 className="text-xl font-semibold">Sobre este projeto</h3>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-lg mx-auto">
            O potebarato foi criado com fins <strong className="text-zinc-300">exclusivamente educacionais</strong> como
            um estudo de web scraping, APIs REST e comparação de preços.
            Todos os dados exibidos são <strong className="text-zinc-300">públicos</strong>, coletados diretamente
            das páginas das lojas indexadas pelo Google. Este projeto não possui fins comerciais
            e não armazena dados pessoais de terceiros.
          </p>
        </div>
      </section>

      <footer className="text-center py-6 text-sm text-zinc-600 border-t border-[#262626]">
        <p>potebarato &copy; {new Date().getFullYear()}</p>
        <p className="mt-1 text-zinc-700 text-xs">
          Projeto educacional — dados publicamente disponíveis
        </p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Landing />);
