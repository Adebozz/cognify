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

function spreadCorrectOption(question: QuizQuestion, targetIndex: number): QuizQuestion {
  const correctOption = question.options[question.correctIndex];
  const wrongOptions = question.options.filter((_, index) => index !== question.correctIndex);

  const options: string[] = [];
  let wrongIndex = 0;

  for (let i = 0; i < question.options.length; i++) {
    if (i === targetIndex) {
      options[i] = correctOption;
    } else {
      options[i] = wrongOptions[wrongIndex];
      wrongIndex++;
    }
  }

  return {
    ...question,
    options,
    correctIndex: targetIndex,
  };
}

function makeQuestion(input: MockInput, idx: number, topic: string): QuizQuestion {
  const material = fileLabel(input.file.name);
  const sourceHint = `Development mode sample from ${material}; real page/section citations will be added when API mode is enabled.`;

  const phase1: QuizQuestion[] = [
    {
      question: `Which action best helps a student build a strong baseline understanding of ${topic} from ${material}?`,
      options: [
        "Identify the main idea, supporting details, and important terms before attempting harder questions",
        "Memorise random sentences without checking how the ideas connect",
        "Only read the conclusion and ignore the examples",
        "Skip the topic until the final challenge",
      ],
      correctIndex: 0,
      topic,
      difficulty: "easy",
      explanation: "A baseline scan should check the main idea, key terms, and supporting details. That gives the learner a reliable starting point before targeted drilling.",
      sourceHint,
    },
    {
      question: `When reviewing ${topic}, what is the most useful sign that the learner may have a weak spot?`,
      options: [
        "They answer correctly but cannot explain why",
        "They complete the question slowly but confidently",
        "They remember an example from the notes",
        "They can link the topic to another section",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "A correct answer with poor explanation can still indicate shallow understanding. Cognify treats wrong answers and low confidence as weak-spot signals.",
      sourceHint,
    },
    {
      question: `What should a good exam-prep question about ${topic} test first?`,
      options: [
        "Whether the learner understands the concept, not just whether they recognise keywords",
        "Whether the learner can guess the longest option",
        "Whether the learner has memorised page numbers only",
        "Whether the learner can avoid all difficult questions",
      ],
      correctIndex: 0,
      topic,
      difficulty: "easy",
      explanation: "Good revision questions test understanding and application. Keyword recognition alone is not enough for proper exam readiness.",
      sourceHint,
    },
    {
      question: `If ${topic} appears in several parts of ${material}, what should the learner do?`,
      options: [
        "Compare how the idea is used across sections and note any repeated pattern",
        "Treat every mention as unrelated",
        "Only revise the first mention",
        "Ignore repeated ideas because they are unlikely to matter",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "Repeated ideas usually show importance. Comparing sections helps the learner understand the concept more deeply and spot exam-relevant patterns.",
      sourceHint,
    },
    {
      question: `Which revision behaviour would Cognify most likely mark as a strength in ${topic}?`,
      options: [
        "Choosing the correct answer and rating confidence as high after understanding the explanation",
        "Choosing randomly and moving on without reviewing",
        "Avoiding the topic completely",
        "Changing answers only because the option sounds technical",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "High confidence is useful only when it comes with understanding. Cognify combines correctness and confidence to estimate mastery.",
      sourceHint,
    },
  ];

  const phase2: QuizQuestion[] = [
    {
      question: `You struggled with ${topic}. What is the best next step before attempting harder questions?`,
      options: [
        "Review the explanation, restate the idea in your own words, then answer a similar question",
        "Skip straight to the final score page",
        "Only practise topics you already know",
        "Turn off explanations to save time",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "Weak-spot drilling works best when the learner repairs the misunderstanding first, then immediately tests the repaired understanding.",
      sourceHint,
    },
    {
      question: `A learner keeps missing questions on ${topic}. Which pattern should Cognify use to target them better?`,
      options: [
        "Wrong answers and low-confidence answers from earlier phases",
        "Only the file name",
        "Only the total score at the end",
        "The number of browser tabs open",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "Adaptive learning needs evidence. Wrong answers and low-confidence answers are better signals than a single overall score.",
      sourceHint,
    },
    {
      question: `Which explanation style is most helpful for correcting a misunderstanding in ${topic}?`,
      options: [
        "A short reason why the correct answer is right and why the chosen answer was weaker",
        "A vague statement saying the answer is obvious",
        "A long unrelated paragraph",
        "No feedback until next week",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "Targeted feedback should be clear, brief, and connected to the mistake. That helps the learner adjust quickly.",
      sourceHint,
    },
    {
      question: `In a weak-spot drill for ${topic}, why should questions be slightly more probing than Phase 1?`,
      options: [
        "Because the goal is to reveal and fix the exact misconception, not just check basic recall",
        "Because every second phase question must be impossible",
        "Because easier questions should never be used",
        "Because the learner should not receive explanations",
      ],
      correctIndex: 0,
      topic,
      difficulty: "hard",
      explanation: "Phase 2 should be diagnostic. It needs enough depth to expose the learner's confusion while still being fair and teachable.",
      sourceHint,
    },
    {
      question: `What should happen if the learner answers a ${topic} drill question correctly but selects “Guessing”?`,
      options: [
        "Keep the topic under review because the answer may not represent secure understanding",
        "Remove the topic from all future practice immediately",
        "Count the answer as wrong automatically",
        "Ignore confidence ratings completely",
      ],
      correctIndex: 0,
      topic,
      difficulty: "medium",
      explanation: "Low confidence can reveal unstable knowledge. A learner may guess correctly, so the topic should still be monitored.",
      sourceHint,
    },
  ];

  const phase3: QuizQuestion[] = [
    {
      question: `A final challenge question combines ${topic} with another concept. What makes this harder than Phase 1?`,
      options: [
        "The learner must connect ideas and apply them, not just recall one isolated fact",
        "The answer is always hidden outside the material",
        "The question avoids the learner's weak spots",
        "The options are chosen randomly",
      ],
      correctIndex: 0,
      topic,
      difficulty: "hard",
      explanation: "Final challenge questions should test synthesis. They require the learner to combine ideas and apply knowledge in a more exam-like way.",
      sourceHint,
    },
    {
      question: `Which performance result would show strong mastery of ${topic} by the end of the session?`,
      options: [
        "Correct answers in the final challenge plus confident explanations of the reasoning",
        "Only a correct answer in the first easy question",
        "Skipping the topic after one mistake",
        "Choosing the same option letter every time",
      ],
      correctIndex: 0,
      topic,
      difficulty: "hard",
      explanation: "Mastery is shown through correct performance on harder questions and confidence that is supported by understanding.",
      sourceHint,
    },
    {
      question: `If the final challenge exposes a remaining weakness in ${topic}, what should the app recommend?`,
      options: [
        "Add the topic to the review list and create a focused follow-up session",
        "Hide the mistake from the results page",
        "Delete the whole session history",
        "Assume the material is not useful",
      ],
      correctIndex: 0,
      topic,
      difficulty: "hard",
      explanation: "A final weakness should become a revision target. The results page should guide the learner toward focused follow-up practice.",
      sourceHint,
    },
    {
      question: `Why should Cognify show topic breakdown after testing ${topic}?`,
      options: [
        "It tells the learner exactly where to revise instead of only showing a broad total score",
        "It makes the score look more complicated without helping",
        "It replaces explanations completely",
        "It prevents the learner from reviewing mistakes",
      ],
      correctIndex: 0,
      topic,
      difficulty: "hard",
      explanation: "Topic-level feedback is more actionable than a total score. It helps learners focus their time on the right areas.",
      sourceHint,
    },
    {
      question: `A learner gets ${topic} correct in Phase 1 but wrong in Phase 3. What is the best interpretation?`,
      options: [
        "They may understand the basics but struggle when the idea is applied or combined with other concepts",
        "They have fully mastered the topic with no need to review",
        "The final challenge should be removed",
        "Confidence ratings are useless",
      ],
      correctIndex: 0,
      topic,
      difficulty: "hard",
      explanation: "This pattern suggests surface-level knowledge. The learner can recall the basics but may need more applied practice.",
      sourceHint,
    },
  ];

 const bank = input.phase === 1 ? phase1 : input.phase === 2 ? phase2 : phase3;
  const question = bank[idx % bank.length];

  // Spread demo answers across A, B, C, and D instead of always A.
  const targetIndex = (idx + input.phase) % question.options.length;

  return spreadCorrectOption(question, targetIndex);
}

export function generateDemoQuestions(input: MockInput): QuizPayload {
  const topics = topicSet(input);
  const questions = Array.from({ length: 5 }, (_, idx) => makeQuestion(input, idx, topics[idx % topics.length]));
  return { questions };
}
