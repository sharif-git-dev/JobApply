import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export class ResumeError extends Error {}

const MAX_BYTES = 8 * 1024 * 1024;

/** Turn an uploaded resume (PDF, DOCX, TXT, MD) into plain text. */
export async function resumeToText(fileName: string, data: Uint8Array): Promise<string> {
  if (data.byteLength > MAX_BYTES) throw new ResumeError("That file is over 8 MB — export a smaller PDF and try again.");
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  let text: string;

  if (ext === "pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text;
    } catch {
      throw new ResumeError("Couldn't read that PDF. Is it password-protected or corrupted?");
    }
    if (text.trim().length < 40) {
      throw new ResumeError(
        "That PDF has no selectable text — it looks like a scan. Export it from Word/Google Docs as a PDF, or upload a .docx.",
      );
    }
  } else if (ext === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      text = result.value;
    } catch {
      throw new ResumeError("Couldn't read that Word document.");
    }
  } else if (ext === "txt" || ext === "md") {
    text = Buffer.from(data).toString("utf8");
  } else if (ext === "doc") {
    throw new ResumeError("Old .doc files aren't supported — save it as .docx or PDF first.");
  } else {
    throw new ResumeError("Upload a PDF, DOCX, TXT, or MD file.");
  }

  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
