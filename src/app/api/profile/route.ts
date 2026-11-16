import { NextResponse } from "next/server";
import { body, route } from "@/lib/api";
import { ProfilePatch } from "@/lib/schemas";
import { getProfile, saveProfile } from "@/lib/store";

export const GET = route(async () => NextResponse.json(await getProfile()));

export const PUT = route(async (request: Request) => {
  const patch = await body(request, ProfilePatch);
  const current = await getProfile();
  return NextResponse.json(await saveProfile({ ...patch, links: { ...current.links, ...patch.links } }));
});
