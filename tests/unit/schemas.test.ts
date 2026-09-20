import { describe, expect, it } from "vitest";
import { QuestionSchema, validateLlmQuestions } from "@/lib/schemas";
import { makeLlmPayload, makeQuestion } from "../fixtures/questions";

describe("QuestionSchema", () => {
  it("accepts a well-formed question", () => {
    expect(QuestionSchema.safeParse(makeQuestion()).success).toBe(true);
  });

  it.each([
    ["three options", { options: ["a option", "b option", "c option"] }],
    ["correctIndex out of range", { correctIndex: 4 }],
    ["non-integer correctIndex", { correctIndex: 1.5 }],
    ["unknown difficulty", { difficulty: "extreme" }],
    ["too-short explanation", { explanation: "Because." }],
  ])("rejects %s", (_label, overrides) => {
    const result = QuestionSchema.safeParse({ ...makeQuestion(), ...overrides });
    expect(result.success).toBe(false);
  });
});

describe("validateLlmQuestions", () => {
  it("accepts exactly five good questions", () => {
    const result = validateLlmQuestions(makeLlmPayload(5));
    expect(result.ok).toBe(true);
  });

  it.each([4, 6])("rejects %i questions (LLM path requires exactly 5)", (count) => {
    const result = validateLlmQuestions(makeLlmPayload(count));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toMatch(/^shape:/);
  });

  it.each([null, undefined, "not json", 42, { questions: "nope" }])(
    "rejects malformed input %j without throwing",
    (input) => {
      expect(validateLlmQuestions(input).ok).toBe(false);
    }
  );

  it.each(["general", "The Document", "overview", "  misc  ", "it"])("rejects vague topic %j", (topic) => {
    const payload = makeLlmPayload(5);
    payload.questions[2] = makeQuestion({ topic });
    const result = validateLlmQuestions(payload);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("q3: vague topic");
  });

  it.each([
    "According to Smith et al., what was the sample size?",
    "What is shown in Figure 3 of the article?",
    "Which DOI identifies the original study?",
    "What is reported on page 12 about bias?",
  ])("rejects citation-style question %j", (question) => {
    const payload = makeLlmPayload(5);
    payload.questions[0] = makeQuestion({ question, topic: "Research Methods" });
    const result = validateLlmQuestions(payload);
    expect(result).toMatchObject({ ok: false, reason: "q1: citation/reference question" });
  });

  it("rejects a giveaway where the correct option is 3x longer than the distractors", () => {
    const payload = makeLlmPayload(5);
    payload.questions[4] = makeQuestion({
      options: [
        "The systematic failure of a model to detect disease in specific under-represented patient subgroups",
        "Noise",
        "Speed",
        "Cost",
      ],
      correctIndex: 0,
    });
    const result = validateLlmQuestions(payload);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("giveaway");
  });

  it("rejects duplicate options, ignoring case and whitespace", () => {
    const payload = makeLlmPayload(5);
    payload.questions[1] = makeQuestion({
      options: ["Mitochondria produce ATP", "  mitochondria produce atp ", "Ribosomes", "Golgi body"],
    });
    const result = validateLlmQuestions(payload);
    expect(result).toMatchObject({ ok: false, reason: "q2: duplicate options" });
  });
});
