import { test, expect, describe, beforeEach } from "bun:test";
import { incrementUsage, getUsage } from "./rate-limit";

// Use unique userIds per test to avoid state leaking between tests
let testUserId: string;
let counter = 0;

beforeEach(() => {
  counter++;
  testUserId = `test-user-${counter}-${Date.now()}`;
});

describe("incrementUsage", () => {
  test("permite requisições dentro do limite", () => {
    const result = incrementUsage(testUserId);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.max).toBe(100);
    expect(result.remaining).toBe(99);
  });

  test("incrementa corretamente", () => {
    incrementUsage(testUserId);
    incrementUsage(testUserId);
    const result = incrementUsage(testUserId);
    expect(result.used).toBe(3);
    expect(result.remaining).toBe(97);
  });

  test("bloqueia após 100 requisições", () => {
    for (let i = 0; i < 100; i++) {
      const r = incrementUsage(testUserId);
      expect(r.allowed).toBe(true);
    }
    const blocked = incrementUsage(testUserId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});

describe("getUsage", () => {
  test("retorna zero para user novo", () => {
    const result = getUsage(testUserId);
    expect(result.used).toBe(0);
    expect(result.max).toBe(100);
    expect(result.remaining).toBe(100);
  });

  test("reflete uso após incrementos", () => {
    incrementUsage(testUserId);
    incrementUsage(testUserId);
    const result = getUsage(testUserId);
    expect(result.used).toBe(2);
    expect(result.remaining).toBe(98);
  });
});
