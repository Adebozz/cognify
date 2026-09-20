import { describe, expect, it } from "vitest";
import { cleanExtractedText, detectDocumentType, prepareContentForLLM } from "@/lib/chunking";

// Replaces the old ad-hoc chunktest.test.ts script with real assertions.
const SCIENTIFIC_SAMPLE = `
Abstract
Deep learning models for chest radiograph interpretation have shown expert-level performance. However, underdiagnosis bias refers to the systematic failure to detect disease in specific patient subgroups, which leads to delayed treatment. This occurs because training data underrepresents these populations.

Methods
We evaluated three models on 100,000 radiographs [12, 14-16] (Seyyed-Kalantari et al., 2021). Underdiagnosis rate is defined as the false negative rate among patients labelled "no finding". For example, intersectional subgroups such as Black female patients showed higher rates compared to the overall population, whereas white male patients showed lower rates.

Figure 3: ROC curves for all models across subgroups.
Table 2: 0.82 0.79 0.85 0.91 0.77 0.88 0.83 0.90 0.76 0.81 0.84 0.87 0.79 0.82

Results
Subgroup false negative rates varied significantly (p < 0.05).

Discussion
The underdiagnosis disparity is caused by label noise and dataset shift. As a result, deploying such models without subgroup auditing poses a risk because affected patients would be sent home without treatment. Therefore, subgroup-stratified evaluation should be a requirement before clinical deployment.

References
1. Seyyed-Kalantari L, et al. Underdiagnosis bias. Nat Med. 2021. doi:10.1038/s41591-021-01595-0
2. Another citation here. https://example.com/paper
`;

describe("cleanExtractedText", () => {
  it("strips DOIs, URLs, emails, bracket and inline citations", () => {
    const out = cleanExtractedText(
      "Bias is common [3, 5-7] (Smith et al., 2020). See doi:10.1000/xyz123 or https://a.b/c, email me@uni.ac.uk today."
    );
    expect(out).not.toMatch(/\[\d/);
    expect(out).not.toMatch(/et al/);
    expect(out).not.toMatch(/10\.1000/);
    expect(out).not.toMatch(/https?:/);
    expect(out).not.toMatch(/@/);
    expect(out).toContain("Bias is common");
  });

  it("removes figure captions and standalone page numbers", () => {
    const out = cleanExtractedText("Intro text here.\nFigure 2: A chart.\nPage 4 of 10\n12\nMore text.");
    expect(out).not.toMatch(/Figure 2/);
    expect(out).not.toMatch(/Page 4/);
    expect(out).not.toMatch(/^12$/m);
    expect(out).toContain("More text.");
  });

  it("cuts a references section in the back half of the document", () => {
    const body = "Real content sentence. ".repeat(40);
    const out = cleanExtractedText(`${body}\nReferences\n1. Someone. A paper. 2020.`);
    expect(out).not.toMatch(/References/);
    expect(out).not.toMatch(/A paper/);
  });

  it("keeps a 'References' heading that appears early (e.g. a table of contents)", () => {
    const out = cleanExtractedText(`Contents\nReferences\n${"Main body text. ".repeat(40)}`);
    expect(out).toContain("Main body text.");
  });

  it("normalises Windows line endings and collapses blank lines", () => {
    const out = cleanExtractedText("Line one\r\n\r\n\r\n\r\nLine   two");
    expect(out).toBe("Line one\n\nLine two");
  });
});

describe("detectDocumentType", () => {
  it.each([
    ["scientific_article", SCIENTIFIC_SAMPLE],
    ["exam", "Answer all questions. Question 1 (5 marks) Question 2 (10 marks)"],
    ["manual", "User guide. Step 1: installation. Step 2 ... Troubleshooting and warranty."],
    ["report", "Executive summary. Our findings and recommendations for the annual report."],
    ["textbook", "Chapter 3. Learning objectives. Key terms. Exercises at the end."],
    ["lecture_notes", "Lecture 4 — today's topics. Recap of slide 3."],
    ["unknown", "Just a short shopping list: eggs, milk, bread."],
  ])("detects %s", (expected, text) => {
    expect(detectDocumentType(text)).toBe(expected);
  });
});

describe("prepareContentForLLM", () => {
  const result = prepareContentForLLM(SCIENTIFIC_SAMPLE.repeat(3));

  it("classifies the sample and marks it sufficient", () => {
    expect(result.documentType).toBe("scientific_article");
    expect(result.sufficient).toBe(true);
  });

  it("drops references, DOIs and number-dense table dumps", () => {
    expect(result.text).not.toMatch(/10\.\d{4}/);
    expect(result.text).not.toMatch(/0\.82 0\.79/);
  });

  it("keeps concept-rich paragraphs in original order", () => {
    const def = result.text.indexOf("underdiagnosis bias refers to");
    const discussion = result.text.indexOf("caused by label noise");
    expect(def).toBeGreaterThanOrEqual(0);
    expect(discussion).toBeGreaterThan(def);
  });

  it("never exceeds the 24k character budget", () => {
    const huge = prepareContentForLLM(
      "Photosynthesis is defined as the conversion of light energy because plants need glucose. ".repeat(8) +
        "\n\n" +
        Array.from({ length: 500 }, (_, i) =>
          `Paragraph ${i}: this concept is defined as something important because it leads to results, for example in practice.`.repeat(3)
        ).join("\n\n")
    );
    expect(huge.selectedChars).toBeLessThanOrEqual(24_000);
    expect(huge.originalChars).toBeGreaterThan(huge.selectedChars);
  });

  it("reports insufficient content for thin documents", () => {
    const thin = prepareContentForLLM("Title page\n\nA short caption only.");
    expect(thin.sufficient).toBe(false);
  });

  it("handles empty input without throwing", () => {
    expect(prepareContentForLLM("")).toMatchObject({ text: "", sufficient: false, selectedChars: 0 });
  });
});
