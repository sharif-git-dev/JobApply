"use client";

import { FileText, Plus, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Spinner, TagInput, Textarea, cx } from "@/components/ui";
import { api, timeAgo, useData } from "@/lib/client";
import type { EducationItem, ExperienceItem, Profile } from "@/lib/types";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

const BLANK_ROLE: ExperienceItem = { title: "", company: "", location: "", start: "", end: "", bullets: [] };
const BLANK_SCHOOL: EducationItem = { degree: "", school: "", year: "", details: "" };

export default function ProfilePage() {
  const { data, error, loading, setData } = useData<Profile>("/api/profile");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadNote, setUploadNote] = useState<{ tone: "success" | "warn" | "danger"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  if (loading) return <Spinner />;
  if (error || !data) return <Notice tone="danger">{error || "Couldn't load your profile."}</Notice>;

  const p = draft ?? data;
  const dirty = draft !== null;
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft({ ...p, [key]: value });
  const setLink = (key: keyof Profile["links"], value: string) => set("links", { ...p.links, [key]: value });
  const setRole = (i: number, patch: Partial<ExperienceItem>) =>
    set("experience", p.experience.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const setSchool = (i: number, patch: Partial<EducationItem>) =>
    set("education", p.education.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      // The server only accepts the editable fields; the resume text is owned by uploads.
      setData(await api<Profile>("/api/profile", { method: "PUT", json: draft }));
      setDraft(null);
      toast("Profile saved");
    } catch (err) {
      toast((err as Error).message, "danger");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadNote(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ profile: Profile; parsedWith: "ai" | "rules"; warning: string }>("/api/resume", { form });
      setData(result.profile);
      setDraft(null);
      setUploadNote(
        result.warning
          ? { tone: "warn", text: `${result.warning} Your resume was read with the built-in parser instead — check the details below.` }
          : {
              tone: "success",
              text:
                result.parsedWith === "ai"
                  ? "Resume read with Claude. Have a quick look below and fix anything that's off."
                  : "Resume read with the built-in parser. It gets the basics; check the experience section and fix anything it misjudged.",
            },
      );
    } catch (err) {
      setUploadNote({ tone: "danger", text: (err as Error).message });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        title="Profile"
        lede="Everything applications ask for, in one place. Upload your resume to fill most of it in, then add the details a resume doesn't cover."
      />

      <div className="flex flex-col gap-4">
        <Card
          className={cx("border-dashed p-6 transition-colors", dragging && "border-accent bg-accent-soft")}
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(e.dataTransfer.files[0]);
            }}
            className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              {p.resumeFileName ? <FileText className="size-5" aria-hidden /> : <UploadCloud className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{p.resumeFileName || "Upload your resume"}</div>
              <div className="text-sm text-muted">
                {p.resumeFileName
                  ? `Uploaded ${timeAgo(p.resumeUpdatedAt)}. Upload a newer version any time — your preferences below are kept.`
                  : "Drop a PDF or Word file here, or choose one. It never leaves this computer unless you turn on AI."}
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="sr-only"
              aria-label="Resume file"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button variant={p.resumeFileName ? "secondary" : "primary"} loading={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? "Reading…" : p.resumeFileName ? "Replace" : "Choose file"}
            </Button>
          </div>
        </Card>
        {uploadNote && <Notice tone={uploadNote.tone}>{uploadNote.text}</Notice>}

        <Section title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={p.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Email">
              <Input type="email" value={p.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={p.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
            </Field>
            <Field label="Location" hint="City and state or country">
              <Input value={p.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
            <Field label="LinkedIn">
              <Input value={p.links.linkedin} onChange={(e) => setLink("linkedin", e.target.value)} placeholder="linkedin.com/in/…" />
            </Field>
            <Field label="GitHub">
              <Input value={p.links.github} onChange={(e) => setLink("github", e.target.value)} placeholder="github.com/…" />
            </Field>
            <Field label="Portfolio or website">
              <Input value={p.links.portfolio} onChange={(e) => setLink("portfolio", e.target.value)} />
            </Field>
            <Field label="Other link">
              <Input value={p.links.other} onChange={(e) => setLink("other", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="What you're looking for" hint="Used to rank search results and to answer the standard questions on application forms.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target roles" hint="Press Enter after each one" className="sm:col-span-2">
              <TagInput label="Target roles" value={p.targetRoles} onChange={(v) => set("targetRoles", v)} placeholder="e.g. Product Designer, UX Researcher" />
            </Field>
            <Field label="Preferred locations" className="sm:col-span-2">
              <TagInput label="Preferred locations" value={p.preferredLocations} onChange={(v) => set("preferredLocations", v)} placeholder="e.g. Austin, Remote (US)" />
            </Field>
            <Field label="Work arrangement">
              <Select value={p.remotePreference} onChange={(e) => set("remotePreference", e.target.value as Profile["remotePreference"])}>
                <option value="any">No preference</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </Select>
            </Field>
            <Field label="Years of experience">
              <Input inputMode="numeric" value={p.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} />
            </Field>
            <Field label="Work authorization" hint="e.g. US citizen, Green card, H-1B, EU work permit">
              <Input value={p.workAuthorization} onChange={(e) => set("workAuthorization", e.target.value)} />
            </Field>
            <Field label="Need visa sponsorship?">
              <Select value={p.requiresSponsorship} onChange={(e) => set("requiresSponsorship", e.target.value as Profile["requiresSponsorship"])}>
                <option value="">Not set</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
            <Field label="Salary expectation">
              <Input value={p.salaryExpectation} onChange={(e) => set("salaryExpectation", e.target.value)} placeholder="e.g. $120k–$140k" />
            </Field>
            <Field label="Notice period / start date">
              <Input value={p.noticePeriod} onChange={(e) => set("noticePeriod", e.target.value)} placeholder="e.g. 2 weeks" />
            </Field>
          </div>
        </Section>

        <Section title="Headline and summary">
          <div className="grid gap-4">
            <Field label="Professional headline">
              <Input value={p.headline} onChange={(e) => set("headline", e.target.value)} placeholder="e.g. Senior Software Engineer" />
            </Field>
            <Field label="Summary">
              <Textarea rows={4} value={p.summary} onChange={(e) => set("summary", e.target.value)} />
            </Field>
            <Field label="Skills" hint="Jobs are matched against these — add anything your resume left out.">
              <TagInput label="Skills" value={p.skills} onChange={(v) => set("skills", v)} placeholder="Type a skill and press Enter" />
            </Field>
          </div>
        </Section>

        <Section title="Experience" hint="Most recent first. One accomplishment per line.">
          <div className="flex flex-col gap-4">
            {p.experience.map((role, i) => (
              <div key={i} className="rounded-lg border border-line p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title">
                    <Input value={role.title} onChange={(e) => setRole(i, { title: e.target.value })} />
                  </Field>
                  <Field label="Company">
                    <Input value={role.company} onChange={(e) => setRole(i, { company: e.target.value })} />
                  </Field>
                  <Field label="Start">
                    <Input value={role.start} onChange={(e) => setRole(i, { start: e.target.value })} placeholder="Jan 2021" />
                  </Field>
                  <Field label="End">
                    <Input value={role.end} onChange={(e) => setRole(i, { end: e.target.value })} placeholder="Present" />
                  </Field>
                  <Field label="Accomplishments" className="sm:col-span-2">
                    <Textarea
                      rows={Math.max(3, role.bullets.length + 1)}
                      value={role.bullets.join("\n")}
                      onChange={(e) => setRole(i, { bullets: e.target.value.split("\n") })}
                      onBlur={() => setRole(i, { bullets: role.bullets.map((b) => b.trim()).filter(Boolean) })}
                    />
                  </Field>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3"
                  icon={<Trash2 className="size-3.5" aria-hidden />}
                  onClick={() => set("experience", p.experience.filter((_, idx) => idx !== i))}
                >
                  Remove role
                </Button>
              </div>
            ))}
            <Button className="self-start" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("experience", [...p.experience, BLANK_ROLE])}>
              Add a role
            </Button>
          </div>
        </Section>

        <Section title="Education">
          <div className="flex flex-col gap-4">
            {p.education.map((school, i) => (
              <div key={i} className="rounded-lg border border-line p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Degree or certificate">
                    <Input value={school.degree} onChange={(e) => setSchool(i, { degree: e.target.value })} />
                  </Field>
                  <Field label="School">
                    <Input value={school.school} onChange={(e) => setSchool(i, { school: e.target.value })} />
                  </Field>
                  <Field label="Year">
                    <Input value={school.year} onChange={(e) => setSchool(i, { year: e.target.value })} />
                  </Field>
                  <Field label="Details" hint="Honors, GPA, relevant coursework">
                    <Input value={school.details} onChange={(e) => setSchool(i, { details: e.target.value })} />
                  </Field>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3"
                  icon={<Trash2 className="size-3.5" aria-hidden />}
                  onClick={() => set("education", p.education.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button className="self-start" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("education", [...p.education, BLANK_SCHOOL])}>
              Add education
            </Button>
          </div>
        </Section>

        <Section
          title="Anything else worth knowing"
          hint="Context your resume doesn't capture: why you're changing fields, a career gap, projects you're proud of, what you want next. The AI treats this as fact when it writes for you."
        >
          <Textarea rows={6} value={p.extraInfo} onChange={(e) => set("extraInfo", e.target.value)} aria-label="Additional information" />
        </Section>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[68px] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 md:px-4">
            <span className="text-sm text-muted">You have unsaved changes.</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
                Discard
              </Button>
              <Button variant="primary" onClick={save} loading={saving}>
                Save profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
