# Cognify / ExamCrush

Adaptive exam-prep web app built with Next.js.

The app lets a student upload study material, then runs a 3-phase revision session:

1. **Knowledge Scan** — broad questions to find baseline knowledge.
2. **Weak Spot Drill** — targeted questions based on wrong or low-confidence answers.
3. **Final Challenge** — harder synthesis questions to test overall mastery.

## Current development version

This version is designed so you can finish the app first without spending API credits.

By default:

```env
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

That means the app uses a built-in demo question engine. You can test:

- PDF/image upload UI
- sample session button
- 3-phase quiz flow
- weak-topic detection
- confidence scoring
- timed mode
- explanations and source hints
- topic breakdown
- results page
- session history
- JSON export

The real OpenAI/Claude API path is still kept in the code for later.

## Install

```bash
npm install
```

## Environment setup

Create your local environment file:

```bash
cp .env.example .env.local
```

For now, keep this:

```env
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

## Run locally

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## How to test without API

You have two options:

1. Click **Try sample session**.
2. Upload any PDF/image and click **Start Cognify Session**.

In demo mode, no OpenAI or Claude request is made.

## Later API mode

When the app is finished and you want real question generation, change `.env.local`:

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

Or for Anthropic later:

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-haiku-4-5
```

Restart the dev server after changing `.env.local`.

## Project structure

```txt
app/
  page.tsx                  Main UI and quiz flow
  globals.css               Styling
  api/questions/route.ts    Server route for demo/API question generation
lib/
  ai.ts                     OpenAI/Claude integration, disabled by demo mode
  mock.ts                   Built-in development question engine
  prompts.ts                AI prompts for later
  schemas.ts                Question JSON validation
```

## Next development ideas

- Add login/accounts.
- Save sessions to Supabase/Postgres.
- Add a review-only mode for weak topics.
- Add short-answer questions.
- Add a shareable PDF report.
- Add real PDF text extraction before API mode to reduce cost.
