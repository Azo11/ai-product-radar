import { describe, expect, it } from "vitest";
import { calculateMargin, calculateScore, getRecommendationLevel } from "./scoring";
import { products } from "../data/products";

describe("scoring", () => {
  it("calculates margin from sale price, cost and shipping", () => {
    expect(calculateMargin(20, 5, 3)).toBe(60);
  });

  it("recalculates score when cost changes", () => {
    const product = products[0];
    expect(calculateScore(product, product.salePrice, product.cost + 8)).toBeLessThan(calculateScore(product));
  });

  it("maps score to a research priority", () => {
    expect(getRecommendationLevel(86)).toBe("优先研究");
    expect(getRecommendationLevel(76)).toBe("建议研究");
    expect(getRecommendationLevel(64)).toBe("谨慎研究");
  });
});
