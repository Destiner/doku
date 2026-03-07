import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeTime } from "./time";

describe("relativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function at(offset: number): Date {
    const now = Date.now();
    return new Date(now - offset);
  }

  it("returns 'just now' for less than 60 seconds", () => {
    expect(relativeTime(at(0))).toBe("just now");
    expect(relativeTime(at(30_000))).toBe("just now");
    expect(relativeTime(at(59_000))).toBe("just now");
  });

  it("returns minutes for 1-59 minutes", () => {
    expect(relativeTime(at(60_000))).toBe("1m ago");
    expect(relativeTime(at(5 * 60_000))).toBe("5m ago");
    expect(relativeTime(at(59 * 60_000))).toBe("59m ago");
  });

  it("returns hours for 1-23 hours", () => {
    expect(relativeTime(at(60 * 60_000))).toBe("1h ago");
    expect(relativeTime(at(12 * 60 * 60_000))).toBe("12h ago");
    expect(relativeTime(at(23 * 60 * 60_000))).toBe("23h ago");
  });

  it("returns days for 1-29 days", () => {
    expect(relativeTime(at(24 * 60 * 60_000))).toBe("1d ago");
    expect(relativeTime(at(7 * 24 * 60 * 60_000))).toBe("7d ago");
    expect(relativeTime(at(29 * 24 * 60 * 60_000))).toBe("29d ago");
  });

  it("returns months for 30+ days", () => {
    expect(relativeTime(at(30 * 24 * 60 * 60_000))).toBe("1mo ago");
    expect(relativeTime(at(90 * 24 * 60 * 60_000))).toBe("3mo ago");
  });
});
