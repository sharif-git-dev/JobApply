import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { AiError } from "./ai/client";
import { ImportError } from "./jobs/importUrl";
import { ResumeError } from "./resume/extract";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Turn any thrown error into a JSON response the UI can show as-is. */
export function fail(err: unknown): NextResponse {
  if (err instanceof AiError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ImportError || err instanceof ResumeError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json({ error: `Invalid request: ${first?.path.join(".")} ${first?.message}`.trim() }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong on the server. Check the terminal for details." }, { status: 500 });
}

export async function body<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError("Expected a JSON body.");
  }
  return schema.parse(raw);
}

/** Wrap a handler so every route reports errors the same way. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return fail(err);
    }
  };
}
