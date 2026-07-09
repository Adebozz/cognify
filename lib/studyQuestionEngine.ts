import type { QuizPayload, QuizQuestion } from "./schemas";

type PhaseNumber = 1 | 2 | 3;

type GenerateInput = {
  text: string;
  fileName: string;
  phase: PhaseNumber;
  weakTopics: string[];
};

type DocumentType =
  | "scientific_article"
  | "project_report"
  | "study_notes"
  | "textbook"
  | "manual"
  | "exam_paper"
  | "slides"
  | "mixed";

type Section = {
  heading: string;
  body: string;
  index: number;
};

type CandidateKind =
  | "definition"
  | "aim"
  | "method"
  | "result"
  | "evaluation"
  | "risk"
  | "application"
  | "process"
  | "comparison"
  | "limitation"
  | "summary";

type Candidate = {
  topic: string;
  question: string;
  correctAnswer: string;
  explanation: string;
  sourceHint: string;
  difficulty: "easy" | "medium" | "hard";
  kind: CandidateKind;
  score: number;
};

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
  "overview",
  "general",
  "article",
  "paper",
  "study",
  "they",
  "them",
  "also",
  "overall",
  "main",
]);

const knownHeadings = new Set([
  "abstract",
  "introduction",
  "background",
  "aim",
  "aims",
  "aims and objectives",
  "objectives",
  "research question",
  "method",
  "methods",
  "methodology",
  "research description",
  "results",
  "discussion",
  "conclusion",
  "evaluation",
  "expected outcomes",
  "risks",
  "limitations",
  "recommendations",
  "summary",
  "key points",
  "learning objectives",
  "case study",
]);

function cleanText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\uFFFE/g, "")
    .replace(/[•●▪]/g, "\n- ")
    .replace(/([a-z])-\s+([a-z])/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function removePdfNoise(text: string) {
  return cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^doi:/i.test(line))
    .filter((line) => !/^nature medicine/i.test(line))
    .filter((line) => !/^articles$/i.test(line))
    .filter((line) => !/^page\s+\d+/i.test(line))
    .filter((line) => !/^\d{3,5}$/.test(line))
    .join("\n");
}

function removeReferenceBlocks(text: string) {
  const lines = removePdfNoise(text).split("\n");
  const kept: string[] = [];
  let skippingReferences = false;

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();

    if (normalized === "references" || normalized === "bibliography") {
      skippingReferences = true;
      continue;
    }

    if (
      skippingReferences &&
      ["methods", "appendix", "supplementary information", "online content"].includes(normalized)
    ) {
      skippingReferences = false;
    }

    if (skippingReferences) continue;

    kept.push(line);
  }

  return kept.join("\n").trim();
}

function cleanSentence(sentence: string) {
  return sentence
    .replace(/\([^)]*\d{4}[^)]*\)/g, "")
    .replace(/\[[0-9,\s-]+\]/g, "")
    .replace(/\b\d{1,3}[-–]\d{1,3}\b/g, "")
    .replace(/\bpp?\.\s*\d+[-–]?\d*/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toUpperCase() === word && word.length <= 8) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function cleanTopic(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9\s/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned
    .split(" ")
    .filter((word) => word.length > 2)
    .filter((word) => !badTopicWords.has(word.toLowerCase()))
    .slice(0, 5);

  if (!words.length) return "";

  return titleCase(words.join(" ")).slice(0, 55);
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
    "core concept",
    "the scope",
    "the aim",
    "overview",
    "general",
  ]);

  if (badExact.has(cleaned)) return true;

  const firstWord = cleaned.split(" ")[0];
  if (badTopicWords.has(firstWord)) return true;

  return false;
}

function sentenceSplit(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 280)
    .filter((sentence) => !/^fig\.?\s*\d+/i.test(sentence))
    .filter((sentence) => !/^table\s*\d+/i.test(sentence));
}

function short(value: string, max = 155) {
  const cleaned = cleanSentence(value);

  if (cleaned.length <= max) return ensureSentenceStart(cleaned);

  return `${ensureSentenceStart(cleaned.slice(0, max - 3).trim())}...`;
}

function ensureSentenceStart(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return cleaned;

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function detectDocumentType(text: string): DocumentType {
  const lower = text.toLowerCase();

  const scientificScore = [
    "abstract",
    "results",
    "methods",
    "discussion",
    "doi",
    "fig.",
    "table 1",
    "journal",
    "confidence interval",
  ].filter((signal) => lower.includes(signal)).length;

  const reportScore = [
    "aims and objectives",
    "research question",
    "expected outcomes",
    "risks",
    "gantt chart",
    "supervisor",
    "methodology",
    "evaluation",
  ].filter((signal) => lower.includes(signal)).length;

  const manualScore = [
    "step",
    "click",
    "select",
    "log in",
    "troubleshooting",
    "install",
    "configure",
    "password",
    "settings",
  ].filter((signal) => lower.includes(signal)).length;

  const examScore = [
    "answer all questions",
    "marks",
    "section a",
    "section b",
    "duration",
    "exam",
    "past paper",
  ].filter((signal) => lower.includes(signal)).length;

  const textbookScore = [
    "chapter",
    "learning objectives",
    "key terms",
    "example",
    "summary",
    "exercise",
  ].filter((signal) => lower.includes(signal)).length;

  const slideScore = [
    "slide",
    "lecture",
    "agenda",
    "today we will",
    "key takeaway",
  ].filter((signal) => lower.includes(signal)).length;

  const scores: Array<[DocumentType, number]> = [
    ["scientific_article", scientificScore],
    ["project_report", reportScore],
    ["manual", manualScore],
    ["exam_paper", examScore],
    ["textbook", textbookScore],
    ["slides", slideScore],
  ];

  const [bestType, bestScore] = scores.sort((a, b) => b[1] - a[1])[0];

  if (bestScore >= 3) return bestType;

  if (lower.includes("revision") || lower.includes("notes") || lower.includes("definition")) {
    return "study_notes";
  }

  return "mixed";
}

function isHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 90) return false;

  const lower = trimmed.toLowerCase();

  if (knownHeadings.has(lower)) return true;
  if (/^\d+\.?\s+[A-Z][A-Za-z\s/&-]{3,}$/.test(trimmed)) return true;
  if (/^[A-Z][A-Z\s/&-]{3,}$/.test(trimmed)) return true;
  if (/^(fig\.|figure|table)\s*\d+/i.test(trimmed)) return true;

  return false;
}

function splitIntoSections(text: string): Section[] {
  const cleaned = removeReferenceBlocks(text);
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);

  const sections: Section[] = [];
  let heading = "Overview";
  let body: string[] = [];

  for (const line of lines) {
    if (isHeading(line)) {
      const joined = body.join(" ").trim();

      if (joined.length > 120) {
        sections.push({
          heading,
          body: joined,
          index: sections.length,
        });
      }

      heading = line.replace(/^\d+\.?\s*/, "").trim();
      body = [];
    } else {
      body.push(line);
    }
  }

  const joined = body.join(" ").trim();

  if (joined.length > 120) {
    sections.push({
      heading,
      body: joined,
      index: sections.length,
    });
  }

  if (!sections.length) {
    const paragraphs = cleaned
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 120);

    paragraphs.slice(0, 10).forEach((paragraph, index) => {
      sections.push({
        heading: index === 0 ? "Overview" : `Section ${index + 1}`,
        body: paragraph,
        index,
      });
    });
  }

  return sections;
}

function pickSentence(section: Section, patterns: RegExp[]) {
  const sentences = sentenceSplit(section.body);

  for (const pattern of patterns) {
    const found = sentences.find((sentence) => pattern.test(sentence));
    if (found) return found;
  }

  return sentences[0] || section.body.slice(0, 220);
}

function createCandidate(args: Omit<Candidate, "score">): Candidate {
  const kindScore: Record<CandidateKind, number> = {
    definition: 85,
    aim: 90,
    method: 88,
    result: 92,
    evaluation: 88,
    risk: 82,
    application: 80,
    process: 82,
    comparison: 80,
    limitation: 78,
    summary: 70,
  };

  return {
    ...args,
    score: kindScore[args.kind] ?? 60,
  };
}

function sectionCandidate(section: Section, docType: DocumentType, fileName: string): Candidate[] {
  const heading = section.heading.toLowerCase();
  const topicFromHeading = cleanTopic(section.heading);
  const candidates: Candidate[] = [];

  if (docType === "project_report") {
    if (heading.includes("aim") || heading.includes("objective") || heading.includes("research question")) {
      const answer = short(
        pickSentence(section, [/aim/i, /objective/i, /research question/i, /design/i, /evaluate/i])
      );

      candidates.push(createCandidate({
        topic: "Project Aim",
        question: "What is the main aim of this project?",
        correctAnswer: answer,
        explanation: `The aim/objectives section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "aim",
      }));
    }

    if (heading.includes("method") || heading.includes("research description")) {
      const answer = short(
        pickSentence(section, [/method/i, /pipeline/i, /classifier/i, /data/i, /implementation/i, /retrieval/i])
      );

      candidates.push(createCandidate({
        topic: "Methodology",
        question: "Which statement best describes the proposed method?",
        correctAnswer: answer,
        explanation: `The methodology/research description section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "method",
      }));
    }

    if (heading.includes("evaluation")) {
      const answer = short(
        pickSentence(section, [/evaluate/i, /metric/i, /accuracy/i, /faithfulness/i, /precision/i, /latency/i])
      );

      candidates.push(createCandidate({
        topic: "Evaluation",
        question: "How will the project be evaluated?",
        correctAnswer: answer,
        explanation: `The evaluation section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "evaluation",
      }));
    }

    if (heading.includes("risk")) {
      const answer = short(
        pickSentence(section, [/risk/i, /contingency/i, /limitation/i, /constraint/i])
      );

      candidates.push(createCandidate({
        topic: "Risks",
        question: "Which risk or limitation is identified in the project?",
        correctAnswer: answer,
        explanation: `The risks section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "risk",
      }));
    }
  }

  if (docType === "scientific_article") {
    if (heading.includes("abstract") || heading.includes("overview") || heading.includes("introduction")) {
      const answer = short(
        pickSentence(section, [/here,? we/i, /we examine/i, /we investigate/i, /this work/i, /this study/i, /main/i])
      );

      candidates.push(createCandidate({
        topic: "Research Focus",
        question: "What is the main focus of the paper?",
        correctAnswer: answer,
        explanation: `The abstract/introduction supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "aim",
      }));
    }

    if (heading.includes("results")) {
      const answer = short(
        pickSentence(section, [/we find/i, /we found/i, /results/i, /observed/i, /demonstrate/i, /higher/i])
      );

      candidates.push(createCandidate({
        topic: "Main Finding",
        question: "Which statement best represents a main finding of the paper?",
        correctAnswer: answer,
        explanation: `The results section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "result",
      }));
    }

    if (heading.includes("method")) {
      const answer = short(
        pickSentence(section, [/dataset/i, /train/i, /measure/i, /model/i, /evaluate/i, /we use/i])
      );

      candidates.push(createCandidate({
        topic: "Method",
        question: "Which statement best describes the method used in the paper?",
        correctAnswer: answer,
        explanation: `The methods section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "method",
      }));
    }

    if (heading.includes("discussion") || heading.includes("conclusion")) {
      const answer = short(
        pickSentence(section, [/therefore/i, /suggest/i, /ethical/i, /important/i, /limitation/i, /future/i])
      );

      candidates.push(createCandidate({
        topic: "Implication",
        question: "What implication or conclusion does the paper discuss?",
        correctAnswer: answer,
        explanation: `The discussion/conclusion section supports this answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "hard",
        kind: "application",
      }));
    }
  }

  if (docType === "manual") {
    const answer = short(
      pickSentence(section, [/click/i, /select/i, /open/i, /enter/i, /log in/i, /configure/i, /install/i])
    );

    if (topicFromHeading && answer.length > 25) {
      candidates.push(createCandidate({
        topic: topicFromHeading,
        question: `What should a user do in the ${topicFromHeading} section?`,
        correctAnswer: answer,
        explanation: `The guide gives this instruction: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "easy",
        kind: "process",
      }));
    }
  }

  if (docType === "exam_paper") {
    const answer = short(
      pickSentence(section, [/explain/i, /calculate/i, /discuss/i, /compare/i, /define/i, /evaluate/i])
    );

    if (topicFromHeading && answer.length > 25) {
      candidates.push(createCandidate({
        topic: topicFromHeading,
        question: `What skill or topic is being tested in the ${topicFromHeading} section?`,
        correctAnswer: answer,
        explanation: `This appears to be tested by the question content: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "summary",
      }));
    }
  }

  if (["study_notes", "textbook", "slides", "mixed"].includes(docType)) {
    const answer = short(
      pickSentence(section, [/is/i, /are/i, /means/i, /because/i, /used/i, /important/i, /example/i, /therefore/i])
    );

    if (topicFromHeading && answer.length > 25) {
      candidates.push(createCandidate({
        topic: topicFromHeading,
        question: `What is the key idea in the ${topicFromHeading} section?`,
        correctAnswer: answer,
        explanation: `This section supports the answer: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "summary",
      }));
    }
  }

  return candidates;
}

function extractTopicFromSentence(sentence: string) {
  const cleaned = cleanSentence(sentence);

  const definedMatch = cleaned.match(/(.{0,90})\b(defined as|is defined as|refers to|means|is|are)\b(.+)/i);

  if (definedMatch) {
    const before = definedMatch[1]
      .split(/[.;,]/)
      .pop()
      ?.trim() || "";

    const topic = cleanTopic(before.split(/\s+/).slice(-4).join(" "));

    if (!isBadTopic(topic)) {
      return {
        topic,
        answer: definedMatch[3].trim(),
      };
    }
  }

  const namedTerm = cleaned.match(/\b([A-Z][A-Za-z0-9-]{3,}(?:\s+[A-Z]?[A-Za-z0-9-]{3,}){0,3})\b/);

  if (namedTerm) {
    const topic = cleanTopic(namedTerm[1]);

    if (!isBadTopic(topic)) {
      return {
        topic,
        answer: cleaned,
      };
    }
  }

  return null;
}

function conceptCandidates(sections: Section[], fileName: string): Candidate[] {
  const candidates: Candidate[] = [];

  for (const section of sections) {
    const sentences = sentenceSplit(section.body);

    for (const sentence of sentences) {
      const extracted = extractTopicFromSentence(sentence);
      if (!extracted) continue;

      const topic = extracted.topic;
      const answer = short(extracted.answer);

      if (isBadTopic(topic)) continue;
      if (answer.length < 25) continue;

      candidates.push(createCandidate({
        topic,
        question: `What best describes ${topic}?`,
        correctAnswer: answer,
        explanation: `The uploaded material describes ${topic} as: ${answer}`,
        sourceHint: `${fileName} — ${section.heading}`,
        difficulty: "medium",
        kind: "definition",
      }));
    }
  }

  return candidates;
}

function buildAllCandidates(text: string, fileName: string) {
  const cleaned = removeReferenceBlocks(text);
  const docType = detectDocumentType(cleaned);
  const sections = splitIntoSections(cleaned);

  const sectionCandidates = sections.flatMap((section) =>
    sectionCandidate(section, docType, fileName)
  );

  const concepts = conceptCandidates(sections, fileName);

  return {
    docType,
    candidates: dedupeCandidates([...sectionCandidates, ...concepts]),
  };
}

function dedupeCandidates(candidates: Candidate[]) {
  const seen = new Set<string>();
  const result: Candidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.topic}-${candidate.question}`.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);

    if (!isGoodCandidate(candidate)) continue;

    result.push(candidate);
  }

  return result.sort((a, b) => b.score - a.score).slice(0, 80);
}

function isGoodCandidate(candidate: Candidate) {
  if (isBadTopic(candidate.topic)) return false;
  if (!candidate.question.includes("?")) return false;
  if (candidate.correctAnswer.length < 25) return false;
  if (candidate.correctAnswer.length > 220) return false;
  if (/https?:\/\//i.test(candidate.correctAnswer)) return false;
  if (/references|bibliography/i.test(candidate.sourceHint)) return false;
  if (/what best describes (this|there|these|those)/i.test(candidate.question)) return false;
  if (/^\W+$/.test(candidate.correctAnswer)) return false;

  return true;
}

function shuffle<T>(items: T[]) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[r]] = [arr[r], arr[i]];
  }

  return arr;
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

function genericDistractors(candidate: Candidate) {
  const topic = candidate.topic;

  const byKind: Record<CandidateKind, string[]> = {
    definition: [
      `${topic} is unrelated to the main material in the uploaded document.`,
      `${topic} only refers to a formatting label rather than a concept.`,
      `${topic} is mainly about guessing the answer from keywords.`,
    ],
    aim: [
      "The document has no clear purpose beyond listing unrelated facts.",
      "The main aim is only to provide references without an argument.",
      "The aim is to avoid evaluating or explaining the topic.",
    ],
    method: [
      "The method relies only on guessing without using evidence.",
      "The method avoids data, examples, or structured analysis.",
      "The document does not describe any process or approach.",
    ],
    result: [
      "The document reports that no meaningful result was observed.",
      "The result is unrelated to the problem discussed in the document.",
      "The finding is based only on the title, not the document content.",
    ],
    evaluation: [
      "The system is evaluated only by counting the number of pages.",
      "The evaluation ignores accuracy, quality, or performance.",
      "The document does not mention any evaluation approach.",
    ],
    risk: [
      "The document identifies no limitation or possible issue.",
      "The risk is that the topic is too easy to understand.",
      "The only risk is the document having too many pages.",
    ],
    application: [
      "The implication is unrelated to real-world use.",
      "The document says the topic has no practical importance.",
      "The application is based on unrelated examples only.",
    ],
    process: [
      "The process should be followed in a random order.",
      "The document gives no meaningful steps or sequence.",
      "The process is based only on memorising the title.",
    ],
    comparison: [
      "The comparison shows the two ideas are completely unrelated.",
      "The document compares only font size and layout.",
      "The comparison is not connected to the main topic.",
    ],
    limitation: [
      "The limitation is that the document explains too much detail.",
      "The document says there are no constraints at all.",
      "The limitation is unrelated to the topic being studied.",
    ],
    summary: [
      "The section has no clear idea or learning point.",
      "The key idea is unrelated to the uploaded material.",
      "The section only provides decorative information.",
    ],
  };

  return byKind[candidate.kind];
}

function makeOptions(candidate: Candidate, all: Candidate[]) {
  const candidatePool = all
    .filter((item) => item !== candidate)
    .filter((item) => item.correctAnswer !== candidate.correctAnswer)
    .filter((item) => item.correctAnswer.length >= 25)
    .map((item) => item.correctAnswer);

  const options = unique([
    candidate.correctAnswer,
    ...shuffle(candidatePool),
    ...genericDistractors(candidate),
  ]).slice(0, 4);

  while (options.length < 4) {
    options.push("This option is not strongly supported by the uploaded material.");
  }

  const shuffled = shuffle(options);
  const correctIndex = shuffled.findIndex((option) => option === candidate.correctAnswer);

  return {
    options: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

function selectCandidates(candidates: Candidate[], phase: PhaseNumber, weakTopics: string[]) {
  let pool = candidates.filter(isGoodCandidate);

  if (phase === 2 && weakTopics.length) {
    const weak = weakTopics
      .filter((topic) => !isBadTopic(topic))
      .map((topic) => topic.toLowerCase());

    const focused = pool.filter((candidate) =>
      weak.some(
        (topic) =>
          candidate.topic.toLowerCase().includes(topic) ||
          candidate.question.toLowerCase().includes(topic)
      )
    );

    if (focused.length >= 3) {
      pool = [...focused, ...pool];
    }
  }

  const preferredKinds: Record<PhaseNumber, CandidateKind[]> = {
    1: ["aim", "definition", "summary", "method", "result", "evaluation"],
    2: ["definition", "process", "method", "evaluation", "risk", "summary"],
    3: ["result", "application", "evaluation", "comparison", "limitation", "method"],
  };

  const selected: Candidate[] = [];
  const usedTopics = new Set<string>();

  for (const kind of preferredKinds[phase]) {
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
    if (usedTopics.has(candidate.topic)) continue;

    selected.push(candidate);
    usedTopics.add(candidate.topic);

    if (selected.length === 5) break;
  }

  return selected;
}

function toQuizQuestion(candidate: Candidate, all: Candidate[], phase: PhaseNumber): QuizQuestion {
  const { options, correctIndex } = makeOptions(candidate, all);

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

function isGoodQuestion(question: QuizQuestion) {
  if (isBadTopic(question.topic)) return false;
  if (/what best describes (this|there|these|those)/i.test(question.question)) return false;
  if (question.options.length !== 4) return false;
  if (question.options.some((option) => option.length < 15)) return false;
  if (question.correctIndex < 0 || question.correctIndex > 3) return false;

  return true;
}

export function generateQuestionsFromStudyText(input: GenerateInput): QuizPayload {
  const cleaned = removeReferenceBlocks(input.text);
  const { candidates } = buildAllCandidates(cleaned, input.fileName);

  if (candidates.length < 5) {
    return { questions: [] };
  }

  const selected = selectCandidates(candidates, input.phase, input.weakTopics);

  const questions = selected
    .map((candidate) => toQuizQuestion(candidate, candidates, input.phase))
    .filter(isGoodQuestion)
    .slice(0, 5);

  if (questions.length < 5) {
    return { questions: [] };
  }

  return { questions };
}