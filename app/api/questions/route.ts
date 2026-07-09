import { NextResponse } from "next/server";
import { createRequire } from "module";
import mammoth from "mammoth";
import { generateDemoQuestions } from "@/lib/mock";
import { generateQuestionsFromStudyText } from "@/lib/studyQuestionEngine";

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

    const payload = generateQuestionsFromStudyText({
      text: extractedText.slice(0, 150000),
      fileName: file.name,
      phase,
      weakTopics,
    });

    if (!payload.questions.length) {
      const demoPayload = generateDemoQuestions({
        file,
        phase,
        weakTopics,
        previousSummary: "",
      });

      return NextResponse.json({
        ...demoPayload,
        meta: {
          ...meta,
          engine: "fallback-demo-engine",
          warning: "The document was readable, but not enough good study questions could be generated.",
        },
      });
    }

    return NextResponse.json({
      ...payload,
      meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate questions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}