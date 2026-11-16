import { NextResponse } from "next/server";
import { HttpError, body, route } from "@/lib/api";
import { ApplicationPatch } from "@/lib/schemas";
import { getApplication, update, updateApplication } from "@/lib/store";
import type { Application } from "@/lib/types";

type Ctx = RouteContext<"/api/applications/[id]">;

export const GET = route(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const app = await getApplication(id);
  if (!app) throw new HttpError("That application no longer exists.", 404);
  return NextResponse.json(app);
});

export const PATCH = route(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patch = await body(request, ApplicationPatch);
  const app = await updateApplication(id, (current) => {
    const next = { ...current, ...patch };
    // Stamp the day it moved to "applied"; keep that date through later stages.
    if (patch.status && patch.status !== "saved" && !current.appliedAt) next.appliedAt = new Date().toISOString();
    if (patch.status === "saved") next.appliedAt = "";
    return next;
  });
  if (!app) throw new HttpError("That application no longer exists.", 404);
  return NextResponse.json(app);
});

export const DELETE = route(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await update<Application[]>("applications", [], (apps) => apps.filter((a) => a.id !== id));
  return NextResponse.json({ ok: true });
});
