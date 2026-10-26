// Spec 013 event contract: each tool's stage ids (011 R15, 012 R18). A
// write-up's diagram must put each one on exactly one box (R9).
export const STAGES: Record<string, readonly string[]> = {
  crawler: [
    "seeds",
    "frontier",
    "fetch",
    "gate-a",
    "gate-b",
    "gate-c",
    "gate-d",
    "evaluate",
  ],
  insider: ["market", "prices", "moves", "candidates", "news", "score"],
};
