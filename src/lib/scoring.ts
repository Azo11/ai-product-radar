import type { DimensionKey, Product } from "../data/products";

export const weights: Record<DimensionKey, number> = {
  growth: 0.25,
  virality: 0.2,
  margin: 0.2,
  supply: 0.15,
  logistics: 0.1,
  compliance: 0.1,
};

export function calculateMargin(salePrice: number, cost: number, shipping: number) {
  if (salePrice <= 0) return 0;
  return ((salePrice - cost - shipping) / salePrice) * 100;
}

export function marginToScore(margin: number) {
  return Math.max(0, Math.min(100, Math.round((margin - 15) * 2.35)));
}

export function calculateScore(product: Product, salePrice = product.salePrice, cost = product.cost) {
  const adjusted = { ...product.dimensions, margin: marginToScore(calculateMargin(salePrice, cost, product.shipping)) };
  return Math.round(
    (Object.keys(weights) as DimensionKey[]).reduce((total, key) => total + adjusted[key] * weights[key], 0),
  );
}

export function getRecommendationLevel(score: number) {
  if (score >= 82) return "优先研究";
  if (score >= 72) return "建议研究";
  return "谨慎研究";
}
