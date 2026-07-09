import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const QuestionSchema = z.object({
  question: z.string().min(12),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  topic: z.string().min(2),
  difficulty: DifficultySchema,
  explanation: z.string().min(20),
  sourceHint: z.string().min(2).describe("A short reference to where the answer came from, for example page/section/chapter if visible."),
});

export const QuizPayloadSchema = z.object({
  questions: z.array(QuestionSchema).min(3).max(8),
});

export type QuizQuestion = z.infer<typeof QuestionSchema>;
export type QuizPayload = z.infer<typeof QuizPayloadSchema>;

// ---------------------------------------------------------------------------
// LLM output quality guards (beyond shape): reject vague topics, citation
// questions, and giveaway options where the correct answer is far longer.
// ---------------------------------------------------------------------------

/** Exactly 5 questions required from the LLM path. */
export const LlmQuizPayloadSchema = z.object({
  questions: z.array(QuestionSchema).length(5),
});

const VAGUE_TOPICS = new Set([
  "this", "that", "there", "it", "these", "those",
  "the document", "the text", "the material", "the paper", "the study",
  "general", "overview", "introduction", "miscellaneous", "misc",
  "content", "information", "topic", "subject", "document", "text",
]);

const CITATION_RE =
  /\b(doi|issn|isbn)\b|\b10\.\d{4,9}\/|\bet al\.?\b|\b(figure|table)\s+\d+\b|\bpage\s+\d+\b|\breferences?\s+section\b|\bjournal of\b|\bvol\.\s*\d+/i;

export type QualityCheckResult =
  | { ok: true; payload: QuizPayload }
  | { ok: false; reason: string };

/** Validate parsed-JSON LLM output: shape + quality heuristics. */
export function validateLlmQuestions(data: unknown): QualityCheckResult {
  const shape = LlmQuizPayloadSchema.safeParse(data);
  if (!shape.success) {
    return { ok: false, reason: `shape: ${shape.error.issues[0]?.message ?? "invalid"}` };
  }

  for (const [i, q] of shape.data.questions.entries()) {
    const topic = q.topic.trim().toLowerCase();
    if (VAGUE_TOPICS.has(topic) || topic.length < 3) {
      return { ok: false, reason: `q${i + 1}: vague topic "${q.topic}"` };
    }
    if (CITATION_RE.test(q.question)) {
      return { ok: false, reason: `q${i + 1}: citation/reference question` };
    }
    const correct = q.options[q.correctIndex];
    const others = q.options.filter((_, idx) => idx !== q.correctIndex);
    const avgOther = others.reduce((n, o) => n + o.length, 0) / others.length;
    if (correct.length > 40 && correct.length > avgOther * 3) {
      return { ok: false, reason: `q${i + 1}: correct option is a giveaway (3x longer)` };
    }
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size < 4) {
      return { ok: false, reason: `q${i + 1}: duplicate options` };
    }
  }

  return { ok: true, payload: shape.data };
}
