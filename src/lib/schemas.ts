import z from "zod";

export const ProductSchema = z.object({
  id: z.string().uuid(),
  brand: z.string(),
  productName: z.string(),
  totalPrice: z.string(),
  cashPrice: z.string().nullable(),
  weightGrams: z.number(),
  pricePerGram: z.string(),
  currency: z.string(),
  inStock: z.boolean(),
  url: z.string().url(),
  imageUrl: z.string().url().nullable(),
  purityLabel: z.string().nullable(),
  lastUpdate: z.string().datetime(),
});

export const ProductsResponseSchema = z.object({
  data: z.array(ProductSchema),
  total: z.number(),
  last_update: z.string().datetime().nullable(),
});

export const ScrapeStatusSchema = z.object({
  total_products: z.number(),
  last_update: z.string().datetime().nullable(),
});

export const ErrorSchema = z.object({
  error: z.string(),
});

export const ScrapeStartedSchema = z.object({
  message: z.string(),
  pid: z.number(),
});
