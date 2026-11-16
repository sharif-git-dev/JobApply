# JobApply

Give it your resume once. JobApply finds jobs that fit, tailors each application to the posting, fills in the forms, and keeps track of where every application stands.

It runs entirely on your own computer. There is no account to create and nothing to pay for: the core features work with no API keys at all.

## What it does

- **Reads your resume** (PDF, Word, or text) and turns it into an editable profile, plus the details applications always ask for: work authorization, salary expectations, notice period, links.
- **Searches many job boards at once**, keeps the live remote roles open to the US and Europe, and ranks them by how well they match your skills. Seven free boards work out of the box; more can be switched on in Settings.
- **Imports any posting** from a link or pasted text, for jobs you found elsewhere.
- **Tailors each application**: a fit analysis, a cover letter, a resume re-ordered for the role (saved as a PDF from the browser), and answers to the form's open questions.
- **Fills in application forms** with a small browser extension. It never presses submit — you review and send.
- **Tracks your pipeline** from saved through applied, interviewing, offer, and closed.

## Getting started

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>. On Windows you can double-click `JobApply.bat` instead, which does both steps and opens the browser.

1. **Profile** — upload your resume and check what was read from it.
2. **Find jobs** — search, then press *Tailor my application* on anything promising.
3. **Applications** — write the materials, open the application, mark it applied.

## AI models

Cover letters, resume rewrites, fit analysis, form answers and more accurate resume reading are written by an AI model. Without one you get the built-in drafts. Pick any provider on the **Settings** page; each is labelled free or paid there.

| Provider | Tier | What you get |
| --- | --- | --- |
| Ollama | Free, on your computer | Models you have downloaded, unlimited, nothing leaves your machine |
| LM Studio | Free, on your computer | Same, through LM Studio's local server |
| Google Gemini | Free | Free tier with daily limits. Google uses free-tier prompts to improve its products |
| Groq | Free | Free plan with per-minute and per-day limits, very fast |
| OpenRouter | Free | Rotating free models: 50 requests a day, 20 a minute |
| DeepSeek | Paid | Prepaid, roughly 1–2¢ per tailored application |
| Anthropic (Claude) | Paid | Prepaid, under 1¢ per application on Haiku up to 15–25¢ on Opus |
| Custom endpoint | Yours | Any OpenAI-compatible service or server |

Settings can load each provider's current model list and send a test message, so you know a setup works before relying on it. Free allowances and model names change often; the ones above were checked against each provider's documentation in November 2026.

Keys can also be supplied as environment variables: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`.

### Keeping paid spend under control

For paid providers, JobApply estimates the cost of every request from its token counts and keeps a running total. Before each request it assumes the worst case and refuses to send anything that could take the total past your cap (default **$5**, adjustable in Settings). Free and local models never count towards it. The total is an estimate; the provider's account page has the exact figure.

## Job sources

Every search goes to all the sources that are switched on. Settings lists each one with what it covers and what it costs.

| Source | Tier | Covers |
| --- | --- | --- |
| Remotive, Himalayas, Jobicy, Remote OK, We Work Remotely, Working Nomads | Free, no sign-up | Remote jobs worldwide |
| Arbeitnow | Free, no sign-up | Germany and wider Europe |
| Company watchlist (Greenhouse, Lever, Ashby) | Free, no sign-up | Open roles at companies you follow |
| Adzuna | Free with a key | Local and on-site jobs in 19 countries |
| USAJOBS | Free with a key | US federal government jobs |
| Reed.co.uk | Free with a key | UK jobs |
| Jooble | Free with a key | Worldwide aggregator |
| Google Jobs via SerpApi | 250 free searches a month, then paid | Listings Google gathers from LinkedIn, Indeed, Glassdoor and company sites |

LinkedIn and Indeed have no public job-search API, so they are not connected; use *Add a job yourself → Paste a job* for postings found there.

### What a search keeps

- **Remote by default**, with a choice of *US and Europe*, *US*, *Europe* or *Anywhere*. Most "remote" postings name the countries they can hire in, and JobApply reads that restriction.
- **Live postings only.** Listings older than 60 days are dropped, as are ones a board marks as expired. Roles on a followed company's own careers page are always kept, since those pages list only open roles.
- **Ranked by fit** against your profile, then by how well they answer the search, with a nudge for newer postings.

## The form-filling extension

1. Open `chrome://extensions` in Chrome, Edge, or Brave and turn on **Developer mode**.
2. Click **Load unpacked** and choose this project's `extension` folder.
3. On an application form, click the JobApply icon, pick the job, and press **Fill this page**.

It fills empty text fields it recognises (name, contact details, links, current role, cover letter and so on) and outlines them in green. It skips passwords, file uploads, checkboxes, and anything it isn't sure about, and it never overwrites what's already typed. JobApply has to be running, because the extension reads your profile from it.

To see it work without a real application, open <http://localhost:3000/autofill-test.html>.

## Privacy

- Your resume, profile, applications, and keys are plain JSON files in `data/`. That folder is git-ignored and never leaves your machine.
- The server only accepts connections from this computer, and rejects requests coming from other websites open in your browser.
- Job searches send your search terms to the job sources that are switched on. Importing a link fetches that page.
- When an AI model is in use, your profile and the job description are sent to that provider to generate the text. Nothing is sent otherwise, and a model on your own computer (Ollama, LM Studio) keeps even that local.

## What it deliberately doesn't do

It doesn't submit applications on your behalf or scrape sites that forbid it (LinkedIn, Indeed). Mass auto-applying gets accounts banned and applications ignored; the aim here is to make each real application take minutes instead of an hour. For postings on those sites, use *Add a job yourself → Paste a job*.

## Development

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run build
```

Built with Next.js, TypeScript and Tailwind CSS. AI calls use each provider's OpenAI-style chat API, Ollama's own API for local models, or the Anthropic SDK for Claude. `unpdf` is pinned to 1.7.0, the last release that runs on Node 20; newer ones need Node 22+.

```
src/app/(app)/        pages: home, profile, jobs, applications, settings
src/app/print/        printable resume and cover letter
src/app/api/          route handlers
src/lib/jobs/         source catalog and loaders, region and freshness filters, ranking, link import
src/lib/resume/       resume text extraction and the key-free parser
src/lib/ai/           provider catalog, clients (budget guard, usage tracking), prompts
src/lib/match.ts      keyword match scoring
src/lib/templates.ts  key-free cover letter, fit and resume fallbacks
src/proxy.ts          localhost-only request guard
extension/            the autofill browser extension
data/                 your data (created on first run, git-ignored)
```
