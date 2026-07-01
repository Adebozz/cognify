import type { QuizPayload, QuizQuestion } from "./schemas";
import type { PhaseNumber } from "./prompts";

type MockInput = {
  file: File;
  phase: PhaseNumber;
  weakTopics: string[];
  previousSummary?: string;
};

const fallbackTopics = [
  "Key Definitions",
  "Core Concepts",
  "Process & Workflow",
  "Application",
  "Evaluation",
  "Limitations",
];

function cleanTopic(topic: string) {
  return topic.trim().replace(/\s+/g, " ").slice(0, 38) || "Core Concepts";
}

function topicSet(input: MockInput) {
  if (input.phase === 2 && input.weakTopics.length) {
    return input.weakTopics.map(cleanTopic).slice(0, 5);
  }

  if (input.phase === 3 && input.weakTopics.length) {
    return [...new Set([...input.weakTopics.map(cleanTopic), "Synthesis", "Exam Application"])].slice(0, 5);
  }

  return fallbackTopics.slice(0, 5);
}

function fileLabel(fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  if (!name) return "your study material";
  return name.length > 48 ? `${name.slice(0, 48)}…` : name;
}

function q(
  question: string,
  options: string[],
  correctIndex: number,
  topic: string,
  difficulty: QuizQuestion["difficulty"],
  explanation: string,
  sourceHint: string
): QuizQuestion {
  return {
    question,
    options,
    correctIndex,
    topic,
    difficulty,
    explanation,
    sourceHint,
  };
}

function makeQuestion(input: MockInput, idx: number, topic: string): QuizQuestion {
  const material = fileLabel(input.file.name);
  const sourceHint = `Development mode sample from ${material}; real page/section citations will be added when API mode is enabled.`;

  const phase1: QuizQuestion[] = [
    q(
      `What is the best first step when revising ${topic} from ${material}?`,
      [
        "Identify the main idea, key terms, and supporting points",
        "Focus only on examples and ignore definitions",
        "Read the final paragraph and skip the rest",
        "Start with hard questions before reviewing basics",
      ],
      0,
      topic,
      "easy",
      "A good baseline starts with the main idea, key terms, and supporting points before moving into harder practice.",
      sourceHint
    ),
    q(
      `Which response suggests the learner may have a weak spot in ${topic}?`,
      [
        "They can explain the answer clearly",
        "They answer correctly but feel unsure why",
        "They link the idea to another topic",
        "They remember a relevant example",
      ],
      1,
      topic,
      "medium",
      "A correct answer with low confidence can still reveal unstable understanding, so it should be treated as a weak-spot signal.",
      sourceHint
    ),
    q(
      `What should a good Knowledge Scan question about ${topic} test?`,
      [
        "Whether the learner remembers page numbers",
        "Whether the learner can spot repeated words",
        "Whether the learner understands the concept",
        "Whether the learner can avoid difficult ideas",
      ],
      2,
      topic,
      "easy",
      "A strong exam-prep question should test understanding, not only recognition of keywords or page details.",
      sourceHint
    ),
    q(
      `If ${topic} appears in different sections of ${material}, what should the learner do?`,
      [
        "Treat each mention as unrelated",
        "Revise only the first mention",
        "Ignore repeated ideas as less important",
        "Compare the repeated patterns across sections",
      ],
      3,
      topic,
      "medium",
      "Repeated patterns usually show importance. Comparing sections helps the learner understand how the idea is used.",
      sourceHint
    ),
    q(
      `Which behaviour would Cognify most likely treat as strong understanding of ${topic}?`,
      [
        "Choosing an answer because it sounds technical",
        "Answering correctly with clear confidence",
        "Guessing quickly and moving to the next topic",
        "Avoiding the topic after one difficult question",
      ],
      1,
      topic,
      "medium",
      "Correctness is strongest when it is supported by confidence and understanding, not guessing.",
      sourceHint
    ),
  ];

  const phase2: QuizQuestion[] = [
    q(
      `You struggled with ${topic}. What is the most useful next step?`,
      [
        "Review the idea, restate it, then try a similar question",
        "Skip the explanation and move to the final score",
        "Practise only topics that already feel easy",
        "Turn off feedback to make the session faster",
      ],
      0,
      topic,
      "medium",
      "Weak-spot drilling works best when the learner repairs the misunderstanding and immediately tests it again.",
      sourceHint
    ),
    q(
      `Which data should Cognify use to target ${topic} more accurately?`,
      [
        "Only the document title",
        "Wrong answers and low-confidence answers",
        "The number of browser tabs open",
        "Only the final percentage score",
      ],
      1,
      topic,
      "medium",
      "Wrong answers and low-confidence answers give better evidence of weak areas than a single final score.",
      sourceHint
    ),
    q(
      `Which feedback style is most helpful after a mistake in ${topic}?`,
      [
        "A vague message saying the answer was obvious",
        "A long paragraph unrelated to the question",
        "A clear reason linked to the learner’s mistake",
        "No feedback until the full session is finished",
      ],
      2,
      topic,
      "medium",
      "Good feedback should explain why the correct answer works and how the learner’s mistake happened.",
      sourceHint
    ),
    q(
      `Why should Phase 2 questions on ${topic} be more targeted than Phase 1?`,
      [
        "Because the app should avoid easier questions",
        "Because every drill question must be impossible",
        "Because explanations should be hidden",
        "Because the goal is to fix a specific gap",
      ],
      3,
      topic,
      "hard",
      "Phase 2 is diagnostic. It should focus on the exact misunderstanding shown in earlier answers.",
      sourceHint
    ),
    q(
      `If a learner answers a ${topic} question correctly but selects “Guessing”, what should happen?`,
      [
        "Keep the topic under review",
        "Remove the topic from all practice",
        "Count the answer as fully mastered",
        "Ignore the confidence rating completely",
      ],
      0,
      topic,
      "medium",
      "Low confidence means the knowledge may not be secure, even when the selected answer is correct.",
      sourceHint
    ),
  ];

  const phase3: QuizQuestion[] = [
    q(
      `What makes a Final Challenge question on ${topic} harder than a basic scan question?`,
      [
        "It avoids all weak topics",
        "It combines ideas and requires application",
        "It only checks word recognition",
        "It removes explanations completely",
      ],
      1,
      topic,
      "hard",
      "Final Challenge questions should test whether the learner can connect and apply ideas, not only recall isolated facts.",
      sourceHint
    ),
    q(
      `Which result best shows mastery of ${topic} by the end of the session?`,
      [
        "Getting one easy question right",
        "Skipping the topic after a mistake",
        "Answering hard questions with confidence",
        "Choosing the same option each time",
      ],
      2,
      topic,
      "hard",
      "Mastery is shown when the learner can answer harder questions confidently and explain their reasoning.",
      sourceHint
    ),
    q(
      `If the Final Challenge still exposes weakness in ${topic}, what should Cognify recommend?`,
      [
        "Hide the mistake from the results page",
        "Delete the whole session history",
        "Assume the study material is useless",
        "Add the topic to a focused review list",
      ],
      3,
      topic,
      "hard",
      "Remaining weaknesses should become review targets so the learner knows exactly what to practise next.",
      sourceHint
    ),
    q(
      `Why is a topic breakdown useful after testing ${topic}?`,
      [
        "It shows exactly where revision is needed",
        "It replaces explanations for wrong answers",
        "It makes the score harder to understand",
        "It prevents the learner from reviewing mistakes",
      ],
      0,
      topic,
      "hard",
      "Topic breakdown is more useful than a total score alone because it shows where to focus revision time.",
      sourceHint
    ),
    q(
      `A learner gets ${topic} right in Phase 1 but wrong in Phase 3. What does that suggest?`,
      [
        "They have fully mastered the topic",
        "They may know basics but struggle applying it",
        "The final challenge should be removed",
        "Confidence ratings should not be used",
      ],
      1,
      topic,
      "hard",
      "This pattern suggests the learner understands the basics but struggles when the concept is applied or combined with others.",
      sourceHint
    ),
  ];

  const bank = input.phase === 1 ? phase1 : input.phase === 2 ? phase2 : phase3;
  return bank[idx % bank.length];
}

export function generateDemoQuestions(input: MockInput): QuizPayload {
  const topics = topicSet(input);
  const questions = Array.from({ length: 5 }, (_, idx) =>
    makeQuestion(input, idx, topics[idx % topics.length])
  );

  return { questions };
}