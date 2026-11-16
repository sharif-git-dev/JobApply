# JobApply

Give it your resume once. JobApply finds jobs that fit, tailors each application to the posting, fills in the forms, and keeps track of where every application stands.

It runs entirely on your own computer. There is no account to create and nothing to pay for: the core features work with no API keys at all.

## What it does

- **Reads your resume** (PDF, Word, or text) and turns it into an editable profile, plus the details applications always ask for: work authorization, salary expectations, notice period, links.
- **Searches several job boards at once** — Remotive, Himalayas, Jobicy, Remote OK, Arbeitnow, and any company career pages you follow (Greenhouse, Lever, Ashby) — and ranks results by how well they match your skills.
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

## Optional keys

Everything above works without these. Both are entered on the **Settings** page and stored only in the local `data` folder.

| Key | What it adds | Cost |
| --- | --- | --- |
| AI key — DeepSeek (default) or Anthropic | Cover letters, resume rewrites, fit analysis and form answers written by an AI model instead of the built-in templates, and more accurate resume reading | Pay-as-you-go and prepaid: with any auto top-up left off, it cannot cost more than the balance you load |
| Adzuna app ID + key | Local and on-site listings with real location search (the built-in boards lean remote) | Free |

### Keeping AI spend under control

JobApply estimates the cost of every AI request from its token counts and keeps a running total. Before each request it assumes the worst case and refuses to send anything that could take the total past your cap (default **$5**, adjustable in Settings). The model is also your choice:

| Model | Provider | Roughly, per fully tailored application |
| --- | --- | --- |
| DeepSeek Flash (default) | DeepSeek | 1–2¢ |
| DeepSeek V4 Pro | DeepSeek | 4–6¢ |
| Claude Haiku 5.5 | Anthropic | under 1¢ |
| Claude Sonnet 5.5 | Anthropic | 8–12¢ |
| Claude Opus 5.5 | Anthropic | 15–25¢ |

The model you pick decides which provider's key is needed. DeepSeek figures use its peak-hour rates; off-peak is half. The total shown in Settings is an estimate; the provider's account page has the exact figure.

You can also supply a key as a `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY` environment variable instead of typing it into Settings.

## The form-filling extension

1. Open `chrome://extensions` in Chrome, Edge, or Brave and turn on **Developer mode**.
2. Click **Load unpacked** and choose this project's `extension` folder.
3. On an application form, click the JobApply icon, pick the job, and press **Fill this page**.

It fills empty text fields it recognises (name, contact details, links, current role, cover letter and so on) and outlines them in green. It skips passwords, file uploads, checkboxes, and anything it isn't sure about, and it never overwrites what's already typed. JobApply has to be running, because the extension reads your profile from it.

To see it work without a real application, open <http://localhost:3000/autofill-test.html>.

## Privacy

- Your resume, profile, applications, and keys are plain JSON files in `data/`. That folder is git-ignored and never leaves your machine.
- The server only accepts connections from this computer, and rejects requests coming from other websites open in your browser.
- Job searches send your search terms to the job boards. Importing a link fetches that page.
- If you turn on AI writing, your profile and the job description are sent to the provider of the model you picked (DeepSeek or Anthropic) to generate the text. Nothing is sent to either otherwise.

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

Built with Next.js, TypeScript and Tailwind CSS. AI calls go to DeepSeek's chat completions API or, for Claude models, through the Anthropic SDK. `unpdf` is pinned to 1.7.0, the last release that runs on Node 20; newer ones need Node 22+.

```
src/app/(app)/        pages: home, profile, jobs, applications, settings
src/app/print/        printable resume and cover letter
src/app/api/          route handlers
src/lib/jobs/         job board sources, search and ranking, link import
src/lib/resume/       resume text extraction and the key-free parser
src/lib/ai/           model list, DeepSeek and Claude clients (budget guard, usage tracking), prompts
src/lib/match.ts      keyword match scoring
src/lib/templates.ts  key-free cover letter, fit and resume fallbacks
src/proxy.ts          localhost-only request guard
extension/            the autofill browser extension
data/                 your data (created on first run, git-ignored)
```
