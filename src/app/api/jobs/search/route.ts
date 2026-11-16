import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { searchJobs } from "@/lib/jobs/search";
import type { RegionFilter } from "@/lib/types";

const REGIONS: RegionFilter[] = ["us-eu", "us", "eu", "any"];

export const GET = route(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const result = await searchJobs({
    q: (params.get("q") ?? "").slice(0, 120).trim(),
    location: (params.get("location") ?? "").slice(0, 120).trim(),
    remoteOnly: params.get("remote") === "1",
    region: REGIONS.find((r) => r === params.get("region")) ?? "us-eu",
  });
  return NextResponse.json(result);
});
