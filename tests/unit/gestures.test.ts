// 001 R21 / 002 R18: the one-gesture owner. An app's gesture belongs to one
// app: another app's pointer is refused until it ends, and a cancel ends
// every pointer of the gesture.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { active, cancel, claim, free } from "../../src/sheet/gestures";

beforeEach(() => cancel());

describe("gestures", () => {
  it("one app owns the gesture; its other pointers join it", () => {
    const [a1, a3, b] = [vi.fn(), vi.fn(), vi.fn()];
    const [A, B] = [{}, {}];
    expect(claim("app", 1, 10, a1, A)).toBe(true);
    expect(claim("app", 2, 10, b, B)).toBe(false);
    expect(claim("app", 3, 10, a3, A)).toBe(true);
    // a cancel ends the whole set
    cancel();
    expect(a1).toHaveBeenCalledTimes(1);
    expect(a3).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(active()).toBe(false);
    expect(claim("app", 2, 10, b, B)).toBe(true);
  });

  it("the gesture ends with its last pointer; then another app may own it", () => {
    const [A, B] = [{}, {}];
    claim("app", 1, 10, vi.fn(), A);
    claim("app", 2, 10, vi.fn(), A);
    free(1);
    expect(claim("app", 3, 10, vi.fn(), B)).toBe(false);
    free(2);
    expect(claim("app", 3, 10, vi.fn(), B)).toBe(true);
  });

  it("a gesture with one stop for its pointers stops once (the paper's pinch)", () => {
    const stop = vi.fn();
    expect(claim("paper", 1, 2, stop)).toBe(true);
    expect(claim("paper", 2, 2, stop)).toBe(true);
    expect(claim("paper", 3, 2, stop)).toBe(false);
    expect(claim("win", 4, 1, vi.fn())).toBe(false);
    cancel();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
