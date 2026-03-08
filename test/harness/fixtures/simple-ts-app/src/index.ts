import { add, multiply } from "./utils";
import type { MathResult } from "./types";

function calculate(a: number, b: number): MathResult {
  return {
    sum: add(a, b),
    product: multiply(a, b),
    timestamp: new Date().toISOString(),
  };
}

const result = calculate(3, 7);
console.log("Sum:", result.sum);
console.log("Product:", result.product);
console.log("Calculated at:", result.timestamp);
