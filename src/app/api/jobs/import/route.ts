import { NextResponse } from "next/server";
import { body, route } from "@/lib/api";
import { createApplication } from "@/lib/applications";
import { importJobFromUrl, jobFromPastedText } from "@/lib/jobs/importUrl";
import { ImportInput } from "@/lib/schemas";

/** Add a job the search didn't find: from a link, or from pasted text. */
export const POST = route(async (request: Request) => {
  const input = await body(request, ImportInput);
  const job = "description" in input ? jobFromPastedText(input) : await importJobFromUrl(input.url);
  return NextResponse.json(await createApplication(job));
});
