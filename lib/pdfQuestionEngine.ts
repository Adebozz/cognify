import type { QuizPayload, QuizQuestion } from "./schemas";

type PhaseNumber = 1 | 2 | 3;

type GenerateInput = {
  text: string;
  fileName: string;
  phase: PhaseNumber;
  weakTopics: string[];
};

type QuestionCandidate = {
  topic: string;
  questionStem: string;
  correctAnswer: string;
  explanation: string;
  sourceText: string;
  type: "definition" | "purpose" | "process" | "benefit" | "comparison" | "general";
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
]);

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "your",
  "you",
  "are",
  "was",
  "were",
  "been",
  "have",
  "has",
  "will",
  "can",
  "may",
  "not",
  "also",
  "when",
  "where",
  "which",
  "their",
  "there",
  "using",
  "used",
  "based",
  "within",
  "between",
  "through",
]);

function cleanText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[•●▪]/g, ". ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanSentence(sentence: string) {
  return sentence
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\d{4}[^)]*\)/g, "")
    .trim();
}

function splitSentences(text: string) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((s) => s.length >= 70 && s.length <= 280)
    .filter((s) => !/^(page|figure|table|references|bibliography)\b/i.test(s))
    .filter((s) => !/https?:\/\//i.test(s))
    .filter((s) => !/^\d+(\.\d+)*\s/.test(s));
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toUpperCase() === word && word.length <= 5) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normaliseTopic(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9\s/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned
    .split(" ")
    .filter((word) => word.length > 2)
    .filter((word) => !badTopicWords.has(word.toLowerCase()))
    .slice(0, 4);

  if (!words.length) return "Core Concept";

  return titleCase(words.join(" ")).slice(0, 45);
}

function extractNounPhrase(sentence: string) {
  const patterns = [
    /^([A-Z][A-Za-z0-9\s/&-]{3,60})\s+(is|are|refers to|means|describes|involves|allows|enables|helps|uses|provides)\b/i,
    /\b([A-Z][A-Za-z0-9\s/&-]{3,60})\s+(is|are|refers to|means|describes|involves|allows|enables|helps|uses|provides)\b/i,
    /\b(the|a|an)\s+([A-Za-z][A-Za-z0-9\s/&-]{4,55})\s+(is|are|helps|allows|enables|provides|supports)\b/i,
  ];

  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (match) {
      const raw = match[2] && ["the", "a", "an"].includes(match[1]?.toLowerCase())
        ? match[2]
        : match[1];

      const topic = normaliseTopic(raw);
      if (topic !== "Core Concept") return topic;
    }
  }

  const words = sentence
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 4)
    .filter((w) => !stopWords.has(w))
    .filter((w) => !badTopicWords.has(w));

  const counts = new Map<string, number>();

  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const best = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 2)
    .join(" ");

  return normaliseTopic(best || "Core Concept");
}

function afterMatch(sentence: string, regex: RegExp) {
  const match = sentence.match(regex);
  if (!match) return null;

  const answer = match[match.length - 1]?.trim();
  if (!answer || answer.length < 25) return null;

  return answer.replace(/\.$/, "");
}

function shorten(value: string, max = 145) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3).trim()}...`;
}

function buildCandidate(sentence: string): QuestionCandidate | null {
  const topic = extractNounPhrase(sentence);

  if (!topic || topic === "Core Concept") return null;

  const definitionAnswer = afterMatch(
    sentence,
    /\b(?:is|are|refers to|means|describes)\s+(.+)/i
  );

  if (definitionAnswer) {
    return {
      topic,
      type: "definition",
      questionStem: `What best describes ${topic}?`,
      correctAnswer: shorten(definitionAnswer),
      explanation: `${topic} is described in the uploaded material as: ${shorten(definitionAnswer, 180)}`,
      sourceText: sentence,
    };
  }

  const purposeAnswer = afterMatch(
    sentence,
    /\b(?:is used to|are used to|helps to|help to|allows|allow|enables|enable|supports|support)\s+(.+)/i
  );

  if (purposeAnswer) {
    return {
      topic,
      type: "purpose",
      questionStem: `What is the main purpose of ${topic}?`,
      correctAnswer: shorten(purposeAnswer),
      explanation: `The material links ${topic} to this purpose: ${shorten(purposeAnswer, 180)}`,
      sourceText: sentence,
    };
  }

  const benefitAnswer = afterMatch(
    sentence,
    /\b(?:improves|improve|reduces|reduce|increases|increase|prevents|prevent|addresses|address|solves|solve)\s+(.+)/i
  );

  if (benefitAnswer) {
    return {
      topic,
      type: "benefit",
      questionStem: `What effect does ${topic} have according to the material?`,
      correctAnswer: shorten(benefitAnswer),
      explanation: `The material presents ${topic} as having this effect: ${shorten(benefitAnswer, 180)}`,
      sourceText: sentence,
    };
  }

  const processAnswer = afterMatch(
    sentence,
    /\b(?:first|then|after|before|during|when|once)\s+(.+)/i
  );

  if (processAnswer) {
    return {
      topic,
      type: "process",
      questionStem: `Which statement best explains how ${topic} works in context?`,
      correctAnswer: shorten(sentence),
      explanation: `The process is explained by this extracted point: ${shorten(sentence, 180)}`,
      sourceText: sentence,
    };
  }

  return {
    topic,
    type: "general",
    questionStem: `Which statement is most accurate about ${topic}?`,
    correctAnswer: shorten(sentence),
    explanation: `This answer is supported by the uploaded material: ${shorten(sentence, 180)}`,
    sourceText: sentence,
  };
}

function buildCandidates(text: string) {
  const sentences = splitSentences(text);
  const seen = new Set<string>();
  const candidates: QuestionCandidate[] = [];

  for (const sentence of sentences) {
    const candidate = buildCandidate(sentence);
    if (!candidate) continue;

    const key = `${candidate.topic}-${candidate.correctAnswer}`.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);

    if (candidate.correctAnswer.length < 25) continue;
    if (candidate.correctAnswer.toLowerCase().startsWith("this ")) continue;

    candidates.push(candidate);
  }

  return candidates.slice(0, 120);
}

function shuffle<T>(items: T[]) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[randomIndex]] = [arr[randomIndex], arr[i]];
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

function genericDistractors(topic: string, type: QuestionCandidate["type"]) {
  if (type === "definition") {
    return [
      `${topic} is mainly a label for any unrelated idea in the document.`,
      `${topic} only refers to a minor example and has no wider meaning.`,
      `${topic} is used only as a formatting term rather than a concept.`,
    ];
  }

  if (type === "purpose") {
    return [
      `To remove the need for understanding the main material.`,
      `To make revision harder without improving learning outcomes.`,
      `To replace all other concepts discussed in the document.`,
    ];
  }

  if (type === "benefit") {
    return [
      `It makes the process less reliable and harder to evaluate.`,
      `It has no clear effect on the system or learning outcome.`,
      `It only changes the wording without improving the result.`,
    ];
  }

  return [
    `${topic} is unrelated to the main argument of the material.`,
    `${topic} should be ignored because it appears only once.`,
    `${topic} is mainly about guessing rather than understanding.`,
  ];
}

function buildOptions(candidate: QuestionCandidate, all: QuestionCandidate[]) {
  const sameType = all
    .filter((item) => item !== candidate)
    .filter((item) => item.type === candidate.type)
    .map((item) => item.correctAnswer);

  const otherGood = all
    .filter((item) => item !== candidate)
    .map((item) => item.correctAnswer);

  const distractors = unique([
    ...shuffle(sameType),
    ...shuffle(otherGood),
    ...genericDistractors(candidate.topic, candidate.type),
  ])
    .filter((option) => option !== candidate.correctAnswer)
    .slice(0, 3);

  while (distractors.length < 3) {
    distractors.push(`${candidate.topic} is not clearly connected to the uploaded material.`);
  }

  const options = shuffle([candidate.correctAnswer, ...distractors]);
  const correctIndex = options.findIndex((option) => option === candidate.correctAnswer);

  return {
    options,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

function selectCandidates(
  candidates: QuestionCandidate[],
  phase: PhaseNumber,
  weakTopics: string[]
) {
  if (phase === 2 && weakTopics.length) {
    const weak = weakTopics.map((topic) => topic.toLowerCase());

    const focused = candidates.filter((candidate) =>
      weak.some(
        (topic) =>
          candidate.topic.toLowerCase().includes(topic) ||
          candidate.sourceText.toLowerCase().includes(topic)
      )
    );

    if (focused.length >= 5) {
      return shuffle(focused).slice(0, 5);
    }
  }

  const definitionQs = candidates.filter((c) => c.type === "definition");
  const purposeQs = candidates.filter((c) => c.type === "purpose");
  const benefitQs = candidates.filter((c) => c.type === "benefit");
  const processQs = candidates.filter((c) => c.type === "process");
  const generalQs = candidates.filter((c) => c.type === "general");

  const ordered =
    phase === 1
      ? [...definitionQs, ...purposeQs, ...benefitQs, ...processQs, ...generalQs]
      : phase === 2
        ? [...purposeQs, ...definitionQs, ...processQs, ...benefitQs, ...generalQs]
        : [...benefitQs, ...processQs, ...purposeQs, ...definitionQs, ...generalQs];

  const uniqueTopics = new Set<string>();
  const selected: QuestionCandidate[] = [];

  for (const candidate of ordered) {
    if (uniqueTopics.has(candidate.topic)) continue;

    uniqueTopics.add(candidate.topic);
    selected.push(candidate);

    if (selected.length === 5) break;
  }

  if (selected.length < 5) {
    for (const candidate of ordered) {
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
      if (selected.length === 5) break;
    }
  }

  return selected;
}

function fallbackQuestions(fileName: string): QuizPayload {
  return {
    questions: [
      {
        question: `What should Cognify do after reading ${fileName}?`,
        options: [
          "Identify key concepts and turn them into revision questions",
          "Ignore the document and use unrelated questions",
          "Only count the number of pages in the document",
          "Ask questions without checking the uploaded material",
        ],
        correctIndex: 0,
        topic: "PDF Understanding",
        difficulty: "easy",
        explanation: "The goal is to extract useful concepts from the uploaded material and use them for revision.",
        sourceHint: `Generated from ${fileName}`,
      },
    ],
  };
}

export function generateQuestionsFromPdfText(input: GenerateInput): QuizPayload {
  const candidates = buildCandidates(input.text);

  if (candidates.length < 5) {
    return fallbackQuestions(input.fileName);
  }

  const selected = selectCandidates(candidates, input.phase, input.weakTopics);

  const questions: QuizQuestion[] = selected.map((candidate) => {
    const { options, correctIndex } = buildOptions(candidate, candidates);

    const difficulty =
      input.phase === 1 ? "medium" : input.phase === 2 ? "medium" : "hard";

    return {
      question:
        input.phase === 1
          ? candidate.questionStem
          : input.phase === 2
            ? `You struggled with ${candidate.topic}. ${candidate.questionStem}`
            : `Final challenge: ${candidate.questionStem}`,
      options,
      correctIndex,
      topic: candidate.topic,
      difficulty,
      explanation: candidate.explanation,
      sourceHint: `Extracted locally from ${input.fileName}.`,
    };
  });

  return { questions };
}