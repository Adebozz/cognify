import type { QuizQuestion } from "@/lib/schemas";

/** A question that passes both the Zod shape and the LLM quality guards. */
export function makeQuestion(overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    question: "What does underdiagnosis bias describe in clinical AI models?",
    options: [
      "Systematic failure to detect disease in certain subgroups",
      "Random noise introduced during image acquisition",
      "Overfitting caused by too many training epochs",
      "Latency introduced by running models on edge devices",
    ],
    correctIndex: 0,
    topic: "Underdiagnosis Bias",
    difficulty: "medium",
    explanation: "Underdiagnosis bias is the systematic failure to detect disease in specific patient subgroups.",
    sourceHint: "Abstract",
    ...overrides,
  };
}

export function makeLlmPayload(count = 5, overrides: Partial<QuizQuestion> = {}) {
  return {
    questions: Array.from({ length: count }, (_, i) =>
      makeQuestion({ topic: `Topic Number ${i + 1}`, ...overrides })
    ),
  };
}

/** Realistic study text long enough to pass the route's 300-char minimum. */
export const STUDY_TEXT = `
Chapter 1: Photosynthesis

Learning objectives
Photosynthesis is defined as the process by which green plants convert light energy into chemical energy stored in glucose. It takes place in the chloroplast, which contains the pigment chlorophyll.

The light-dependent reactions occur in the thylakoid membranes. Water is split, which releases oxygen as a by-product, and ATP and NADPH are produced because light energy excites electrons in chlorophyll.

The Calvin cycle refers to the light-independent reactions that take place in the stroma. Carbon dioxide is fixed by the enzyme RuBisCO, and as a result glucose is eventually produced using ATP and NADPH from the light reactions.

Limiting factors such as light intensity, carbon dioxide concentration and temperature control the rate of photosynthesis. For example, increasing light intensity raises the rate until another factor becomes limiting, whereas very high temperatures denature enzymes.

Cellular respiration is known as the process that releases energy from glucose. In contrast to photosynthesis, respiration consumes oxygen and produces carbon dioxide, therefore the two processes are complementary in the carbon cycle.

Key terms
Chlorophyll is called the primary photosynthetic pigment. Stomata are pores on the leaf surface that allow gas exchange; the purpose of the guard cells is to open and close the stomata to regulate water loss.

Exercises
Explain why the rate of photosynthesis levels off at high light intensity. Compare the inputs and outputs of photosynthesis with those of aerobic respiration.
`.trim();
