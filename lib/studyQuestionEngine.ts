import type { QuizPayload, QuizQuestion } from "./schemas";

type PhaseNumber = 1 | 2 | 3;

type GenerateInput = {
  text: string;
  fileName: string;
  phase: PhaseNumber;
  weakTopics: string[];
};

type DocType = "academic_report" | "study_notes" | "slides" | "general";

type Section = {
  heading: string;
  body: string;
};

type Candidate = {
  topic: string;
  question: string;
  correctAnswer: string;
  explanation: string;
  sourceHint: string;
  difficulty: "easy" | "medium" | "hard";
  kind: "aim" | "objective" | "method" | "evaluation" | "risk" | "definition" | "benefit" | "general";
};

const referenceHeadings = [
  "references",
  "bibliography",
  "appendix",
  "appendices",
];

const reportHeadings = [
  "background",
  "aims and objectives",
  "objectives",
  "research description",
  "evaluation",
  "expected outcomes",
  "risks",
  "research time plan",
  "methodology",
];

const badTopicWords = new Set([
  "this",
  "these",
  "those",
  "there",
  "their",
  "because",
  "however",
  "therefore",
  "important",
  "project",
  "system",
  "include",
  "includes",
  "showed",
  "results",
  "background",
  "chapter",
  "section",
  "scope",
  "the",
  "a",
  "an",
  "it",
  "its",
  "they",
  "them",
  "also",
  "overall",
  "main",
]);

function cleanText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[•●▪]/g, "\n- ")
    .replace(/\u0000/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripReferences(text: string) {
  const lines = cleanText(text).split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();

    if (referenceHeadings.includes(normalized)) {
      break;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}

function removeAcademicNoise(text: string) {
  return stripReferences(text)
    .replace(/\([^)]*\d{4}[^)]*\)/g, "")
    .replace(/\[[0-9,\s-]+\]/g, "")
    .replace(/\bpp?\.\s*\d+[-–]?\d*/gi, "")
    .replace(/available at:\s*\S+/gi, "")
    .replace(/accessed:\s*[^.]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDocType(text: string): DocType {
  const lower = text.toLowerCase();

  const reportScore = reportHeadings.filter((h) => lower.includes(h)).length;

  if (reportScore >= 3) return "academic_report";
  if (lower.includes("slide") || lower.includes("lecture")) return "slides";
  if (lower.includes("key points") || lower.includes("summary") || lower.includes("revision")) return "study_notes";

  return "general";
}

function isHeading(line: string) {
  const trimmed = line.trim();

  if (!trimmed) return false;
  if (trimmed.length > 80) return false;

  const lower = trimmed.toLowerCase();

  if (reportHeadings.includes(lower)) return true;
  if (/^[A-Z][A-Z\s/&-]{3,}$/.test(trimmed)) return true;
  if (/^\d+\.?\s+[A-Z]/.test(trimmed)) return true;

  return false;
}

function splitIntoSections(rawText: string): Section[] {
  const text = stripReferences(rawText);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const sections: Section[] = [];
  let currentHeading = "Overview";
  let body: string[] = [];

  for (const line of lines) {
    if (isHeading(line)) {
      if (body.join(" ").trim().length > 80) {
        sections.push({
          heading: currentHeading,
          body: body.join(" ").trim(),
        });
      }

      currentHeading = line.replace(/^\d+\.?\s*/, "").trim();
      body = [];
    } else {
      body.push(line);
    }
  }

  if (body.join(" ").trim().length > 80) {
    sections.push({
      heading: currentHeading,
      body: body.join(" ").trim(),
    });
  }

  if (!sections.length) {
    sections.push({
      heading: "Overview",
      body: text,
    });
  }

  return sections;
}

function sentenceSplit(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 50 && s.length <= 260);
}

function short(text: string, max = 150) {
  const cleaned = removeAcademicNoise(text);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3).trim()}...`;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toUpperCase() === word && word.length <= 6) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function cleanTopic(value: string) {
  return titleCase(
    value
      .replace(/[^a-zA-Z0-9\s/&-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 45)
  ) || "Core Concept";
}

function isBadTopic(topic: string) {
  const cleaned = topic.toLowerCase().trim();

  if (!cleaned) return true;
  if (cleaned.length < 4) return true;

  const badExact = new Set([
    "this",
    "there",
    "these",
    "those",
    "the scope",
    "the aim",
    "core concept",
    "general",
    "overview",
  ]);

  if (badExact.has(cleaned)) return true;

  const firstWord = cleaned.split(" ")[0];
  if (badTopicWords.has(firstWord)) return true;

  return false;
}

function pickSentence(section: Section, matchers: RegExp[]) {
  const sentences = sentenceSplit(section.body);

  for (const matcher of matchers) {
    const found = sentences.find((s) => matcher.test(s));
    if (found) return found;
  }

  return sentences[0] || section.body.slice(0, 220);
}

function makeOptionSet(correct: string, distractors: string[]) {
  const options = unique([correct, ...distractors])
    .filter((o) => o.length >= 15)
    .slice(0, 4);

  while (options.length < 4) {
    options.push("This is not strongly supported by the uploaded material.");
  }

  const shuffled = shuffle(options);
  const correctIndex = shuffled.findIndex((o) => o === correct);

  return {
    options: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

function unique(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = value.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffle<T>(items: T[]) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[r]] = [arr[r], arr[i]];
  }

  return arr;
}

function allSectionSummaries(sections: Section[]) {
  return sections.map((s) => short(pickSentence(s, [/./]), 145));
}

function reportCandidates(sections: Section[], fileName: string): Candidate[] {
  const allDistractors = allSectionSummaries(sections);
  const candidates: Candidate[] = [];

  for (const section of sections) {
    const heading = section.heading.toLowerCase();
    const topic = cleanTopic(section.heading);

    if (heading.includes("aim") || heading.includes("objective")) {
      const answer = short(
        pickSentence(section, [/aim/i, /objective/i, /design/i, /implement/i, /evaluate/i]),
        150
      );

      candidates.push({
        topic: "Project Aim",
        question: "What is the main aim or objective of this project?",
        correctAnswer: answer,
        explanation: `The aims/objectives section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "aim",
      });
    }

    if (heading.includes("background")) {
      const answer = short(
        pickSentence(section, [/problem/i, /challenge/i, /large language models/i, /retrieval/i]),
        150
      );

      candidates.push({
        topic: "Background",
        question: "Which statement best explains the problem background?",
        correctAnswer: answer,
        explanation: `The background section explains the context using this point: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "general",
      });
    }

    if (heading.includes("research description") || heading.includes("methodology")) {
      const answer = short(
        pickSentence(section, [/pipeline/i, /classifier/i, /retrieval/i, /data/i, /technology/i]),
        150
      );

      candidates.push({
        topic: "Methodology",
        question: "Which statement best describes the proposed method or system design?",
        correctAnswer: answer,
        explanation: `The research description/methodology section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "method",
      });
    }

    if (heading.includes("evaluation")) {
      const answer = short(
        pickSentence(section, [/faithfulness/i, /accuracy/i, /precision/i, /latency/i, /metric/i, /RAGAS/i]),
        150
      );

      candidates.push({
        topic: "Evaluation",
        question: "How is the system expected to be evaluated?",
        correctAnswer: answer,
        explanation: `The evaluation section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "evaluation",
      });
    }

    if (heading.includes("expected outcome")) {
      const answer = short(
        pickSentence(section, [/outperform/i, /BM25/i, /deliverable/i, /classifier/i]),
        150
      );

      candidates.push({
        topic: "Expected Outcomes",
        question: "What is one expected outcome or deliverable of the project?",
        correctAnswer: answer,
        explanation: `The expected outcomes section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "benefit",
      });
    }

    if (heading.includes("risk")) {
      const answer = short(
        pickSentence(section, [/risk/i, /contingency/i, /limitation/i, /constraint/i]),
        150
      );

      candidates.push({
        topic: "Risks",
        question: "Which risk or limitation is identified in the project?",
        correctAnswer: answer,
        explanation: `The risks section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "risk",
      });
    }
  }

  const extra = conceptCandidates(sections, fileName).slice(0, 8);

  return [...candidates, ...extra].map((c) => ({
    ...c,
    correctAnswer: short(c.correctAnswer, 150),
  })).filter((c) => c.correctAnswer.length > 25 && allDistractors.length);
}

function conceptCandidates(sections: Section[], fileName: string): Candidate[] {
  const candidates: Candidate[] = [];

  for (const section of sections) {
    const sentences = sentenceSplit(section.body);

    for (const sentence of sentences) {
      const cleaned = removeAcademicNoise(sentence);

      const def = cleaned.match(/\b([A-Z][A-Za-z0-9\s-]{2,45})\s+(is|are|refers to|means|addresses|provides|supports|uses)\s+(.+)/i);

      if (!def) continue;

      const rawTopic = def[1];
      const topic = cleanTopic(rawTopic);
      const answer = short(def[3], 145);

      if (isBadTopic(topic) || answer.length < 25) continue;;

      candidates.push({
        topic,
        question: `What best describes ${topic}?`,
        correctAnswer: answer,
        explanation: `The uploaded material describes ${topic} as: ${answer}`,
        sourceHint: `${fileName} — ${section.heading} section`,
        difficulty: "medium",
        kind: "definition",
      });
    }
  }

  return candidates;
}

function generalCandidates(sections: Section[], fileName: string): Candidate[] {
  const candidates: Candidate[] = [];

  for (const section of sections) {
    const topic = cleanTopic(section.heading);
    const answer = short(pickSentence(section, [/important/i, /because/i, /used/i, /helps/i, /should/i, /main/i]), 150);

    if (answer.length < 25) continue;

    candidates.push({
      topic,
      question: `What is the key idea in the ${topic} section?`,
      correctAnswer: answer,
      explanation: `This question is based on the ${section.heading} section: ${answer}`,
      sourceHint: `${fileName} — ${section.heading} section`,
      difficulty: "medium",
      kind: "general",
    });
  }

  return [...candidates, ...conceptCandidates(sections, fileName)];
}

function selectForPhase(candidates: Candidate[], phase: PhaseNumber, weakTopics: string[]) {
    candidates = candidates.filter((candidate) => !isBadTopic(candidate.topic));
  
    let pool = candidates;

  if (phase === 2 && weakTopics.length) {
    const weak = weakTopics.map((w) => w.toLowerCase());

    const focused = candidates.filter((c) =>
      weak.some((w) => c.topic.toLowerCase().includes(w) || c.question.toLowerCase().includes(w))
    );

    if (focused.length >= 3) {
      pool = [...focused, ...candidates];
    }
  }

  const order =
    phase === 1
      ? ["aim", "definition", "method", "evaluation", "general", "risk", "benefit"]
      : phase === 2
        ? ["definition", "method", "evaluation", "risk", "general", "benefit", "aim"]
        : ["evaluation", "benefit", "method", "risk", "aim", "definition", "general"];

  const selected: Candidate[] = [];
  const usedTopics = new Set<string>();

  for (const kind of order) {
    for (const candidate of pool) {
      if (candidate.kind !== kind) continue;
      if (usedTopics.has(candidate.topic)) continue;

      selected.push(candidate);
      usedTopics.add(candidate.topic);

      if (selected.length === 5) return selected;
    }
  }

  for (const candidate of pool) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length === 5) break;
  }

  return selected;
}

function buildQuestion(candidate: Candidate, allCandidates: Candidate[], phase: PhaseNumber): QuizQuestion {
  const distractors = allCandidates
    .filter((c) => c !== candidate)
    .filter((c) => c.correctAnswer !== candidate.correctAnswer)
    .map((c) => c.correctAnswer);

  const generic = [
    "This is not the main point made in the uploaded material.",
    "This statement is too general and is not clearly supported by the document.",
    "This option changes the meaning of the document’s argument.",
  ];

  const { options, correctIndex } = makeOptionSet(candidate.correctAnswer, [
    ...shuffle(distractors),
    ...generic,
  ]);

  return {
    question:
      phase === 1
        ? candidate.question
        : phase === 2
          ? `Weak spot drill: ${candidate.question}`
          : `Final challenge: ${candidate.question}`,
    options,
    correctIndex,
    topic: candidate.topic,
    difficulty: phase === 3 ? "hard" : candidate.difficulty,
    explanation: candidate.explanation,
    sourceHint: candidate.sourceHint,
  };
}

function fallbackPayload(fileName: string): QuizPayload {
  return {
    questions: [
      {
        question: "What should Cognify do when analysing a study document?",
        options: [
          "Identify meaningful sections and generate revision questions from them",
          "Use unrelated questions that are not connected to the uploaded file",
          "Only count the pages without reading the text",
          "Generate answers from the reference list only",
        ],
        correctIndex: 0,
        topic: "Document Understanding",
        difficulty: "easy",
        explanation: "Cognify should use meaningful content from the uploaded document to create revision questions.",
        sourceHint: fileName,
      },
    ],
  };
}

export function generateQuestionsFromStudyText(input: GenerateInput): QuizPayload {
  const cleaned = cleanText(input.text);
  const docType = detectDocType(cleaned);
  const sections = splitIntoSections(cleaned);

  const candidates =
    docType === "academic_report"
      ? reportCandidates(sections, input.fileName)
      : generalCandidates(sections, input.fileName);

  if (candidates.length < 5) {
    return fallbackPayload(input.fileName);
  }

  const selected = selectForPhase(candidates, input.phase, input.weakTopics);
  const questions = selected
    .filter((candidate) => !isBadTopic(candidate.topic))
    .map((candidate) => buildQuestion(candidate, candidates, input.phase))
    .filter((question) => {
        const q = question.question.toLowerCase();

        if (q.includes("what best describes this")) return false;
        if (q.includes("what best describes there")) return false;
        if (q.includes("weak spot drill: what best describes this")) return false;
        if (question.options.some((opt) => opt.length < 12)) return false;

        return true;
    })
    .slice(0, 5);
    if (questions.length < 5) {
    const backup = selected
        .map((candidate) => buildQuestion(candidate, candidates, input.phase))
        .filter((question) => !isBadTopic(question.topic))
        .slice(0, 5);

    return { questions: backup };
    }
  return { questions };
}