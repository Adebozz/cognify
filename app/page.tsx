"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, Flame, RotateCcw, Target, Timer, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import type { QuizQuestion } from "@/lib/schemas";

type PhaseNumber = 1 | 2 | 3;
type AppPhase = "upload" | "loading" | "quiz" | "results";
type Confidence = 1 | 2 | 3 | null;

type Answer = {
  key: string;
  phase: PhaseNumber;
  question: string;
  chosenIdx: number;
  correctIdx: number;
  chosenOpt: string;
  correctOpt: string;
  topic: string;
  difficulty: string;
  explanation: string;
  sourceHint: string;
  conf: Confidence;
};

type HistoryItem = {
  fileName: string;
  pct: number;
  date: string;
};

const phaseMeta: Record<PhaseNumber, {
  icon: string;
  title: string;
  sub: string;
  bannerClass: string;
  fillClass: string;
  pillClass: string;
}> = {
  1: {
    icon: "🔍",
    title: "Knowledge Scan",
    sub: "Broad questions across all topics",
    bannerClass: "pb1",
    fillClass: "pf1",
    pillClass: "active-1",
  },
  2: {
    icon: "🎯",
    title: "Weak Spot Drill",
    sub: "Targeting your weak spots",
    bannerClass: "pb2",
    fillClass: "pf2",
    pillClass: "active-2",
  },
  3: {
    icon: "🔥",
    title: "Final Challenge",
    sub: "Hard questions to prove mastery",
    bannerClass: "pb3",
    fillClass: "pf3",
    pillClass: "active-3",
  },
};

const letters = ["A", "B", "C", "D"];
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [phaseIdx, setPhaseIdx] = useState<PhaseNumber>(1);
  const [phaseCurrent, setPhaseCurrent] = useState(0);
  const [phaseQs, setPhaseQs] = useState<Record<PhaseNumber, QuizQuestion[]>>({ 1: [], 2: [], 3: [] });
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [timedMode, setTimedMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  const [loadingMsg, setLoadingMsg] = useState("Parsing your material…");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [drag, setDrag] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cognify-history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (history.length) {
      window.localStorage.setItem("cognify-history", JSON.stringify(history.slice(-5)));
    }
  }, [history]);

  const currentQuestion = phaseQs[phaseIdx][phaseCurrent];
  const currentKey = `${phaseIdx}-${phaseCurrent}`;
  const currentAnswer = answers.find((a) => a.key === currentKey);

  const phasePct = useMemo(() => {
    const total = phaseQs[phaseIdx].length || 1;
    return Math.round((phaseCurrent / total) * 100);
  }, [phaseCurrent, phaseIdx, phaseQs]);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer() {
    clearTimer();
    setTimeLeft(45);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          autoAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => () => clearTimer(), []);

  function autoAnswer() {
    const q = phaseQs[phaseIdx][phaseCurrent];
    if (!q) return;
    const key = `${phaseIdx}-${phaseCurrent}`;
    setAnswers((prev) => {
      if (prev.some((a) => a.key === key)) return prev;
      return [
        ...prev,
        {
          key,
          phase: phaseIdx,
          question: q.question,
          chosenIdx: -1,
          correctIdx: q.correctIndex,
          chosenOpt: "Time ran out",
          correctOpt: q.options[q.correctIndex],
          topic: q.topic,
          difficulty: q.difficulty,
          explanation: q.explanation,
          sourceHint: q.sourceHint,
          conf: 1,
        },
      ];
    });
  }

  function handleFileList(files: FileList | null) {
    setError(null);
    const picked = files?.[0];
    if (!picked) return;

    const ok = picked.type === "application/pdf" || picked.type.startsWith("image/");
    if (!ok) {
      setError("Please upload a PDF or image file.");
      return;
    }

    setFile(picked);
  }

  async function generatePhase(nextPhase: PhaseNumber, weakOverride = weakTopics, sourceFile = file) {
    if (!sourceFile) return;
    setPhase("loading");
    setLoadingMsg(`Generating Phase ${nextPhase}: ${phaseMeta[nextPhase].title}…`);
    setError(null);

    const formData = new FormData();
    formData.append("file", sourceFile);
    formData.append("phase", String(nextPhase));
    formData.append("weakTopics", JSON.stringify(weakOverride));
    formData.append("previousSummary", buildPreviousSummary());
    formData.append("demoMode", isDemoMode ? "true" : "false");

    const res = await fetch("/api/questions", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Could not generate questions.");
    }

    setPhaseQs((prev) => ({ ...prev, [nextPhase]: data.questions }));
    setPhaseIdx(nextPhase);
    setPhaseCurrent(0);
    setPhase("quiz");
    if (timedMode) startTimer();
  }

  function buildPreviousSummary() {
    if (!answers.length) return "";
    const wrong = answers.filter((a) => a.chosenIdx !== a.correctIdx).map((a) => a.topic);
    const low = answers.filter((a) => a.conf === 1).map((a) => a.topic);
    const correct = answers.filter((a) => a.chosenIdx === a.correctIdx).length;
    return `Correct so far: ${correct}/${answers.length}. Wrong topics: ${[...new Set(wrong)].join(", ") || "none"}. Low confidence topics: ${[...new Set(low)].join(", ") || "none"}.`;
  }

  async function startSession() {
    if (!file) return;
    resetQuizState(false);
    try {
      await generatePhase(1, [], file);
    } catch (err) {
      setPhase("upload");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function startDemoSession() {
    const demoFile = new File(["Cognify development mode sample"], "cognify-demo-notes.pdf", { type: "application/pdf" });
    setFile(demoFile);
    resetQuizState(false);
    try {
      await generatePhase(1, [], demoFile);
    } catch (err) {
      setPhase("upload");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleAnswer(chosenIdx: number) {
    const q = currentQuestion;
    if (!q || currentAnswer) return;
    clearTimer();
    setAnswers((prev) => [
      ...prev,
      {
        key: currentKey,
        phase: phaseIdx,
        question: q.question,
        chosenIdx,
        correctIdx: q.correctIndex,
        chosenOpt: q.options[chosenIdx] ?? "—",
        correctOpt: q.options[q.correctIndex] ?? "—",
        topic: q.topic,
        difficulty: q.difficulty,
        explanation: q.explanation,
        sourceHint: q.sourceHint,
        conf: null,
      },
    ]);
  }

  function setConfidence(conf: 1 | 2 | 3) {
    setAnswers((prev) => prev.map((a) => (a.key === currentKey ? { ...a, conf } : a)));
  }

  async function nextStep() {
    const qs = phaseQs[phaseIdx];
    const isLastQuestion = phaseCurrent === qs.length - 1;

    if (!isLastQuestion) {
      setPhaseCurrent((v) => v + 1);
      if (timedMode) startTimer();
      return;
    }

    const phaseAnswers = answers.filter((a) => a.phase === phaseIdx);
    const newWeaks = phaseAnswers
      .filter((a) => a.chosenIdx !== a.correctIdx || a.conf === 1)
      .map((a) => a.topic)
      .filter(Boolean);

    const mergedWeakTopics = [...new Set([...weakTopics, ...newWeaks])];
    setWeakTopics(mergedWeakTopics);

    if (phaseIdx < 3) {
      try {
        await generatePhase((phaseIdx + 1) as PhaseNumber, mergedWeakTopics);
      } catch (err) {
        setPhase("quiz");
        setError(err instanceof Error ? err.message : "Could not generate the next phase.");
      }
      return;
    }

    clearTimer();
    saveHistory();
    setPhase("results");
  }

  function saveHistory() {
    const total = answers.length || 1;
    const correct = answers.filter((a) => a.chosenIdx === a.correctIdx).length;
    const pct = Math.round((correct / total) * 100);
    setHistory((prev) => [
      ...prev.slice(-4),
      { fileName: file?.name ?? "Study session", pct, date: new Date().toLocaleDateString() },
    ]);
  }

  function resetQuizState(removeFile = true) {
    clearTimer();
    setPhaseIdx(1);
    setPhaseCurrent(0);
    setPhaseQs({ 1: [], 2: [], 3: [] });
    setAnswers([]);
    setWeakTopics([]);
    setTimeLeft(45);
    setError(null);
    if (removeFile) setFile(null);
  }

  function exportResults() {
    const data = JSON.stringify({ file: file?.name, answers, weakTopics, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cognify-results.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pills = ([1, 2, 3] as PhaseNumber[]).map((p) => {
    const meta = phaseMeta[p];
    const cls = clsx("ppill", {
      done: phase === "results" || (phase === "quiz" && p < phaseIdx) || (phase === "loading" && p < phaseIdx),
      [meta.pillClass]: (phase === "quiz" || phase === "loading") && p === phaseIdx,
    });
    return (
      <div className={cls} key={p}>
        <div className="dot" />
        {meta.title}
      </div>
    );
  });

  return (
    <div className="shell">
      <header className="hdr">
        <div className="logo">
          <div className="logo-mark">Cg</div>
          <div>
            <div className="logo-name">Cogni<span>fy</span></div>
            <div className="logo-tag">AI Study Engine</div>
          </div>
        </div>
        <div className="phase-pills">{pills}</div>
      </header>

      <main className="app">
        {error && (
          <div className="error-box">
            <strong>Something needs fixing:</strong><br />{error}
          </div>
        )}
        {phase === "upload" && renderUpload()}
        {phase === "loading" && renderLoading()}
        {phase === "quiz" && renderQuiz()}
        {phase === "results" && renderResults()}
      </main>
    </div>
  );

  function renderUpload() {
    return (
      <>
        <section className="hero">
          <div className="hero-kicker">Personalised exam prep</div>
          <h1>Study smarter<br />with <em>AI</em></h1>
          <p>Upload your notes, slides, textbook PDFs, or revision image. Cognify builds a 3-phase exam session that finds your weak spots and drills them.</p>
        </section>

        <section className="phase-cards">
          <div className="pc"><div className="pnum">01</div><div className="pname">Knowledge Scan</div><div className="pdesc">Broad questions across all major topics to establish your baseline.</div></div>
          <div className="pc"><div className="pnum">02</div><div className="pname">Weak Spot Drill</div><div className="pdesc">Targeted questions on the exact topics you struggled with.</div></div>
          <div className="pc"><div className="pnum">03</div><div className="pname">Final Challenge</div><div className="pdesc">Hard multi-concept questions to prove full understanding.</div></div>
        </section>

        {isDemoMode && (
          <section className="dev-box">
            <div>
              <span className="mode-pill">Development mode</span>
              <h3>API calls are paused for now.</h3>
              <p>You can finish the upload flow, quiz screens, weak-spot logic, timed mode, results page, and export feature without spending credits.</p>
            </div>
            <button className="btn btn-ghost" onClick={startDemoSession}>Try sample session</button>
          </section>
        )}

        {file ? (
          <div className="file-ready">
            <div className="fi-icon">📄</div>
            <div className="fi-info">
              <div className="fi-name">{file.name}</div>
              <div className="fi-size">{formatBytes(file.size)} • Ready to analyse</div>
            </div>
            <button className="fi-rm" onClick={() => setFile(null)} aria-label="Remove file"><X size={20} /></button>
          </div>
        ) : (
          <label
            className={clsx("drop", { drag })}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFileList(e.dataTransfer.files); }}
          >
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => handleFileList(e.target.files)} />
            <UploadCloud className="drop-icon" />
            <h3>Drop your study material here</h3>
            <p>Click to browse — PDF or image</p>
            <div className="formats"><span className="fmt">PDF</span><span className="fmt">PNG</span><span className="fmt">JPG</span><span className="fmt">WEBP</span></div>
          </label>
        )}

        <div className="toolbar">
          <button className={clsx("timed-toggle", { on: timedMode })} onClick={() => setTimedMode((v) => !v)}>
            <Timer size={16} /> {timedMode ? "Timed mode ON" : "Timed mode OFF"}
          </button>
          <span className="muted">{timedMode ? "45 seconds per question" : "Enable for exam simulation pressure"}</span>
        </div>

        <div className="upload-actions">
          <button className="btn btn-primary btn-full" disabled={!file} onClick={startSession}>
            Start Cognify Session →
          </button>
        </div>

        {history.length > 0 && (
          <section className="session-progress">
            <div className="sp-title">Recent sessions</div>
            <div className="sp-bars">
              {history.slice(-3).reverse().map((h, idx) => (
                <div className="sp-row" key={`${h.fileName}-${idx}`}>
                  <div className="sp-label">{h.fileName}</div>
                  <div className="sp-track"><div className="sp-bar" style={{ width: `${h.pct}%`, background: historyColor(h.pct) }} /></div>
                  <div className="sp-pct" style={{ color: historyColor(h.pct) }}>{h.pct}%</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  function renderLoading() {
    return (
      <section className="loading-wrap">
        <div className="spin" />
        <h2>{loadingMsg}</h2>
        <p>Building your personalised study session. This can take a moment for large PDFs.</p>
        <div className="loading-steps">
          <div className="lstep done-step">Reading material</div>
          <div className="lstep active-step">Generating questions</div>
          <div className="lstep">Checking JSON</div>
          <div className="lstep">Preparing quiz</div>
        </div>
      </section>
    );
  }

  function renderQuiz() {
    const q = currentQuestion;
    if (!q) return renderLoading();
    const meta = phaseMeta[phaseIdx];
    const isLastQuestion = phaseCurrent === phaseQs[phaseIdx].length - 1;
    const nextLabel = isLastQuestion ? (phaseIdx === 3 ? "See Results" : "Next Phase →") : "Next →";

    return (
      <section className="quiz-wrap">
        <div className={clsx("phase-banner", meta.bannerClass)}>
          <div className="pb-icon">{meta.icon}</div>
          <div>
            <div className="pb-title">Phase {phaseIdx}: {meta.title}</div>
            <div className="pb-sub">{meta.sub}</div>
          </div>
          {timedMode && !currentAnswer && (
            <div className="timer-wrap">
              <div className={clsx("timer", { warn: timeLeft <= 20 && timeLeft > 10, danger: timeLeft <= 10 })}>{timeLeft}s</div>
            </div>
          )}
          <div className="pb-count">Q{phaseCurrent + 1} / {phaseQs[phaseIdx].length}</div>
        </div>

        <div className="prog-track"><div className={clsx("prog-fill", meta.fillClass)} style={{ width: `${phasePct}%` }} /></div>

        <div className="q-card">
          <div className="q-label">
            Question {phaseCurrent + 1}
            <span className="topic-badge">{q.topic}</span>
            <span className="difficulty">{q.difficulty}</span>
          </div>
          <div className="q-text">{q.question}</div>
        </div>

        <div className="opts">
          {q.options.map((option, idx) => {
            const isChosen = currentAnswer?.chosenIdx === idx;
            const isCorrect = q.correctIndex === idx;
            const optionClass = clsx("opt", {
              "s-correct": currentAnswer && isChosen && isCorrect,
              "s-wrong": currentAnswer && isChosen && !isCorrect,
              "r-correct": currentAnswer && !isChosen && isCorrect,
            });
            return (
              <button className={optionClass} key={`${option}-${idx}`} onClick={() => handleAnswer(idx)} disabled={Boolean(currentAnswer)}>
                <span className="opt-key">{letters[idx]}</span>
                {option}
              </button>
            );
          })}
        </div>

        {currentAnswer && (
          <>
            <div className={clsx("expl", currentAnswer.chosenIdx === currentAnswer.correctIdx ? "ec" : "ew")}>
              <strong>{currentAnswer.chosenIdx === currentAnswer.correctIdx ? "✓ Correct!" : "✗ Not quite"}</strong>
              {currentAnswer.explanation}
              <div className="source-hint">Source hint: {currentAnswer.sourceHint}</div>
            </div>

            <div className="conf-row">
              <span className="conf-lbl">How confident were you?</span>
              <div className="conf-btns">
                <button className={clsx("cbtn", { sel: currentAnswer.conf === 1 })} onClick={() => setConfidence(1)}>😰 Guessing</button>
                <button className={clsx("cbtn", { sel: currentAnswer.conf === 2 })} onClick={() => setConfidence(2)}>🤔 Unsure</button>
                <button className={clsx("cbtn", { sel: currentAnswer.conf === 3 })} onClick={() => setConfidence(3)}>💪 Confident</button>
              </div>
            </div>

            <div className="act-row">
              <button className="btn btn-ghost" onClick={() => { setPhase("upload"); resetQuizState(false); }}><RotateCcw size={17} /> Restart</button>
              <button className="btn btn-primary" onClick={nextStep}>{nextLabel}</button>
            </div>
          </>
        )}
      </section>
    );
  }

  function renderResults() {
    const total = answers.length || 1;
    const correct = answers.filter((a) => a.chosenIdx === a.correctIdx).length;
    const pct = Math.round((correct / total) * 100);
    const grade = pct >= 90 ? "Outstanding 🏆" : pct >= 75 ? "Great work 🎉" : pct >= 60 ? "Good effort 👍" : "Keep going 📚";
    const scoreColor = historyColor(pct);
    const p1 = phaseScore(1);
    const p2 = phaseScore(2);
    const p3 = phaseScore(3);
    const topics = topicBreakdown();
    const weak = [...new Set(answers.filter((a) => a.chosenIdx !== a.correctIdx || a.conf === 1).map((a) => a.topic))];
    const wrong = answers.filter((a) => a.chosenIdx !== a.correctIdx).slice(0, 7);

    return (
      <section className="results-wrap">
        <div className="r-hero">
          <div className="r-score" style={{ color: scoreColor }}>{pct}%</div>
          <div className="r-grade">{grade} — {correct} of {answers.length} correct</div>
        </div>

        <div className="stat-grid">
          <ScoreCard label="🔍 Knowledge" value={p1} />
          <ScoreCard label="🎯 Weak Spot" value={p2} />
          <ScoreCard label="🔥 Challenge" value={p3} />
        </div>

        <section className="panel">
          <div className="section-hd"><Brain size={18} /> Topic breakdown</div>
          <div className="sp-bars">
            {topics.map((t) => (
              <div className="sp-row" key={t.topic}>
                <div className="sp-label">{t.topic}</div>
                <div className="sp-track"><div className="sp-bar" style={{ width: `${t.pct}%`, background: historyColor(t.pct) }} /></div>
                <div className="sp-pct" style={{ color: historyColor(t.pct) }}>{t.pct}%</div>
              </div>
            ))}
          </div>
        </section>

        {weak.length > 0 && (
          <section className="panel">
            <div className="section-hd"><Target size={18} /> Topics to review</div>
            <div className="weak-tags">{weak.map((t) => <span className="wt" key={t}>{t}</span>)}</div>
          </section>
        )}

        <section className="panel">
          <div className="section-hd"><Flame size={18} /> Questions to revisit</div>
          {wrong.length ? wrong.map((a) => (
            <div className="rev-item" key={a.key}>
              <div className="ri-q">{a.question}</div>
              <div className="ri-a w">✗ Your answer: {a.chosenOpt}</div>
              <div className="ri-a c">✓ Correct answer: {a.correctOpt}</div>
            </div>
          )) : <div className="perfect"><Check size={18} /> Perfect score — nothing to revisit!</div>}
        </section>

        <div className="act-row">
          <button className="btn btn-ghost" onClick={exportResults}>Export results JSON</button>
          <button className="btn btn-primary" onClick={() => { setPhase("upload"); resetQuizState(true); }}>Study a New Document</button>
        </div>
      </section>
    );
  }

  function phaseScore(p: PhaseNumber) {
    const items = answers.filter((a) => a.phase === p);
    if (!items.length) return 0;
    return Math.round((items.filter((a) => a.chosenIdx === a.correctIdx).length / items.length) * 100);
  }

  function topicBreakdown() {
    const map = new Map<string, { total: number; correct: number }>();
    for (const a of answers) {
      const item = map.get(a.topic) ?? { total: 0, correct: 0 };
      item.total += 1;
      if (a.chosenIdx === a.correctIdx) item.correct += 1;
      map.set(a.topic, item);
    }
    return [...map.entries()].map(([topic, v]) => ({ topic, pct: Math.round((v.correct / v.total) * 100) })).sort((a, b) => a.pct - b.pct);
  }
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const cls = value >= 70 ? "good" : value >= 50 ? "ok" : "bad";
  return (
    <div className={clsx("sc", cls)}>
      <div className="sv">{value}%</div>
      <div className="sl">{label}</div>
    </div>
  );
}

function historyColor(value: number) {
  if (value >= 75) return "var(--emerald)";
  if (value >= 50) return "var(--amber)";
  return "var(--rose)";
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
