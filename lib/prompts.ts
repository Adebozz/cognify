export type PhaseNumber = 1 | 2 | 3;

type BuildPromptInput = {
  phase: PhaseNumber;
  weakTopics: string[];
  previousSummary?: string;
  requestedCount?: number;
};

const phaseDetails: Record<PhaseNumber, string> = {
  1: "Knowledge Scan: ask broad questions across the full study material to discover the learner's baseline and weak points. Use mostly easy and medium questions.",
  2: "Weak Spot Drill: ask targeted questions focused on the learner's weak topics. Questions should be more diagnostic and should correct misunderstandings.",
  3: "Final Challenge: ask difficult, multi-concept questions that test whether the learner can combine ideas across the material. Questions should be hard but fair.",
};

export function buildQuestionPrompt(input: BuildPromptInput) {
  const count = input.requestedCount ?? 5;
  const weakText = input.weakTopics.length
    ? `The learner's weak topics so far are: ${input.weakTopics.join(", ")}.`
    : "No weak topics have been detected yet. Cover the whole material evenly.";

  const previous = input.previousSummary
    ? `Previous performance summary: ${input.previousSummary}`
    : "No previous performance summary is available.";

  return `
You are Cognify, an expert exam tutor.

Task:
Generate exactly ${count} multiple-choice exam questions from the uploaded study material.

Current phase:
${phaseDetails[input.phase]}

Adaptive context:
${weakText}
${previous}

Rules:
- Use only the uploaded material as the source of truth.
- Make every question answerable from the material.
- Do not ask questions about missing information.
- Use clear student-friendly wording.
- Each question must have exactly 4 options.
- Only one option should be correct.
- Do not label options with A/B/C/D inside the option text.
- Add a short explanation that teaches the idea.
- Add a sourceHint such as "page 3", "section: model evaluation", "slide 8", or "visible paragraph about...". If no page is visible, use the best descriptive section hint.
- Return JSON only. Do not include markdown.

JSON shape:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctIndex": 0,
      "topic": "string",
      "difficulty": "easy | medium | hard",
      "explanation": "string",
      "sourceHint": "string"
    }
  ]
}
`.trim();
}

export const SYSTEM_PROMPT = `
You are Cognify, an educational AI that creates accurate exam practice from student-uploaded notes.
Be strict about grounding: never invent facts outside the uploaded material.
Return only valid data matching the requested schema.
`.trim();
