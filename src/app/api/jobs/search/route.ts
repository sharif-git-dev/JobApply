import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { searchJobs } from "@/lib/jobs/search";

export const GET = route(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const result = await searchJobs({
    q: (params.get("q") ?? "").slice(0, 120).trim(),
    location: (params.get("location") ?? "").slice(0, 120).trim(),
    remoteOnly: params.get("remote") === "1",
  });
  return NextResponse.json(result);
});
