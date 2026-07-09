import { NextResponse } from "next/server";
import { createRequire } from "module";
import { generateDemoQuestions } from "@/lib/mock";
import { generateQuestionsFromPdfText } from "@/lib/pdfQuestionEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PdfParseResult = {
  text?: string;
  numpages?: number;
};

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as PdfParseFn;

type PhaseNumber = 1 | 2 | 3;

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const phase = parsePhase(formData.get("phase"));
    const weakTopics = parseWeakTopics(formData.get("weakTopics"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No valid file was uploaded." },
        { status: 400 }
      );
    }

    if (file.type === "application/pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const parsed = await pdfParse(buffer);
      const extractedText = parsed.text?.trim();

      if (!extractedText || extractedText.length < 100) {
        return NextResponse.json(
          {
            error:
              "I could not extract enough readable text from this PDF. Try a text-based PDF instead of a scanned image PDF.",
          },
          { status: 400 }
        );
      }

      const payload = generateQuestionsFromPdfText({
        text: extractedText.slice(0, 120000),
        fileName: file.name,
        phase,
        weakTopics,
      });

      return NextResponse.json({
        ...payload,
        meta: {
          engine: "local-pdf-engine",
          pages: parsed.numpages ?? null,
          extractedCharacters: extractedText.length,
        },
      });
    }

    if (file.type.startsWith("image/")) {
      const payload = generateDemoQuestions({
        file,
        phase,
        weakTopics,
        previousSummary: "",
      });

      return NextResponse.json({
        ...payload,
        meta: {
          engine: "demo-image-fallback",
          note: "Image OCR will be added later.",
        },
      });
    }

    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF or image." },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate questions.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}