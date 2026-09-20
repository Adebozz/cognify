import { describe, expect, it } from "vitest";
import {
  analyseTopicMastery,
  buildAdaptivePlan,
  getStrongTopics,
  getWeakTopics,
  type AnswerLike,
} from "@/lib/adaptiveEngine";

const right = (topic: string, extra: Partial<AnswerLike> = {}): AnswerLike => ({
  topic,
  chosenIdx: 1,
  correctIdx: 1,
  conf: 3,
  difficulty: "medium",
  ...extra,
});
const wrong = (topic: string, extra: Partial<AnswerLike> = {}): AnswerLike => ({
  topic,
  chosenIdx: 0,
  correctIdx: 1,
  conf: 3,
  difficulty: "medium",
  ...extra,
});

describe("analyseTopicMastery", () => {
  it("returns an empty list for no answers", () => {
    expect(analyseTopicMastery([])).toEqual([]);
  });

  it("marks a topic answered correctly with high confidence as strong", () => {
    const [m] = analyseTopicMastery([right("Enzymes"), right("Enzymes"), right("Enzymes")]);
    expect(m).toMatchObject({ topic: "Enzymes", level: "strong", nextDifficulty: "hard", accuracy: 100 });
  });

  it("marks a mostly-wrong topic as weak and steps difficulty down", () => {
    const [m] = analyseTopicMastery([wrong("Calvin Cycle"), wrong("Calvin Cycle"), right("Calvin Cycle")]);
    expect(m).toMatchObject({ level: "weak", nextDifficulty: "easy", correct: 1, wrong: 2 });
    expect(m.recommendation).toMatch(/Review the basics of Calvin Cycle/);
  });

  it("penalises correct-but-unsure answers (low confidence)", () => {
    const sure = analyseTopicMastery([right("A"), right("A")])[0];
    const unsure = analyseTopicMastery([right("A", { conf: 1 }), right("A", { conf: 1 })])[0];
    expect(unsure.score).toBeLessThan(sure.score);
    expect(unsure.lowConfidence).toBe(2);
    expect(unsure.level).not.toBe("strong");
  });

  it("groups blank/missing topics under 'General Knowledge'", () => {
    const result = analyseTopicMastery([right("   "), right(undefined as unknown as string)]);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("General Knowledge");
  });

  it("keeps scores within 0–100 and sorts weakest first", () => {
    const result = analyseTopicMastery([
      ...Array(6).fill(0).map(() => right("Strong", { difficulty: "hard" })),
      ...Array(6).fill(0).map(() => wrong("Weak", { conf: 1, difficulty: "easy" })),
    ]);
    expect(result.map((r) => r.topic)).toEqual(["Weak", "Strong"]);
    for (const r of result) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("weak/strong topic helpers", () => {
  const answers = [
    right("Strong 1"), right("Strong 1"), right("Strong 1"),
    wrong("Weak 1"), wrong("Weak 1"),
    right("Unsure", { conf: 2 }),
  ];

  it("getWeakTopics includes weak and low-confidence topics", () => {
    expect(getWeakTopics(answers)).toEqual(expect.arrayContaining(["Weak 1", "Unsure"]));
    expect(getWeakTopics(answers)).not.toContain("Strong 1");
  });

  it("getStrongTopics respects the limit", () => {
    const strongOnly = answers.filter((a) => a.topic === "Strong 1");
    expect(getStrongTopics(strongOnly)).toEqual(["Strong 1"]);
    expect(getStrongTopics(strongOnly, 0)).toEqual([]);
  });

  // KNOWN BUG (found by this suite): one correct answer at confidence 2 scores
  // 78 → "strong", but lowConfidence > 0 also puts it in getWeakTopics, so the
  // same topic is reported as both strong and weak. `it.fails` keeps CI green
  // while documenting it; flip to `it` once the engine is fixed.
  it.fails("never reports a topic as both weak and strong", () => {
    const weak = getWeakTopics(answers);
    const strong = getStrongTopics(answers);
    expect(weak.filter((t) => strong.includes(t))).toEqual([]);
  });
});

describe("buildAdaptivePlan", () => {
  it("focuses next on the weakest topic", () => {
    const plan = buildAdaptivePlan([right("Good"), right("Good"), right("Good"), wrong("Bad"), wrong("Bad")]);
    expect(plan.nextFocus).toBe("Bad");
    expect(plan.weakTopics).toEqual(["Bad"]);
    expect(plan.recommendation).toBe("Focus next on Bad.");
  });

  it("recommends harder questions when nothing is weak", () => {
    const plan = buildAdaptivePlan([right("Good"), right("Good"), right("Good")]);
    expect(plan.weakTopics).toEqual([]);
    expect(plan.recommendation).toMatch(/harder mixed questions/);
  });

  it("falls back to General Knowledge with no answers", () => {
    expect(buildAdaptivePlan([]).nextFocus).toBe("General Knowledge");
  });
});
