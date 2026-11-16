import { NextResponse } from "next/server";
import { body, route } from "@/lib/api";
import { createApplication } from "@/lib/applications";
import { JobInput } from "@/lib/schemas";
import { getApplications } from "@/lib/store";

export const GET = route(async () => {
  const apps = await getApplications();
  return NextResponse.json(apps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

export const POST = route(async (request: Request) => {
  const job = await body(request, JobInput);
  return NextResponse.json(await createApplication(job));
});
