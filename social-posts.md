# Cognify launch posts

## LinkedIn

I just shipped Cognify — an adaptive AI exam-prep app. Upload your lecture notes or any PDF, and it builds a 3-phase quiz session: a Knowledge Scan to find your baseline, a Weak Spot Drill that targets exactly what you got wrong, and a Final Challenge to prove mastery.

The interesting part wasn't the idea. It was the engineering problems on the way:

My first version generated questions with rules and templates. It produced gems like "What best describes This?" with sentence fragments as answer options. Scientific papers broke it completely — it kept quizzing people on references and figure captions.

Local LLMs (Ollama) fixed quality in dev, but public users on Vercel can't reach a model running on my laptop.

Hosted LLMs fixed reach, but an open endpoint calling a paid API is a wallet with a URL.

The architecture I landed on:

→ Free demo mode by default (rule-based, unlimited)
→ Real AI mode on Claude Haiku — one of the cheapest hosted models, ~5 cents per full session
→ Text cleaning + chunking before every call: strips references, DOIs, figure captions; sends only the best ~24k characters
→ Rate limiting: 6 free AI generations per day per user
→ Bring-your-own-key option that bypasses the limit (key never stored)
→ If the AI call fails, it silently falls back to the rule engine — users never see an error page
→ Every AI response is validated: vague topics rejected, giveaway answers rejected, citation questions rejected

Stack: Next.js, TypeScript, Claude Haiku, Zod, Upstash Redis, Vercel.

Biggest lesson: the AI call is 10% of the work. The other 90% is what happens before it (cleaning garbage out of the input) and after it (refusing to show users garbage output).

Try it: [YOUR-VERCEL-LINK]
Code: [YOUR-GITHUB-LINK]

#buildinpublic #AI #NextJS #TypeScript #EdTech

---

## Twitter/X — single tweet version

I built Cognify: upload any PDF → get an adaptive 3-phase exam that finds your weak spots and drills them.

AI-generated questions on Claude Haiku, ~5¢ per session, rate-limited free tier, BYOK for power users, automatic fallback if the API dies.

[YOUR-LINK]

---

## Twitter/X — thread version

1/ I built an AI exam-prep app and the hardest part wasn't the AI. It was not going broke.

Cognify: upload your notes → 3-phase adaptive quiz → it finds your weak topics and drills them until you master them.

Here's the cost-control architecture 🧵

2/ Problem: an open endpoint that calls a paid LLM API is a wallet with a URL.

Anyone could hammer it. Every request costs money.

3/ Layer 1: demo mode is the default. Rule-based questions, free, unlimited. The AI path is opt-in.

4/ Layer 2: cheap model + small input. Claude Haiku (~$1/M tokens), and I clean every document first — strip references, DOIs, captions — and send only the best 24k chars. A full 3-phase session costs ~5 cents.

5/ Layer 3: rate limiting. 6 AI generations per day per user (= 2 full sessions), tracked in Redis.

6/ Layer 4: BYOK. Power users paste their own API key — it lives in React state only, never stored, and bypasses the limit. Their key, their bill.

7/ Layer 5: graceful degradation. If the AI call fails — bad key, no credits, outage — it silently falls back to the rule engine. Users never see an error page.

8/ And every AI response gets validated before users see it: vague topics rejected, giveaway answers (correct option 3x longer) rejected, citation questions rejected. Fail twice → fallback.

9/ Lesson: the LLM call is one line. Production-ready is everything wrapped around it.

Try it: [YOUR-LINK]
