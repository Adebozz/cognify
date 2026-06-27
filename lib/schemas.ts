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
