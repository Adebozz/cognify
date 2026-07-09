import type { QuizPayload, QuizQuestion } from "./schemas";

type PhaseNumber = 1 | 2 | 3;

type GenerateInput = {
  text: string;
  fileName: string;
  phase: PhaseNumber;
  weakTopics: string[];
};

type QuestionSeed = {
  topic: string;
  question: string;
  correctAnswer: string;
  explanation: string;
  sourceHint: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
};

function cleanText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/con￾cerns/g, "concerns")
    .replace(/ten￾sion/g, "tension")
    .replace(/underdiag￾nosis/g, "underdiagnosis")
    .replace(/subpopu￾lations/g, "subpopulations")
    .replace(/sub￾group/g, "subgroup")
    .replace(/dis￾ease/g, "disease")
    .replace(/diag￾nostic/g, "diagnostic")
    .replace(/spe￾cifically/g, "specifically")
    .replace(/diag￾nosis/g, "diagnosis")
    .replace(/treat￾ment/g, "treatment")
    .replace(/\s+/g, " ")
    .trim();
}

function stripReferences(text: string) {
  const lower = text.toLowerCase();
  const refIndex = lower.indexOf(" references ");

  if (refIndex > 0) {
    return text.slice(0, refIndex);
  }

  return text;
}

function hasAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

export function looksLikeScientificArticle(text: string) {
  const lower = text.toLowerCase();

  const signals = [
    "abstract",
    "introduction",
    "results",
    "discussion",
    "methods",
    "references",
    "doi",
    "nature medicine",
    "table 1",
    "fig. 1",
    "fig. 2",
  ];

  return signals.filter((signal) => lower.includes(signal)).length >= 3;
}

function shuffle<T>(items: T[]) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[r]] = [arr[r], arr[i]];
  }

  return arr;
}

function makeOptions(correct: string, distractors: string[]) {
  const options = shuffle([correct, ...distractors]).slice(0, 4);
  const correctIndex = options.findIndex((option) => option === correct);

  return {
    options,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

function buildSeeds(text: string, fileName: string): QuestionSeed[] {
  const cleaned = cleanText(stripReferences(text));
  const seeds: QuestionSeed[] = [];

  if (hasAny(cleaned, ["underdiagnosis", "falsely claiming", "healthy"])) {
    seeds.push({
      topic: "Underdiagnosis",
      question: "What does underdiagnosis mean in this paper?",
      correctAnswer:
        "It means the model falsely predicts that a patient is healthy or has no finding when the patient actually needs care.",
      explanation:
        "The paper defines underdiagnosis as falsely claiming that the patient is healthy, which may prevent needed clinical treatment.",
      sourceHint: `${fileName} — introduction/abstract`,
      difficulty: "easy",
      tags: ["definition", "underdiagnosis", "core"],
    });
  }

  if (hasAny(cleaned, ["MIMIC-CXR", "CheXpert", "ChestX-ray14", "multi-source"])) {
    seeds.push({
      topic: "Datasets",
      question: "Which datasets were used in the study?",
      correctAnswer:
        "The study used MIMIC-CXR, CheXpert, ChestX-ray14, and a combined multi-source dataset.",
      explanation:
        "The article states that the study examined three large public chest X-ray datasets and a combined multi-source dataset.",
      sourceHint: `${fileName} — dataset/methods section`,
      difficulty: "medium",
      tags: ["datasets", "methods"],
    });
  }

  if (hasAny(cleaned, ["false-positive rate", "FPR", "no finding"])) {
    seeds.push({
      topic: "Fairness Metric",
      question: "How is underdiagnosis rate measured in the paper?",
      correctAnswer:
        "It is measured as the false-positive rate of the model prediction for the no finding label.",
      explanation:
        "The paper measures underdiagnosis using the false-positive rate for the no finding label across patient subgroups.",
      sourceHint: `${fileName} — methods/fairness metric section`,
      difficulty: "medium",
      tags: ["metric", "FPR", "fairness"],
    });
  }

  if (hasAny(cleaned, ["female patients", "Black patients", "Hispanic patients", "Medicaid"])) {
    seeds.push({
      topic: "Affected Groups",
      question: "Which patient groups were found to have higher underdiagnosis rates?",
      correctAnswer:
        "Female patients, Black patients, Hispanic patients, younger patients, and patients with Medicaid insurance were among the affected groups.",
      explanation:
        "The results section reports higher algorithmic underdiagnosis rates for several under-served patient subpopulations.",
      sourceHint: `${fileName} — results section`,
      difficulty: "medium",
      tags: ["results", "bias", "subgroups"],
    });
  }

  if (hasAny(cleaned, ["intersectional", "Black female", "Hispanic female"])) {
    seeds.push({
      topic: "Intersectional Bias",
      question: "What does the paper say about intersectional underdiagnosis?",
      correctAnswer:
        "Patients belonging to two under-served subgroups often experienced larger underdiagnosis rates.",
      explanation:
        "The study found that intersectional identities, such as Hispanic female patients or Black female patients, can experience compounded underdiagnosis bias.",
      sourceHint: `${fileName} — intersectional groups/results section`,
      difficulty: "hard",
      tags: ["intersectional", "bias", "results"],
    });
  }

  if (hasAny(cleaned, ["triage", "clinical pipeline", "no clinical treatment"])) {
    seeds.push({
      topic: "Clinical Risk",
      question: "Why is underdiagnosis especially harmful in a clinical setting?",
      correctAnswer:
        "Because a patient who is falsely labelled as healthy may receive lower priority or no treatment when care is needed.",
      explanation:
        "The paper argues that underdiagnosis can delay care, especially in triage, where a false no finding result may reduce priority for clinician attention.",
      sourceHint: `${fileName} — introduction/discussion`,
      difficulty: "medium",
      tags: ["clinical risk", "triage"],
    });
  }

  if (hasAny(cleaned, ["bias amplification", "clinical records", "ground truth"])) {
    seeds.push({
      topic: "Bias Amplification",
      question: "What is bias amplification in the context of this paper?",
      correctAnswer:
        "It is when model predictions reproduce or worsen existing biases already present in clinical data or healthcare practice.",
      explanation:
        "The paper explains that labels from clinical records may already contain bias, and the model can amplify that bias in its predictions.",
      sourceHint: `${fileName} — discussion section`,
      difficulty: "hard",
      tags: ["bias amplification", "discussion"],
    });
  }

  if (hasAny(cleaned, ["DenseNet", "121-layer", "ImageNet", "binary cross-entropy"])) {
    seeds.push({
      topic: "Model Training",
      question: "What model training approach was used in the study?",
      correctAnswer:
        "The study trained deep learning chest X-ray classifiers, including a 121-layer DenseNet initialized with ImageNet weights.",
      explanation:
        "The methods section describes training DenseNet-based classifiers for multi-label chest X-ray prediction.",
      sourceHint: `${fileName} — methods/model training section`,
      difficulty: "hard",
      tags: ["model", "methods"],
    });
  }

  if (hasAny(cleaned, ["fairness checks", "regulatory", "deployment", "ethical"])) {
    seeds.push({
      topic: "Ethical Implication",
      question: "What ethical concern does the paper raise about deploying AI diagnosis systems?",
      correctAnswer:
        "Biased AI diagnosis systems may worsen unequal access to medical treatment for under-served populations.",
      explanation:
        "The conclusion warns that deployment without robust fairness auditing could escalate existing systemic health inequities.",
      sourceHint: `${fileName} — discussion/conclusion`,
      difficulty: "hard",
      tags: ["ethics", "deployment"],
    });
  }

  if (hasAny(cleaned, ["Fig. 1", "model pipeline", "subpopulation FPR comparisons"])) {
    seeds.push({
      topic: "Model Pipeline",
      question: "What does the study’s model pipeline compare?",
      correctAnswer:
        "It trains chest X-ray prediction models and compares no finding false-positive rates across patient subpopulations.",
      explanation:
        "The model pipeline focuses on training a diagnostic model and then comparing underdiagnosis rates between subgroups.",
      sourceHint: `${fileName} — Fig. 1/model pipeline`,
      difficulty: "medium",
      tags: ["pipeline", "figure"],
    });
  }

  return seeds;
}

function phaseSeeds(seeds: QuestionSeed[], phase: PhaseNumber, weakTopics: string[]) {
  if (phase === 2 && weakTopics.length) {
    const weak = weakTopics.map((topic) => topic.toLowerCase());

    const focused = seeds.filter((seed) =>
      weak.some(
        (topic) =>
          seed.topic.toLowerCase().includes(topic) ||
          seed.tags.some((tag) => tag.toLowerCase().includes(topic))
      )
    );

    if (focused.length >= 3) {
      return [...focused, ...seeds].slice(0, 5);
    }
  }

  if (phase === 1) {
    return seeds
      .filter((seed) =>
        ["Underdiagnosis", "Datasets", "Fairness Metric", "Affected Groups", "Clinical Risk"].includes(seed.topic)
      )
      .slice(0, 5);
  }

  if (phase === 2) {
    return seeds
      .filter((seed) =>
        ["Underdiagnosis", "Affected Groups", "Intersectional Bias", "Fairness Metric", "Clinical Risk"].includes(seed.topic)
      )
      .slice(0, 5);
  }

  return seeds
    .filter((seed) =>
      ["Intersectional Bias", "Bias Amplification", "Model Training", "Ethical Implication", "Model Pipeline"].includes(seed.topic)
    )
    .slice(0, 5);
}

function distractorsFor(seed: QuestionSeed) {
  const common = [
    "It only measures whether the model has a high overall accuracy score.",
    "It shows that all patient groups receive identical model performance.",
    "It focuses only on how quickly radiologists can read X-ray images.",
    "It means the model always performs worse than human clinicians.",
  ];

  const byTopic: Record<string, string[]> = {
    Underdiagnosis: [
      "It means the model correctly detects every disease case.",
      "It means the model predicts disease when the patient is healthy.",
      "It means the model has a high training accuracy but low test accuracy.",
    ],
    Datasets: [
      "The study used only one private hospital dataset.",
      "The study used only synthetic X-ray images generated by AI.",
      "The study used only handwritten clinical notes without images.",
    ],
    "Fairness Metric": [
      "It is measured using only the model’s training loss.",
      "It is measured by counting the number of doctors in each hospital.",
      "It is measured only with the average AUC across all labels.",
    ],
    "Affected Groups": [
      "Only patients with private insurance were affected.",
      "The paper found no difference between patient groups.",
      "The most affected groups were selected randomly.",
    ],
    "Intersectional Bias": [
      "Intersectional groups always had lower risk than single subgroups.",
      "The paper ignores combinations of race, sex, age, and insurance.",
      "Intersectional bias refers only to the number of datasets used.",
    ],
    "Clinical Risk": [
      "Because underdiagnosis improves triage speed without trade-offs.",
      "Because healthy patients are always given unnecessary treatment.",
      "Because it only affects the model during training, not deployment.",
    ],
    "Bias Amplification": [
      "It means the model removes all historical bias from the data.",
      "It means the model ignores labels during training.",
      "It means the model performs equally across every subgroup.",
    ],
    "Model Training": [
      "The study trained a simple spreadsheet model without images.",
      "The study used only hand-written rules instead of machine learning.",
      "The study did not train any prediction model.",
    ],
    "Ethical Implication": [
      "The paper argues that fairness checks are unnecessary before deployment.",
      "The paper says biased models are safe if they are accurate on average.",
      "The paper focuses only on commercial profit from medical AI.",
    ],
    "Model Pipeline": [
      "It compares patient income against hospital funding only.",
      "It trains models without evaluating subgroup outcomes.",
      "It only counts the number of X-rays in each dataset.",
    ],
  };

  return byTopic[seed.topic] || common;
}

function toQuestion(seed: QuestionSeed, phase: PhaseNumber): QuizQuestion {
  const { options, correctIndex } = makeOptions(
    seed.correctAnswer,
    distractorsFor(seed)
  );

  return {
    question:
      phase === 1
        ? seed.question
        : phase === 2
          ? `Weak spot drill: ${seed.question}`
          : `Final challenge: ${seed.question}`,
    options,
    correctIndex,
    topic: seed.topic,
    difficulty: phase === 3 ? "hard" : seed.difficulty,
    explanation: seed.explanation,
    sourceHint: seed.sourceHint,
  };
}

function fallbackPayload(fileName: string): QuizPayload {
  return {
    questions: [
      {
        question: "What is the main task when studying a scientific article?",
        options: [
          "Identify the research problem, method, results, and implications",
          "Memorise only the author names and publication date",
          "Use only the reference list as the source of questions",
          "Ignore the methods and discussion sections",
        ],
        correctIndex: 0,
        topic: "Scientific Article",
        difficulty: "easy",
        explanation:
          "A scientific article should be studied by understanding its research question, method, results, and implications.",
        sourceHint: fileName,
      },
    ],
  };
}

export function generateScientificArticleQuestions(input: GenerateInput): QuizPayload {
  const seeds = buildSeeds(input.text, input.fileName);

  if (seeds.length < 5) {
    return fallbackPayload(input.fileName);
  }

  const selected = phaseSeeds(seeds, input.phase, input.weakTopics);

  const questions = selected.map((seed) => toQuestion(seed, input.phase));

  return {
    questions: questions.slice(0, 5),
  };
}