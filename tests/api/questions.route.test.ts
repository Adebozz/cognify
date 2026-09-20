import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLlmPayload, STUDY_TEXT } from "../fixtures/questions";

// Integration tests for POST /api/questions. External boundaries are mocked:
// DOCX extraction (mammoth), the LLM call, and the rate limiter. Everything
// else — form parsing, chunking, the rule engine, status codes — runs for real.

const extractRawText = vi.fn();
vi.mock("mammoth", () => ({ default: { extractRawText: (...a: unknown[]) => extractRawText(...a) } }));

const generateQuestionsFromText = vi.fn();
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, generateQuestionsFromText: (...a: unknown[]) => generateQuestionsFromText(...a) };
});

const checkRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return { ...actual, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) };
});

const { POST } = await import("@/app/api/questions/route");
const { InsufficientContentError } = await import("@/lib/ai");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function docx(name = "notes.docx") {
  return new File([new Uint8Array([80, 75, 3, 4])], name, { type: DOCX_MIME });
}

function request(fields: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost/api/questions", { method: "POST", body: form, headers });
}

async function call(fields: Record<string, string | File>, headers?: Record<string, string>) {
  const res = await POST(request(fields, headers));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  extractRawText.mockReset().mockResolvedValue({ value: STUDY_TEXT });
  generateQuestionsFromText.mockReset().mockResolvedValue(makeLlmPayload(5));
  checkRateLimit.mockReset().mockResolvedValue({ success: true, remaining: 5, limit: 6, resetAt: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("input validation", () => {
  it("400 when no file is uploaded", async () => {
    const { status, body } = await call({ phase: "1" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/No valid file/);
  });

  it("400 for unsupported file types", async () => {
    const { status, body } = await call({ file: new File(["hi"], "a.zip", { type: "application/zip" }) });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unsupported file type/);
  });

  it("400 for images (OCR not supported yet)", async () => {
    const { status, body } = await call({ file: new File(["x"], "a.png", { type: "image/png" }) });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Image reading is not available/);
  });

  it("400 when the document has too little readable text", async () => {
    extractRawText.mockResolvedValue({ value: "Too short." });
    const { status, body } = await call({ file: docx() });
    expect(status).toBe(400);
    expect(body.error).toMatch(/could not extract enough readable text/);
  });

  it("detects DOCX by extension even with a generic MIME type", async () => {
    const { status } = await call({ file: new File(["x"], "Notes.DOCX", { type: "application/octet-stream" }) });
    expect(status).toBe(200);
  });

  it("500 with a message when extraction throws (corrupt file)", async () => {
    extractRawText.mockRejectedValue(new Error("Corrupted zip"));
    const { status, body } = await call({ file: docx() });
    expect(status).toBe(500);
    expect(body.error).toBe("Corrupted zip");
  });

  it("tolerates malformed weakTopics JSON and an invalid phase", async () => {
    const { status } = await call({ file: docx(), weakTopics: "{not json", phase: "99" });
    expect(status).toBe(200);
  });
});

describe("demo mode (default)", () => {
  it("uses the rule engine and never calls the LLM or rate limiter", async () => {
    const { status, body } = await call({ file: docx() });
    expect(status).toBe(200);
    expect(body.meta.generator).toBe("rule-engine");
    expect(body.questions).toHaveLength(5);
    expect(generateQuestionsFromText).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("returns questions with 4 options and a valid correctIndex", async () => {
    const { body } = await call({ file: docx() });
    for (const q of body.questions) {
      expect(q.options).toHaveLength(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThanOrEqual(3);
    }
  });
});

describe("real (LLM) mode", () => {
  const real = { demoMode: "false" };

  it("returns LLM questions and reports remaining quota", async () => {
    const { status, body } = await call({ file: docx(), ...real }, { "x-forwarded-for": "203.0.113.9" });
    expect(status).toBe(200);
    expect(body.meta).toMatchObject({ generator: "llm", byok: false, rateLimitRemaining: 5 });
    expect(checkRateLimit).toHaveBeenCalledWith("203.0.113.9");
  });

  it("429 when the daily free limit is reached", async () => {
    checkRateLimit.mockResolvedValue({ success: false, remaining: 0, limit: 6, resetAt: 123 });
    const { status, body } = await call({ file: docx(), ...real });
    expect(status).toBe(429);
    expect(body).toMatchObject({ code: "rate_limited", resetAt: 123 });
    expect(generateQuestionsFromText).not.toHaveBeenCalled();
  });

  it("BYOK requests skip the rate limiter and pass the key through", async () => {
    const { body } = await call({ file: docx(), ...real }, { "x-user-api-key": "  sk-user  " });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(generateQuestionsFromText.mock.calls[0][0].userApiKey).toBe("sk-user");
    expect(body.meta.byok).toBe(true);
  });

  it("falls back to the rule engine when the LLM fails", async () => {
    generateQuestionsFromText.mockRejectedValue(new Error("529 overloaded"));
    const { status, body } = await call({ file: docx(), ...real });
    expect(status).toBe(200);
    expect(body.meta).toMatchObject({ generator: "rule-engine-fallback", llmError: true });
    expect(body.questions).toHaveLength(5);
  });

  it("422 when the LLM says the content is insufficient", async () => {
    generateQuestionsFromText.mockRejectedValue(new InsufficientContentError());
    const { status, body } = await call({ file: docx(), ...real });
    expect(status).toBe(422);
    expect(body.code).toBe("insufficient_content");
  });

  it("422 before calling the LLM when chunking finds too little teachable text", async () => {
    extractRawText.mockResolvedValue({ value: "0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9\n\n".repeat(20) });
    const { status, body } = await call({ file: docx(), ...real });
    expect(status).toBe(422);
    expect(body.code).toBe("insufficient_content");
    expect(generateQuestionsFromText).not.toHaveBeenCalled();
  });

  it("forwards phase and weak topics to the generator", async () => {
    await call({ file: docx(), ...real, phase: "2", weakTopics: JSON.stringify(["Calvin Cycle", 7]) });
    expect(generateQuestionsFromText.mock.calls[0][0]).toMatchObject({ phase: 2, weakTopics: ["Calvin Cycle"] });
  });
});
