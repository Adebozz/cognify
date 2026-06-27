import { NextResponse } from "next/server";
import { generateQuestions } from "@/lib/ai";
import { generateDemoQuestions } from "@/lib/mock";
import type { PhaseNumber } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

function isPhase(value: number): value is PhaseNumber {
  return value === 1 || value === 2 || value === 3;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const phaseRaw = Number(formData.get("phase") ?? 1);
    const weakRaw = String(formData.get("weakTopics") ?? "[]");
    const previousSummary = String(formData.get("previousSummary") ?? "");
    const requestDemoMode = String(formData.get("demoMode") ?? "").toLowerCase() === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!isPhase(phaseRaw)) {
      return NextResponse.json({ error: "Invalid phase." }, { status: 400 });
    }

    let weakTopics: string[] = [];
    try {
      const parsed = JSON.parse(weakRaw);
      if (Array.isArray(parsed)) weakTopics = parsed.map(String).slice(0, 12);
    } catch {
      weakTopics = [];
    }

    const input = {
      file,
      phase: phaseRaw,
      weakTopics,
      previousSummary: previousSummary.slice(0, 1800),
    };

    const payload = requestDemoMode
      ? generateDemoQuestions(input)
      : await generateQuestions(input);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
