import { NextResponse } from "next/server";
import { createRequire } from "module";
import mammoth from "mammoth";
import { generateQuestionsFromStudyText } from "@/lib/studyQuestionEngine";
import { generateQuestionsFromText, InsufficientContentError } from "@/lib/ai";
import { prepareContentForLLM } from "@/lib/chunking";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { QuizPayload } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PhaseNumber = 1 | 2 | 3;

type PdfParseResult = {
  text?: string;
  numpages?: number;
};

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as PdfParseFn;

function parsePhase(value: FormDataEntryValue | null): PhaseNumber {
  const phase = Number(value);
  if (phase === 1 || phase === 2 || phase === 3) return phase;
  return 1;
}

function parseWeakTopics(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isDocx(file: File) {
  return (
    file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const phase = parsePhase(formData.get("phase"));
    const weakTopics = parseWeakTopics(formData.get("weakTopics"));
    const previousSummary =
      typeof formData.get("previousSummary") === "string"
        ? (formData.get("previousSummary") as string)
        : undefined;
    // Demo mode is the default: only "false" switches to the real LLM path.
    const demoMode = formData.get("demoMode") !== "false";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No valid file was uploaded." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";
    let meta: Record<string, unknown> = {
      fileName: file.name,
      fileType: file.type || "unknown",
    };

    if (file.type === "application/pdf") {
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text?.trim() || "";
      meta = {
        ...meta,
        engine: "local-pdf-text-extractor",
        pages: parsed.numpages ?? null,
        extractedCharacters: extractedText.length,
      };
    } else if (isDocx(file)) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value?.trim() || "";
      meta = {
        ...meta,
        engine: "local-docx-text-extractor",
        extractedCharacters: extractedText.length,
      };
    } else if (file.type.startsWith("image/")) {
      return NextResponse.json(
        {
          error:
            "Image reading is not available in local mode yet. Please upload a text-based PDF or DOCX for now.",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, DOCX, or image." },
        { status: 400 }
      );
    }

    if (!extractedText || extractedText.length < 300) {
      return NextResponse.json(
        {
          error:
            "I could not extract enough readable text from this file. If it is a scanned PDF, convert it to text first or upload a DOCX/text-based PDF.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------------
    // REAL MODE: rate limit → clean/chunk → LLM → validate → fallback
    // ------------------------------------------------------------------
    if (!demoMode) {
      const userApiKey = req.headers.get("x-user-api-key")?.trim() || undefined;

      // BYOK requests bypass the server-key rate limit.
      if (!userApiKey) {
        const rl = await checkRateLimit(getClientIp(req));
        if (!rl.success) {
          return NextResponse.json(
            {
              error:
                "Daily free AI limit reached (6 generations = 2 full sessions). Try again tomorrow, use demo mode, or add your own API key.",
              code: "rate_limited",
              resetAt: rl.resetAt,
            },
            { status: 429 }
          );
        }
        meta = { ...meta, rateLimitRemaining: rl.remaining };
      }

      const chunked = prepareContentForLLM(extractedText);
      meta = {
        ...meta,
        documentType: chunked.documentType,
        selectedCharacters: chunked.selectedChars,
      };

      if (!chunked.sufficient) {
        return NextResponse.json(
          {
            error:
              "This document does not contain enough teachable text to build a good quiz. Try lecture notes, a textbook chapter, or a report with readable paragraphs.",
            code: "insufficient_content",
          },
          { status: 422 }
        );
      }

      try {
        const payload = await generateQuestionsFromText({
          text: chunked.text,
          documentType: chunked.documentType,
          phase,
          weakTopics,
          previousSummary,
          userApiKey,
        });
        return NextResponse.json({
          ...payload,
          meta: { ...meta, generator: "llm", byok: Boolean(userApiKey) },
        });
      } catch (err) {
        if (err instanceof InsufficientContentError) {
          return NextResponse.json(
            {
              error:
                "The AI could not find enough substantive content in this document to write good questions. Try a fuller document.",
              code: "insufficient_content",
            },
            { status: 422 }
          );
        }
        // LLM failed → automatic fallback to the rule engine below.
        console.error("[questions] LLM failed, falling back to rule engine:", err);
        meta = { ...meta, generator: "rule-engine-fallback", llmError: true };
      }
    }

    // ------------------------------------------------------------------
    // DEMO MODE (default) or LLM fallback: rule/template engine
    // ------------------------------------------------------------------
    const payload: QuizPayload = generateQuestionsFromStudyText({
      text: extractedText.slice(0, 180000),
      fileName: file.name,
      phase,
      weakTopics,
    });

    if (payload.questions.length < 5) {
      return NextResponse.json(
        {
          error:
            "Cognify could read this file, but it could not confidently generate enough good questions from it. Try a clearer study document, lecture notes, textbook chapter, or report with readable sections.",
          code: "insufficient_content",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ...payload,
      meta: { generator: "rule-engine", ...meta },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate questions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
