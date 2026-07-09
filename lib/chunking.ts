// lib/chunking.ts
// Cleans extracted document text and selects the most teachable content
// before sending it to the LLM. Keeps token spend predictable (~24k chars max).

export type DocumentType =
  | "scientific_article"
  | "report"
  | "lecture_notes"
  | "textbook"
  | "manual"
  | "exam"
  | "unknown";

export type ChunkResult = {
  text: string;
  documentType: DocumentType;
  originalChars: number;
  selectedChars: number;
  sufficient: boolean;
};

const MAX_CHARS = 24_000;
const MIN_USEFUL_CHARS = 600;

// ---------- cleaning ----------

const DOI_RE = /\b(doi:\s*)?10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi;
const URL_RE = /https?:\/\/\S+/gi;
const CITATION_BRACKET_RE = /\[\s*\d+(\s*[,–-]\s*\d+)*\s*\]/g;
const INLINE_CITE_RE = /\(\s*[A-Z][A-Za-z'’-]+(?:\s+et\s+al\.?)?,?\s+(?:19|20)\d{2}[a-z]?\s*\)/g;
const FIGURE_CAPTION_RE = /^(figure|fig\.?|table|tbl\.?|scheme|chart)\s*\d+[.:].*$/gim;
const PAGE_NUMBER_RE = /^\s*(page\s+)?\d{1,4}(\s+of\s+\d{1,4})?\s*$/gim;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;

function stripReferencesSection(text: string): string {
  // Cut everything after a references/bibliography heading near the end.
  const re = /^\s*(references|bibliography|works cited|literature cited)\s*$/gim;
  let match: RegExpExecArray | null;
  let cutAt = -1;
  while ((match = re.exec(text)) !== null) {
    // Only trust headings in the back half of the document.
    if (match.index > text.length * 0.4) {
      cutAt = match.index;
      break;
    }
  }
  return cutAt === -1 ? text : text.slice(0, cutAt);
}

export function cleanExtractedText(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n");
  t = stripReferencesSection(t);
  t = t
    .replace(DOI_RE, " ")
    .replace(URL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(CITATION_BRACKET_RE, " ")
    .replace(INLINE_CITE_RE, " ")
    .replace(FIGURE_CAPTION_RE, " ")
    .replace(PAGE_NUMBER_RE, " ");
  // Collapse whitespace but preserve paragraph breaks.
  t = t
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ *\n */g, "\n")
    .trim();
  return t;
}

// ---------- document type detection ----------

export function detectDocumentType(text: string): DocumentType {
  const sample = text.slice(0, 12_000).toLowerCase();
  const score = (patterns: RegExp[]) =>
    patterns.reduce((n, re) => n + (re.test(sample) ? 1 : 0), 0);

  const scientific = score([
    /\babstract\b/,
    /\bmethods?\b|\bmethodology\b/,
    /\bresults\b/,
    /\bdiscussion\b/,
    /\bet al\b/,
    /\bp\s*[<=>]\s*0?\.\d+/,
    /\bconfidence interval\b|\bcohort\b|\bsample size\b/,
  ]);
  const exam = score([
    /\bmarks?\s*[:)\]]|\(\d+\s*marks?\)/,
    /\banswer all questions\b/,
    /\bquestion\s+\d+\b/,
    /\bmultiple choice\b/,
  ]);
  const manual = score([
    /\binstallation\b/,
    /\btroubleshooting\b/,
    /\bwarranty\b/,
    /\bstep \d+\b/,
    /\buser (guide|manual)\b/,
  ]);
  const report = score([
    /\bexecutive summary\b/,
    /\bfindings\b/,
    /\brecommendations\b/,
    /\bquarterly\b|\bannual report\b/,
  ]);
  const textbook = score([
    /\bchapter \d+\b/,
    /\blearning objectives\b/,
    /\bexercises\b/,
    /\bkey terms\b/,
  ]);
  const lecture = score([
    /\blecture\b/,
    /\bslide\b/,
    /\btoday'?s topics\b/,
    /\brecap\b/,
  ]);

  const ranked: Array<[DocumentType, number]> = [
    ["scientific_article", scientific >= 3 ? scientific : 0],
    ["exam", exam >= 2 ? exam : 0],
    ["manual", manual >= 2 ? manual : 0],
    ["report", report >= 2 ? report : 0],
    ["textbook", textbook >= 2 ? textbook : 0],
    ["lecture_notes", lecture >= 2 ? lecture : 0],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "unknown";
}

// ---------- section scoring + selection ----------

type ScoredBlock = {
  text: string;
  index: number;
  score: number;
};

function numberDensity(block: string): number {
  const digits = (block.match(/\d/g) ?? []).length;
  return digits / Math.max(block.length, 1);
}

function scoreBlock(block: string, index: number): ScoredBlock {
  let score = 0;
  const len = block.length;

  // Prefer substantial paragraphs.
  if (len > 300) score += 2;
  else if (len > 120) score += 1;
  else score -= 1;

  // Concept-rich language.
  if (/\b(is defined as|refers to|means that|is called|known as)\b/i.test(block)) score += 3;
  if (/\b(because|therefore|as a result|which leads to|caused by)\b/i.test(block)) score += 2;
  if (/\b(for example|such as|in contrast|compared (to|with)|whereas)\b/i.test(block)) score += 2;
  if (/\b(advantage|disadvantage|limitation|benefit|risk|purpose|aim|objective)\b/i.test(block)) score += 1;

  // Penalise number-dense blocks (tables, stats dumps).
  const density = numberDensity(block);
  if (density > 0.18) score -= 4;
  else if (density > 0.1) score -= 2;

  // Penalise leftover citation-ish noise.
  if (/\bvol\.\s*\d+|\bpp\.\s*\d+|\bissn\b|\bisbn\b/i.test(block)) score -= 3;

  // Penalise all-caps headers and boilerplate.
  const letters = block.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 20) {
    const upper = (block.match(/[A-Z]/g) ?? []).length;
    if (upper / letters.length > 0.5) score -= 2;
  }
  if (/\b(all rights reserved|copyright|creative commons|acknowledg(e)?ments)\b/i.test(block)) score -= 4;

  return { text: block, index, score };
}

/**
 * Clean the text, detect the document type, and select the best ~24k chars
 * of teachable content in original document order.
 */
export function prepareContentForLLM(raw: string): ChunkResult {
  const cleaned = cleanExtractedText(raw);
  const documentType = detectDocumentType(cleaned);

  const blocks = cleaned
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 40);

  const scored = blocks.map(scoreBlock);

  // Pick highest-scoring blocks until budget is filled...
  const picked = new Set<number>();
  let budget = MAX_CHARS;
  for (const block of [...scored].sort((a, b) => b.score - a.score)) {
    if (block.score < 0) break;
    if (block.text.length + 2 > budget) continue;
    picked.add(block.index);
    budget -= block.text.length + 2;
  }

  // ...then reassemble in document order so the narrative flows.
  const selected = scored
    .filter((b) => picked.has(b.index))
    .sort((a, b) => a.index - b.index)
    .map((b) => b.text)
    .join("\n\n");

  return {
    text: selected,
    documentType,
    originalChars: raw.length,
    selectedChars: selected.length,
    sufficient: selected.length >= MIN_USEFUL_CHARS,
  };
}
