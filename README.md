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

| Variable                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `DEMO_MODE`             | Enables or disables backend demo mode                 |
| `NEXT_PUBLIC_DEMO_MODE` | Enables or disables frontend demo indicators          |
| `AI_PROVIDER`           | Future AI provider option: `openai` or `anthropic`    |
| `OPENAI_API_KEY`        | OpenAI API key for future real question generation    |
| `OPENAI_MODEL`          | OpenAI model name                                     |
| `ANTHROPIC_API_KEY`     | Anthropic API key for future real question generation |
| `ANTHROPIC_MODEL`       | Anthropic model name                                  |

## Future API Mode

When the app is ready for real AI-generated questions, demo mode can be disabled:

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false

AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=your_openai_model_here
```

Or for Anthropic:

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false

AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=your_anthropic_model_here
```

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
  ai.ts                     OpenAI/Claude integration layer
  mock.ts                   Built-in development question engine
  prompts.ts                Prompt templates for future AI mode
  schemas.ts                Question validation schema
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
