import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLlmPayload, makeQuestion } from "../fixtures/questions";

// Mock the Anthropic SDK so no real API calls (or credits) are ever used.
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function Anthropic(this: { messages: unknown }) {
    this.messages = { create: createMock };
  }),
}));

const { generateQuestionsFromText, InsufficientContentError, assertSupportedFile } = await import("@/lib/ai");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const reply = (text: string) => ({ content: [{ type: "text", text }] });
const input = {
  text: "Photosynthesis is defined as ...",
  documentType: "textbook",
  phase: 1 as const,
  weakTopics: [],
};

beforeEach(() => {
  createMock.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
});

describe("generateQuestionsFromText", () => {
  it("returns 5 validated questions from a clean JSON reply", async () => {
    createMock.mockResolvedValueOnce(reply(JSON.stringify(makeLlmPayload(5))));
    const result = await generateQuestionsFromText(input);
    expect(result.questions).toHaveLength(5);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("extracts JSON wrapped in markdown fences and chatter", async () => {
    createMock.mockResolvedValueOnce(
      reply("Sure! Here you go:\n```json\n" + JSON.stringify(makeLlmPayload(5)) + "\n```\nGood luck!")
    );
    await expect(generateQuestionsFromText(input)).resolves.toHaveProperty("questions");
  });

  it("shuffles options but keeps correctIndex pointing at the right answer", async () => {
    const payload = makeLlmPayload(5);
    const correctTexts = payload.questions.map((q) => q.options[q.correctIndex]);
    createMock.mockResolvedValueOnce(reply(JSON.stringify(payload)));

    const result = await generateQuestionsFromText(input);
    result.questions.forEach((q, i) => {
      expect(q.options[q.correctIndex]).toBe(correctTexts[i]);
      expect([...q.options].sort()).toEqual([...payload.questions[i].options].sort());
    });
  });

  it("retries once with higher temperature when validation fails, then succeeds", async () => {
    const bad = makeLlmPayload(5);
    bad.questions[0] = makeQuestion({ topic: "general" });
    createMock
      .mockResolvedValueOnce(reply(JSON.stringify(bad)))
      .mockResolvedValueOnce(reply(JSON.stringify(makeLlmPayload(5))));

    await generateQuestionsFromText(input);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0].temperature).toBe(0.8);
    expect(createMock.mock.calls[1][0].temperature).toBe(1.0);
  });

  it("throws after two failed attempts so the route can fall back to the rule engine", async () => {
    createMock.mockResolvedValue(reply("I cannot help with that."));
    await expect(generateQuestionsFromText(input)).rejects.toThrow(/did not contain JSON/);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces network/API errors after retrying", async () => {
    createMock.mockRejectedValue(new Error("529 overloaded"));
    await expect(generateQuestionsFromText(input)).rejects.toThrow("529 overloaded");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws InsufficientContentError immediately without retrying", async () => {
    createMock.mockResolvedValueOnce(reply('{"error":"insufficient_content"}'));
    await expect(generateQuestionsFromText(input)).rejects.toBeInstanceOf(InsufficientContentError);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("prefers the user's own key (BYOK) over the server key", async () => {
    createMock.mockResolvedValueOnce(reply(JSON.stringify(makeLlmPayload(5))));
    await generateQuestionsFromText({ ...input, userApiKey: "user-key" });
    expect(Anthropic).toHaveBeenLastCalledWith({ apiKey: "user-key" });
  });

  it("fails fast with a clear error when no key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(generateQuestionsFromText(input)).rejects.toThrow(/No Anthropic API key/);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("assertSupportedFile", () => {
  const file = (type: string, bytes = 10) => new File([new Uint8Array(bytes)], "f", { type });

  it.each(["application/pdf", "image/png", "image/jpeg", "image/webp"])("accepts %s", (type) => {
    expect(() => assertSupportedFile(file(type))).not.toThrow();
  });

  it("rejects unsupported types", () => {
    expect(() => assertSupportedFile(file("application/zip"))).toThrow(/Unsupported file type/);
  });

  it("rejects files over MAX_UPLOAD_MB", () => {
    vi.stubEnv("MAX_UPLOAD_MB", "1");
    expect(() => assertSupportedFile(file("application/pdf", 1024 * 1024 + 1))).toThrow(/Maximum upload size is 1MB/);
  });
});
