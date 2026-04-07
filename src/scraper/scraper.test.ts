import { test, expect, describe } from "bun:test";
import { parsePrice, extractWeightGrams, extractJsonLdProduct } from "./scraper";

describe("parsePrice", () => {
  test("formato brasileiro com vírgula", () => {
    expect(parsePrice("R$ 49,90")).toBe(49.9);
  });

  test("formato com ponto de milhar e vírgula decimal", () => {
    expect(parsePrice("1.299,00")).toBe(1299);
  });

  test("formato americano simples", () => {
    expect(parsePrice("89.90")).toBe(89.9);
  });

  test("preço com R$ e espaço", () => {
    expect(parsePrice("R$  129,90")).toBe(129.9);
  });

  test("preço com texto de desconto após valor", () => {
    expect(parsePrice("R$ 49,90 10% OFF")).toBe(49.9);
  });

  test("string vazia retorna NaN", () => {
    expect(parsePrice("")).toBeNaN();
  });
});

describe("extractWeightGrams", () => {
  test("extrai gramas simples", () => {
    expect(extractWeightGrams("Creatina 500g")).toBe(500);
  });

  test("extrai quilos e converte para gramas", () => {
    expect(extractWeightGrams("Creatina 1Kg")).toBe(1000);
  });

  test("extrai quilos com vírgula decimal", () => {
    expect(extractWeightGrams("Creatina 1,5kg")).toBe(1500);
  });

  test("extrai 250g", () => {
    expect(extractWeightGrams("Creatina Monohidratada 250g")).toBe(250);
  });

  test("retorna null sem peso", () => {
    expect(extractWeightGrams("Creatina Monohidratada")).toBeNull();
  });

  test("retorna null para string vazia", () => {
    expect(extractWeightGrams("")).toBeNull();
  });

  test("não confunde números que não são peso", () => {
    expect(extractWeightGrams("Creatina 500g 100 cápsulas")).toBe(500);
  });
});

describe("extractJsonLdProduct", () => {
  test("extrai Product com offers direto", () => {
    const jsonLd = JSON.stringify({
      "@type": "Product",
      name: "Creatina 500g",
      brand: { name: "Growth" },
      offers: {
        price: 49.9,
        priceCurrency: "BRL",
        availability: "http://schema.org/InStock",
      },
      image: "https://example.com/img.jpg",
    });

    const result = extractJsonLdProduct([jsonLd], "product");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Creatina 500g");
    expect(result!.brand).toBe("Growth");
    expect(result!.price).toBe(49.9);
    expect(result!.currency).toBe("BRL");
    expect(result!.inStock).toBe(true);
    expect(result!.imageUrl).toBe("https://example.com/img.jpg");
  });

  test("extrai ProductGroup com hasVariant", () => {
    const jsonLd = JSON.stringify({
      "@type": "ProductGroup",
      name: "Creatina",
      brand: { name: "Soldiers" },
      hasVariant: [
        {
          name: "Creatina 300g",
          offers: {
            price: 39.9,
            priceCurrency: "BRL",
            availability: "http://schema.org/InStock",
          },
        },
      ],
    });

    const result = extractJsonLdProduct([jsonLd], "product-group");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Creatina 300g");
    expect(result!.price).toBe(39.9);
  });

  test("retorna null para estratégia errada", () => {
    const jsonLd = JSON.stringify({
      "@type": "Product",
      name: "Creatina",
      offers: { price: 49.9 },
    });
    expect(extractJsonLdProduct([jsonLd], "product-group")).toBeNull();
  });

  test("retorna null para JSON inválido", () => {
    expect(extractJsonLdProduct(["not json {{{"], "product")).toBeNull();
  });

  test("retorna null para array vazio", () => {
    expect(extractJsonLdProduct([], "product")).toBeNull();
  });

  test("retorna null quando offers falta price", () => {
    const jsonLd = JSON.stringify({
      "@type": "Product",
      name: "Creatina",
      offers: { priceCurrency: "BRL" },
    });
    expect(extractJsonLdProduct([jsonLd], "product")).toBeNull();
  });

  test("detecta OutOfStock", () => {
    const jsonLd = JSON.stringify({
      "@type": "Product",
      name: "Creatina 500g",
      brand: { name: "Test" },
      offers: {
        price: 49.9,
        availability: "http://schema.org/OutOfStock",
      },
    });
    const result = extractJsonLdProduct([jsonLd], "product");
    expect(result!.inStock).toBe(false);
  });

  test("lida com array de scripts JSON-LD", () => {
    const scripts = [
      JSON.stringify({ "@type": "BreadcrumbList" }),
      JSON.stringify({
        "@type": "Product",
        name: "Creatina 1kg",
        brand: { name: "Growth" },
        offers: { price: 89.9 },
      }),
    ];
    const result = extractJsonLdProduct(scripts, "product");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Creatina 1kg");
  });
});
