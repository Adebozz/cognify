import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { QuizPayloadSchema, type QuizPayload } from "./schemas";
import { buildQuestionPrompt, SYSTEM_PROMPT, type PhaseNumber } from "./prompts";
import { generateDemoQuestions } from "./mock";

type GenerateInput = {
  file: File;
  phase: PhaseNumber;
  weakTopics: string[];
  previousSummary?: string;
};

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export function assertSupportedFile(file: File) {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new Error("Unsupported file type. Upload a PDF, PNG, JPG, JPEG, or WEBP file.");
  }

  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? "15");
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File is too large. Maximum upload size is ${maxMb}MB.`);
  }
}

export async function generateQuestions(input: GenerateInput): Promise<QuizPayload> {
  assertSupportedFile(input.file);

  // Development first: demo mode is ON by default so you can build and test
  // the full app without spending API credits. Later, set DEMO_MODE=false
  // in .env.local to enable the real OpenAI/Claude pipeline.
  const demoMode = (process.env.DEMO_MODE ?? "true").toLowerCase() !== "false";
  if (demoMode) return generateDemoQuestions(input);

  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (provider === "anthropic") return generateWithAnthropic(input);
  return generateWithOpenAI(input);
}

async function generateWithOpenAI(input: GenerateInput): Promise<QuizPayload> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env.local");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildQuestionPrompt(input);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${input.file.type};base64,${base64}`;

  const fileBlock = input.file.type === "application/pdf"
    ? {
        type: "input_file",
        filename: input.file.name || "study-material.pdf",
        file_data: dataUrl,
      }
    : {
        type: "input_image",
        image_url: dataUrl,
        detail: "high",
      };

  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-5.5",
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          fileBlock as never,
          { type: "input_text", text: prompt } as never,
        ],
      },
    ],
    text: {
      format: zodTextFormat(QuizPayloadSchema, "cognify_questions"),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("The AI did not return structured questions.");
  return QuizPayloadSchema.parse(parsed);
}

async function generateWithAnthropic(input: GenerateInput): Promise<QuizPayload> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY in .env.local");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildQuestionPrompt(input);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const materialBlock = input.file.type === "application/pdf"
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: input.file.type,
          data: base64,
        },
      };

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          materialBlock as never,
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  const json = extractJson(text);
  return QuizPayloadSchema.parse(JSON.parse(json));
}

function extractJson(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("The AI response did not contain JSON.");
  }
  return cleaned.slice(first, last + 1);
}
