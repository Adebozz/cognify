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

// ---------------------------------------------------------------------------
// Text-based generation (cheap hosted LLM path — cleaned/chunked text input)
// ---------------------------------------------------------------------------

const textPhaseInstructions: Record<PhaseNumber, string> = {
  1: `PHASE 1 — KNOWLEDGE SCAN
Cover the widest possible spread of distinct concepts from the material.
Difficulty mix: 2 easy, 2 medium, 1 hard. Each question must test a DIFFERENT topic.`,
  2: `PHASE 2 — WEAK SPOT DRILL
Focus questions on the learner's weak topics listed in the user message.
If a weak topic is not covered by the material, substitute the closest related concept that is.
Difficulty mix: 1 easy, 3 medium, 1 hard. Questions should diagnose and correct misunderstandings.`,
  3: `PHASE 3 — FINAL CHALLENGE
Ask questions that combine two or more concepts, require applying an idea to a new
situation, or distinguish between closely related ideas.
Difficulty mix: 1 medium, 4 hard. Hard but fair — everything answerable from the material.`,
};

export function buildTextSystemPrompt(phase: PhaseNumber): string {
  return `
You are Cognify, an expert exam-question writer. You receive cleaned text extracted
from a student's study document and must produce exam-quality multiple-choice questions.

${textPhaseInstructions[phase]}

OUTPUT — return ONLY a JSON object, no markdown fences, no commentary:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"topic":"...","difficulty":"easy|medium|hard","explanation":"...","sourceHint":"..."}]}

HARD REQUIREMENTS:
1. Exactly 5 questions. Exactly 4 options each. correctIndex is an integer 0-3.
2. "topic" must be a real, specific concept name from the material (e.g. "convolutional neural networks", "renal filtration"). NEVER vague words like "This", "There", "It", "The document", "General", "Overview".
3. Every question must be fully self-contained and answerable without seeing the document.
4. All 4 options must be plausible, grammatically parallel, and of SIMILAR LENGTH — the correct answer must not stand out by being longer or more detailed.
5. Never quote sentence fragments as options; write complete, natural answer choices.
6. Do not ask about citations, references, authors, journal names, DOIs, figure/table numbers, or page layout.
7. Do not ask "What best describes this?" style questions — name the concept explicitly.
8. "explanation" teaches why the correct answer is right in 1-3 sentences.
9. "sourceHint" is a short pointer like "section on model evaluation" or "paragraph about kidney function".
10. Ground everything in the provided text — never invent facts.

IF THE TEXT IS TOO THIN to write 5 good grounded questions, return exactly:
{"error":"insufficient_content"}
Do not pad with junk questions.
`.trim();
}

export function buildTextUserPrompt(input: {
  text: string;
  documentType: string;
  weakTopics: string[];
  previousSummary?: string;
}): string {
  const weak = input.weakTopics.length
    ? `Learner's weak topics: ${input.weakTopics.join(", ")}.`
    : "No weak topics identified yet.";
  const prev = input.previousSummary
    ? `Previous performance: ${input.previousSummary}`
    : "";
  return `
Document type: ${input.documentType}
${weak}
${prev}

STUDY MATERIAL:
${input.text}
`.trim();
}
