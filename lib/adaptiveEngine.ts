export type MasteryLevel = "weak" | "developing" | "strong";

export type AnswerLike = {
  phase?: number;
  topic?: string;
  difficulty?: string | null;
  chosenIdx: number;
  correctIdx: number;
  conf?: number | null;
  timeSpent?: number | null;
};

export type TopicMastery = {
  topic: string;
  attempts: number;
  correct: number;
  wrong: number;
  lowConfidence: number;
  accuracy: number;
  averageConfidence: number;
  score: number;
  level: MasteryLevel;
  nextDifficulty: "easy" | "medium" | "hard";
  recommendation: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normaliseTopic(topic?: string) {
  return topic?.trim() || "General Knowledge";
}

function confidenceScore(conf?: number | null) {
  if (!conf) return 35;
  if (conf === 1) return 30;
  if (conf === 2) return 60;
  return 100;
}

function difficultyWeight(difficulty?: string | null) {
  if (difficulty === "hard") return 1.2;
  if (difficulty === "medium") return 1;
  return 0.85;
}

export function analyseTopicMastery(answers: AnswerLike[]): TopicMastery[] {
  const groups = new Map<string, AnswerLike[]>();

  for (const answer of answers) {
    const topic = normaliseTopic(answer.topic);
    groups.set(topic, [...(groups.get(topic) || []), answer]);
  }

  return Array.from(groups.entries())
    .map(([topic, topicAnswers]) => {
      const attempts = topicAnswers.length;
      const correct = topicAnswers.filter((a) => a.chosenIdx === a.correctIdx).length;
      const wrong = attempts - correct;
      const lowConfidence = topicAnswers.filter((a) => a.conf === 1 || a.conf === 2).length;

      const accuracy = attempts ? correct / attempts : 0;
      const averageConfidence =
        topicAnswers.reduce((sum, a) => sum + confidenceScore(a.conf), 0) / attempts;

      const difficultyBonus =
        topicAnswers.reduce((sum, a) => sum + difficultyWeight(a.difficulty), 0) / attempts;

      const rawScore =
        accuracy * 65 +
        (averageConfidence / 100) * 25 +
        Math.min(attempts, 3) * 3 +
        (difficultyBonus - 1) * 10 -
        lowConfidence * 5;

      const score = Math.round(clamp(rawScore));

      let level: MasteryLevel = "developing";
      if (score < 50 || wrong > correct) level = "weak";
      if (score >= 75 && accuracy >= 0.7 && averageConfidence >= 60) level = "strong";

      let nextDifficulty: "easy" | "medium" | "hard" = "medium";
      if (level === "weak") nextDifficulty = "easy";
      if (level === "strong") nextDifficulty = "hard";

      let recommendation = `Keep practising ${topic} with mixed questions.`;
      if (level === "weak") {
        recommendation = `Review the basics of ${topic}, then try easier guided questions before moving harder.`;
      }
      if (level === "strong") {
        recommendation = `You are doing well in ${topic}. Move to harder exam-style questions.`;
      }

      return {
        topic,
        attempts,
        correct,
        wrong,
        lowConfidence,
        accuracy: Math.round(accuracy * 100),
        averageConfidence: Math.round(averageConfidence),
        score,
        level,
        nextDifficulty,
        recommendation,
      };
    })
    .sort((a, b) => a.score - b.score);
}

export function getWeakTopics(answers: AnswerLike[], limit = 5) {
  return analyseTopicMastery(answers)
    .filter((topic) => topic.level === "weak" || topic.lowConfidence > 0)
    .slice(0, limit)
    .map((topic) => topic.topic);
}

export function getStrongTopics(answers: AnswerLike[], limit = 5) {
  return analyseTopicMastery(answers)
    .filter((topic) => topic.level === "strong")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((topic) => topic.topic);
}

export function buildAdaptivePlan(answers: AnswerLike[]) {
  const mastery = analyseTopicMastery(answers);
  const weakTopics = mastery.filter((topic) => topic.level === "weak");
  const developingTopics = mastery.filter((topic) => topic.level === "developing");
  const strongTopics = mastery.filter((topic) => topic.level === "strong");

  return {
    mastery,
    weakTopics: weakTopics.map((topic) => topic.topic),
    developingTopics: developingTopics.map((topic) => topic.topic),
    strongTopics: strongTopics.map((topic) => topic.topic),
    nextFocus:
      weakTopics[0]?.topic ||
      developingTopics[0]?.topic ||
      mastery[0]?.topic ||
      "General Knowledge",
    recommendation:
      weakTopics.length > 0
        ? `Focus next on ${weakTopics.map((topic) => topic.topic).join(", ")}.`
        : "Move into harder mixed questions to confirm mastery.",
  };
}