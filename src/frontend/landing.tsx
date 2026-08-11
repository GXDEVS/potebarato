import React, { useEffect, useState, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import useSWR from "swr";

const fetcher = <T,>(url: string): Promise<T> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  });

type StatsData = { total_products: number; last_update: string | null };

const PAGE_SIZE = 9;

interface Product {
  id: string;
  brand: string;
  productName: string;
  totalPrice: string;
  /** PIX / à vista price when the site publishes one separately. When
   *  set, totalPrice equals this value — cashPrice being non-null simply
   *  means "this price requires PIX/boleto to get". */
  cashPrice: string | null;
  weightGrams: number;
  pricePerGram: string;
  inStock: boolean;
  url: string;
  imageUrl: string | null;
  purityLabel: string | null;
}

type SortKey = "price" | "pricePerGram" | "weight" | "brand";
type WeightBucket = "all" | "100" | "250" | "300" | "500" | "1000+";

/** Agrupa o peso em baldes fixos que a maioria das creatinas ocupa */
function getWeightBucket(grams: number): WeightBucket {
  if (grams <= 120) return "100";
  if (grams <= 275) return "250";
  if (grams <= 400) return "300";
  if (grams <= 800) return "500";
  return "1000+";
}

const WEIGHT_OPTIONS: { value: WeightBucket; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "100", label: "100g" },
  { value: "250", label: "250g" },
  { value: "300", label: "300g" },
  { value: "500", label: "500g" },
  { value: "1000+", label: "1kg+" },
];

/** Classifica o selo de pureza em Creapure / % numérico / nenhum */
function getPurityKind(label: string | null): "creapure" | "percent" | null {
  if (!label) return null;
  if (/creapure/i.test(label)) return "creapure";
  if (/%|pura|pureza/i.test(label)) return "percent";
  return null;
}

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
                    {p.cashPrice != null && <span className="ml-1.5 text-[10px] text-cyan-400 font-semibold">no Pix</span>}
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
            {product.purityLabel && <PurityBadge label={product.purityLabel} />}
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
            {product.cashPrice != null && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#22d3ee",
                  verticalAlign: "middle",
                }}
              >
                no Pix
              </span>
            )}
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

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active
          ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20"
          : "bg-[#0a0a0a] border-[#262626] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function PurityBadge({ label, size = "sm" }: { label: string; size?: "sm" | "md" }) {
  const kind = getPurityKind(label);
  if (!kind) return null;

  const textSize = size === "md" ? "text-[11px]" : "text-[10px]";
  const pad = size === "md" ? "px-2 py-0.5" : "px-1.5 py-0.5";

  if (kind === "creapure") {
    return (
      <span
        className={`${textSize} ${pad} rounded font-semibold inline-flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300`}
        title="Creapure® — creatina certificada 99,99% pura (AlzChem, Alemanha)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Creapure&reg;
      </span>
    );
  }

  return (
    <span
      className={`${textSize} ${pad} rounded font-medium bg-purple-500/10 border border-purple-500/30 text-purple-300`}
      title={`Pureza declarada pelo fabricante: ${label}`}
    >
      {label}
    </span>
  );
}

/** Badge de ranking — sólido, sem gradientes */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div
        className="absolute top-3 left-3 z-10 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold bg-emerald-500 text-white border border-emerald-400"
        title="1º lugar"
      >
        1
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div
        className="absolute top-3 left-3 z-10 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold bg-zinc-300 text-zinc-900 border border-zinc-400"
        title="2º lugar"
      >
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div
        className="absolute top-3 left-3 z-10 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold bg-orange-600 text-white border border-orange-500"
        title="3º lugar"
      >
        3
      </div>
    );
  }
  return (
    <div
      className="absolute top-3 left-3 z-10 px-2 h-6 rounded-md flex items-center justify-center text-[11px] font-bold bg-[#0a0a0a] border border-[#262626] text-zinc-400"
      title={`${rank}º lugar`}
    >
      #{rank}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // Janela de páginas visíveis: primeira, última, atual +/- 1, com ellipsis
  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    const addRange = (start: number, end: number) => {
      for (let i = start; i <= end; i++) pages.push(i);
    };

    if (totalPages <= 7) {
      addRange(0, totalPages - 1);
      return pages;
    }

    pages.push(0);
    if (currentPage > 2) pages.push("ellipsis");

    const start = Math.max(1, currentPage - 1);
    const end = Math.min(totalPages - 2, currentPage + 1);
    addRange(start, end);

    if (currentPage < totalPages - 3) pages.push("ellipsis");
    pages.push(totalPages - 1);

    return pages;
  }, [currentPage, totalPages]);

  const btnBase =
    "min-w-[36px] h-9 px-2 rounded-lg text-sm font-medium border transition flex items-center justify-center";

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-2 flex-wrap"
      aria-label="Paginação de produtos"
    >
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 0}
        className={`${btnBase} bg-[#141414] border-[#262626] text-zinc-300 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#262626]`}
        aria-label="Página anterior"
      >
        &larr;
      </button>

      {pageNumbers.map((p, idx) =>
        p === "ellipsis" ? (
          <span
            key={`ellipsis-${idx}`}
            className="min-w-[36px] h-9 flex items-center justify-center text-zinc-600 text-sm"
            aria-hidden="true"
          >
            {"\u2026"}
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={`${btnBase} ${
              p === currentPage
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "bg-[#141414] border-[#262626] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {p + 1}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages - 1}
        className={`${btnBase} bg-[#141414] border-[#262626] text-zinc-300 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#262626]`}
        aria-label="Próxima página"
      >
        &rarr;
      </button>
    </nav>
  );
}

function PriceComparator({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [weightFilter, setWeightFilter] = useState<WeightBucket>("all");
  const [stockOnly, setStockOnly] = useState(false);
  const [purityOnly, setPurityOnly] = useState(false);
  const [creapureOnly, setCreapureOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("pricePerGram");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [page, setPage] = useState(0);
  const compareRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Range máximo de preço baseado no catálogo inteiro (não no filtrado)
  const priceRange = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 500 };
    const prices = products.map((p) => parseFloat(p.totalPrice));
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices)),
    };
  }, [products]);

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    let list = [...products];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }
    if (brandFilter !== "all") {
      list = list.filter((p) => p.brand === brandFilter);
    }
    if (weightFilter !== "all") {
      list = list.filter((p) => getWeightBucket(p.weightGrams) === weightFilter);
    }
    if (stockOnly) {
      list = list.filter((p) => p.inStock);
    }
    if (purityOnly) {
      list = list.filter((p) => getPurityKind(p.purityLabel) !== null);
    }
    if (creapureOnly) {
      list = list.filter((p) => getPurityKind(p.purityLabel) === "creapure");
    }
    if (maxPrice !== null) {
      list = list.filter((p) => parseFloat(p.totalPrice) <= maxPrice);
    }
    list.sort((a, b) => {
      if (sortBy === "price") return parseFloat(a.totalPrice) - parseFloat(b.totalPrice);
      if (sortBy === "pricePerGram") return parseFloat(a.pricePerGram) - parseFloat(b.pricePerGram);
      if (sortBy === "brand") return a.brand.localeCompare(b.brand);
      return b.weightGrams - a.weightGrams;
    });
    return list;
  }, [products, search, brandFilter, weightFilter, stockOnly, purityOnly, creapureOnly, maxPrice, sortBy]);

  // Conta quantos filtros estão ativos (para mostrar no botão "Limpar")
  const activeFilterCount =
    (search ? 1 : 0) +
    (brandFilter !== "all" ? 1 : 0) +
    (weightFilter !== "all" ? 1 : 0) +
    (stockOnly ? 1 : 0) +
    (purityOnly ? 1 : 0) +
    (creapureOnly ? 1 : 0) +
    (maxPrice !== null ? 1 : 0);

  function clearAllFilters() {
    setSearch("");
    setBrandFilter("all");
    setWeightFilter("all");
    setStockOnly(false);
    setPurityOnly(false);
    setCreapureOnly(false);
    setMaxPrice(null);
  }

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginated = useMemo(
    () => filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filtered, currentPage]
  );

  // Reseta a página ao trocar filtros/ordenação
  useEffect(() => {
    setPage(0);
  }, [search, brandFilter, weightFilter, stockOnly, purityOnly, creapureOnly, maxPrice, sortBy]);

  function goToPage(p: number) {
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    setPage(clamped);
    // Scroll suave até o topo do grid
    setTimeout(() => {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 20);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
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
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-4 sm:p-5 mb-8 space-y-4">
          {/* Linha 1: busca + ordenação + limpar */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Buscar produto ou marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-500/50 transition"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 transition cursor-pointer"
            >
              <option value="pricePerGram">Melhor custo/g</option>
              <option value="price">Menor preço</option>
              <option value="weight">Maior peso</option>
              <option value="brand">Marca A–Z</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/15 transition flex items-center gap-2"
                title="Limpar todos os filtros"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
                Limpar ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Linha 2: marcas em pills */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Marca</div>
            <div className="flex flex-wrap gap-2">
              <FilterPill
                active={brandFilter === "all"}
                onClick={() => setBrandFilter("all")}
              >
                Todas
              </FilterPill>
              {brands.map((b) => (
                <FilterPill
                  key={b}
                  active={brandFilter === b}
                  onClick={() => setBrandFilter(b)}
                >
                  {b}
                </FilterPill>
              ))}
            </div>
          </div>

          {/* Linha 3: peso em pills */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Peso</div>
            <div className="flex flex-wrap gap-2">
              {WEIGHT_OPTIONS.map((opt) => (
                <FilterPill
                  key={opt.value}
                  active={weightFilter === opt.value}
                  onClick={() => setWeightFilter(opt.value)}
                >
                  {opt.label}
                </FilterPill>
              ))}
            </div>
          </div>

          {/* Linha 4: toggles + slider de preço */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => setStockOnly(!stockOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition flex items-center gap-1.5 ${
                stockOnly
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-[#0a0a0a] border-[#262626] text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${stockOnly ? "bg-emerald-500" : "bg-zinc-600"}`} />
              Em estoque
            </button>
            <button
              onClick={() => setPurityOnly(!purityOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                purityOnly
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                  : "bg-[#0a0a0a] border-[#262626] text-zinc-400 hover:border-zinc-600"
              }`}
            >
              Com selo de pureza
            </button>
            <button
              onClick={() => setCreapureOnly(!creapureOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                creapureOnly
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  : "bg-[#0a0a0a] border-[#262626] text-zinc-400 hover:border-zinc-600"
              }`}
            >
              Só Creapure&reg;
            </button>

            <div className="flex items-center gap-3 ml-auto flex-1 min-w-[220px] max-w-[360px]">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold shrink-0">
                Preço máx
              </label>
              <input
                type="range"
                min={priceRange.min}
                max={priceRange.max}
                step={5}
                value={maxPrice ?? priceRange.max}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxPrice(v >= priceRange.max ? null : v);
                }}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-zinc-300 font-medium tabular-nums shrink-0 min-w-[52px] text-right">
                R$ {(maxPrice ?? priceRange.max).toFixed(0)}
              </span>
            </div>
          </div>
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
        <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 scroll-mt-20">
          {paginated.map((p, i) => {
            const price = parseFloat(p.totalPrice);
            const ppg = parseFloat(p.pricePerGram);
            const isSelected = compareIds.has(p.id);
            const isBestPrice = bestByPrice?.id === p.id;
            const isBestValue = bestByValue?.id === p.id;
            // Rank global, respeitando a página atual
            const rank = currentPage * PAGE_SIZE + i + 1;

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
                <RankBadge rank={rank} />

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
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{p.brand}</span>
                    {p.purityLabel && <PurityBadge label={p.purityLabel} />}
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
                    {!p.inStock && (
                      <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                        Indisponível
                      </span>
                    )}
                    {p.cashPrice != null && (
                      <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-full font-semibold tracking-wide">
                        PIX
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-sm text-zinc-200 font-medium line-clamp-2 leading-snug mb-3 min-h-[2.5em]">
                    {p.productName}
                  </h3>

                  {/* Price row */}
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-white">R$ {price.toFixed(2)}</span>
                      {p.cashPrice != null && (
                        <span className="text-[10px] text-cyan-400 font-semibold">no Pix</span>
                      )}
                    </div>
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
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-zinc-500 text-sm bg-[#141414] border border-[#262626] rounded-xl">
            Nenhum produto encontrado com esses filtros
          </div>
        )}

        {/* Paginação */}
        {filtered.length > 0 && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        )}

        {/* Results count */}
        {filtered.length > 0 && (
          <div className="mt-4 text-center text-xs text-zinc-600">
            Mostrando {currentPage * PAGE_SIZE + 1}
            {"\u2013"}
            {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de{" "}
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
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
    </section>
  );
}

function ProductCard({ product }: { product: Product }) {
  const price = parseFloat(product.totalPrice);
  const pricePerGram = parseFloat(product.pricePerGram);
  const hasPix = product.cashPrice != null;

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
            {hasPix && (
              <span className="ml-1.5 align-middle text-[10px] font-semibold text-cyan-400 tracking-wide">
                PIX
              </span>
            )}
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
  const { data: stats } = useSWR<StatsData>(
    "/api/scrape/status",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true }
  );
  const { data: products } = useSWR<Product[]>(
    "/api/landing/products",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true }
  );

  const loading = products === undefined;
  const productList = products ?? [];
  const brandCount = useMemo(
    () => new Set(productList.map((p) => p.brand)).size,
    [productList]
  );

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
                <div className="text-xl sm:text-2xl font-bold text-emerald-500">{brandCount}</div>
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

      <section className="marquee-section">
        <h2 className="marquee-title">
          Produtos monitorados em <span className="text-emerald-500">tempo real</span>
        </h2>
        {loading ? <MarqueeSkeleton /> : productList.length > 0 ? <Marquee products={productList} /> : null}
      </section>

      {loading ? <ComparatorSkeleton /> : productList.length > 0 ? <PriceComparator products={productList} /> : null}

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
