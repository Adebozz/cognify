import type { QuizPayload, QuizQuestion } from "./schemas";

type PhaseNumber = 1 | 2 | 3;

type GenerateInput = {
  text: string;
  fileName: string;
  phase: PhaseNumber;
  weakTopics: string[];
};

type Candidate = {
  topic: string;
  sentence: string;
};

const stopWords = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "your", "you",
  "are", "was", "were", "been", "have", "has", "will", "can", "may", "not",
  "use", "using", "used", "also", "when", "where", "which", "their", "there",
]);

function cleanText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[•●▪]/g, ".")
    .trim();
}

function splitSentences(text: string) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 55 && s.length <= 260)
    .filter((s) => !/^(page|figure|table)\s+\d+/i.test(s));
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractTopic(sentence: string) {
  const definitionMatch = sentence.match(
    /^([A-Z][A-Za-z0-9\s/&(),-]{2,55})\s+(is|are|refers to|means|describes|involves|allows|enables)\b/i
  );

  if (definitionMatch?.[1]) {
    return cleanTopic(definitionMatch[1]);
  }

  const words = sentence
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 4 && !stopWords.has(w));

  const scored = new Map<string, number>();

  for (const word of words) {
    scored.set(word, (scored.get(word) || 0) + 1);
  }

  const best = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 2)
    .join(" ");

  return cleanTopic(best || "Core Concepts");
}

function cleanTopic(topic: string) {
  return toTitleCase(
    topic
      .replace(/[^a-zA-Z0-9\s/&-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 45)
  ) || "Core Concepts";
}

function buildCandidates(text: string): Candidate[] {
  const sentences = splitSentences(text);
  const seen = new Set<string>();

  return sentences
    .map((sentence) => ({
      sentence,
      topic: extractTopic(sentence),
    }))
    .filter((item) => {
      const key = item.sentence.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return item.topic.length > 2;
    })
    .slice(0, 80);
}

function shortenOption(sentence: string) {
  const cleaned = sentence.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 150) return cleaned;
  return `${cleaned.slice(0, 147).trim()}...`;
}

function shuffle<T>(items: T[]) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[randomIndex]] = [arr[randomIndex], arr[i]];
  }

  return arr;
}

function uniqueOptions(options: string[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackCandidates(fileName: string): Candidate[] {
  return [
    {
      topic: "Main Idea",
      sentence: `The uploaded material ${fileName} contains key concepts that should be revised using active recall and exam-style practice.`,
    },
    {
      topic: "Revision Strategy",
      sentence: "A good revision session should identify weak areas first, then focus practice on the topics that need the most improvement.",
    },
    {
      topic: "Confidence",
      sentence: "Low confidence can show that a learner has not fully mastered a topic, even when the answer selected is correct.",
    },
    {
      topic: "Exam Readiness",
      sentence: "Harder questions are useful because they test whether the learner can apply ideas rather than only remember definitions.",
    },
    {
      topic: "Review",
      sentence: "A topic breakdown helps the learner understand which areas need further study after the session is complete.",
    },
  ];
}

function makeQuestion(
  candidate: Candidate,
  allCandidates: Candidate[],
  phase: PhaseNumber,
  index: number,
  fileName: string
): QuizQuestion {
  const difficulty = phase === 1 ? "medium" : phase === 2 ? "medium" : "hard";

  const questionText =
    phase === 1
      ? `According to the uploaded material, which statement best explains ${candidate.topic}?`
      : phase === 2
        ? `You need more practice on ${candidate.topic}. Which statement is most accurate?`
        : `In a harder exam-style question, which statement best connects to ${candidate.topic}?`;

  const correctOption = shortenOption(candidate.sentence);

  const distractors = shuffle(
    allCandidates
      .filter((item) => item.sentence !== candidate.sentence)
      .map((item) => shortenOption(item.sentence))
  ).slice(0, 6);

  const fallbackDistractors = [
    `${candidate.topic} is only useful for memorising isolated facts without applying them.`,
    `${candidate.topic} should be ignored unless it appears in the final paragraph.`,
    `${candidate.topic} is mainly about guessing the most technical-sounding answer.`,
    `${candidate.topic} does not need review once one question has been answered.`,
  ];

  const rawOptions = uniqueOptions([
    correctOption,
    ...distractors,
    ...fallbackDistractors,
  ]).slice(0, 4);

  while (rawOptions.length < 4) {
    rawOptions.push(`Review ${candidate.topic} carefully and compare it with related ideas.`);
  }

  const shuffledOptions = shuffle(rawOptions);
  const correctIndex = shuffledOptions.findIndex((option) => option === correctOption);

  return {
    question: questionText,
    options: shuffledOptions,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    topic: candidate.topic,
    difficulty,
    explanation: `The correct answer is based on this extracted idea from the uploaded PDF: "${correctOption}"`,
    sourceHint: `Extracted locally from ${fileName}. Page-level citations will be improved later.`,
  };
}

export function generateQuestionsFromPdfText(input: GenerateInput): QuizPayload {
  const cleaned = cleanText(input.text);

  let candidates = buildCandidates(cleaned);

  if (candidates.length < 5) {
    candidates = fallbackCandidates(input.fileName);
  }

  if (input.phase === 2 && input.weakTopics.length) {
    const weakSet = input.weakTopics.map((t) => t.toLowerCase());

    const weakCandidates = candidates.filter((candidate) =>
      weakSet.some(
        (weak) =>
          candidate.topic.toLowerCase().includes(weak) ||
          candidate.sentence.toLowerCase().includes(weak)
      )
    );

    if (weakCandidates.length >= 3) {
      candidates = [...weakCandidates, ...candidates];
    }
  }

  const startIndex = input.phase === 1 ? 0 : input.phase === 2 ? 5 : 10;

  const selected = Array.from({ length: 5 }, (_, idx) => {
    const candidate = candidates[(startIndex + idx) % candidates.length];
    return makeQuestion(candidate, candidates, input.phase, idx, input.fileName);
  });

  return { questions: selected };
}