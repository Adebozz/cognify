# Cognify

Cognify is an adaptive exam-prep web app built with **Next.js**. It helps students turn study materials into personalised revision sessions using a 3-phase quiz flow: baseline knowledge scan, weak-spot practice, and final challenge questions.

The current version runs in **demo/development mode**, so the full app experience can be tested without using paid AI API credits.

## Features

* PDF and image upload interface
* Built-in demo question engine
* 3-phase adaptive revision flow
* Weak-topic detection
* Confidence scoring
* Timed mode
* Instant answer explanations
* Topic mastery breakdown
* Results summary
* Session history
* JSON export
* API-ready structure for future OpenAI/Claude integration

## Revision Flow

Cognify uses a 3-phase learning structure:

1. **Knowledge Scan**
   Broad questions across the study material to identify the student's baseline knowledge.

2. **Weak Spot Drill**
   Targeted questions based on wrong answers and low-confidence responses.

3. **Final Challenge**
   Harder synthesis questions designed to test overall understanding and exam readiness.

## Tech Stack

* **Framework:** Next.js
* **Language:** TypeScript
* **Styling:** CSS
* **Runtime:** Node.js
* **AI Integration:** OpenAI/Claude-ready backend route
* **Current Mode:** Demo question engine

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cognify.git
cd cognify
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a local environment file:

```bash
cp .env.example .env.local
```

For development, keep demo mode enabled:

```env
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

### 4. Run the development server

```bash
npm run dev
```

Open the app in your browser:

```txt
http://localhost:3000
```

## Testing Without API Credits

Cognify currently supports full testing without OpenAI or Claude API usage.

You can test the app in two ways:

1. Click **Try sample session**
2. Upload any PDF/image and start a session

When demo mode is enabled, the app uses the built-in mock question engine instead of making external API requests.

## Environment Variables

| Variable                   | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`        | Server key for Real AI mode (Claude Haiku question generation)     |
| `ANTHROPIC_MODEL`          | Optional model override (default `claude-haiku-4-5-20251001`)      |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST URL — enables persistent rate limiting in prod  |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token                                           |
| `RATE_LIMIT_PER_DAY`       | Optional: real-AI calls per IP per day (default 6 = 2 sessions)    |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `AI_PROVIDER` | Legacy file-based pipeline in `lib/ai.ts` (unused by the main route) |

Set these locally in `.env.local` and in the Vercel project settings for production.
Without Upstash vars, rate limiting falls back to in-memory (fine for local dev only).

## Real AI Mode

Demo mode (free, unlimited, rule-based questions) is the default. Users switch to
**Real AI mode** with the toggle on the upload screen — no env change or redeploy needed.

Real AI mode flow in `/api/questions`:

1. Rate limit on the server key: 6 calls/day per IP (skipped for BYOK requests)
2. Clean + chunk extracted text (`lib/chunking.ts`) — strips references, DOIs,
   figure captions, page numbers; detects document type; selects best ~24k chars
3. Claude Haiku generates exactly 5 questions (`lib/ai.ts`, prompt in `lib/prompts.ts`)
4. Output validated (`lib/schemas.ts`): shape, vague-topic blocklist,
   option-length giveaway check, citation-question guard — one retry on failure
5. If the LLM fails → automatic fallback to the rule engine
   (`meta.generator: "rule-engine-fallback"`)
6. If content is too thin → friendly `422` with `code: "insufficient_content"`

**BYOK:** users can paste their own Anthropic API key on the upload screen. It is
sent as the `x-user-api-key` header, held in React state only (never stored), and
bypasses the daily rate limit.

Check `meta.generator` (`llm` / `rule-engine` / `rule-engine-fallback`) and
`meta.documentType` in the API response to verify routing.

After changing `.env.local`, restart the development server.

## Project Structure

```txt
app/
  page.tsx                  Main user interface and quiz flow
  globals.css               Global styling
  api/
    questions/
      route.ts              Backend route for demo/API question generation

lib/
  ai.ts                     Claude Haiku text pipeline + legacy file-based layer
  chunking.ts               Text cleaning, doc-type detection, best-content selection
  rateLimit.ts              6/day/IP limit (Upstash REST in prod, in-memory dev)
  mock.ts                   Built-in development question engine
  prompts.ts                Prompt templates (LLM system/user prompts per phase)
  schemas.ts                Zod validation + LLM output quality guards
  studyQuestionEngine.ts    Rule/template question engine (demo mode + fallback)
```

## Available Scripts

```bash
npm run dev
```

Starts the local development server.

```bash
npm run build
```

Builds the app for production.

```bash
npm run start
```

Runs the production build locally.

```bash
npm run lint
```

Runs linting checks.

## Roadmap

* Add user authentication
* Save sessions to a database
* Add Supabase/PostgreSQL support
* Add review-only mode for weak topics
* Add short-answer questions
* Add flashcard mode
* Add shareable PDF reports
* Add real PDF text extraction before API mode
* Add cost-efficient AI question generation
* Add deployment support

## Security Notes

Environment files such as `.env.local` should never be committed to GitHub.

Make sure these files are included in `.gitignore`:

```txt
.env
.env.local
.env*.local
node_modules
.next
```

## Status

Cognify is currently in active development. The app is fully testable in demo mode while the real AI question-generation pipeline is prepared for later integration.
