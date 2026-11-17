import { NextResponse, type NextRequest } from "next/server";
import { HOSTED } from "@/lib/mode";

/**
 * Who the server will answer depends on the mode (see lib/mode.ts).
 *
 * Local: JobApply holds a resume and API keys and has no login, so it must only
 * ever answer the person sitting at this computer.
 * - Host must be a loopback name (blocks DNS-rebinding and LAN access).
 * - API calls must come from the app itself or a browser extension, never from
 *   another website open in the same browser.
 *
 * Hosted: anyone may open the site, but the server stores nothing, so the only
 * API it exposes is the stateless gateway — and only to its own pages, so other
 * sites can't borrow it as a free relay.
 */

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

function trustedLocalOrigin(origin: string): boolean {
  if (/^(chrome|moz|safari-web)-extension:\/\//i.test(origin)) return true;
  return LOOPBACK.test(originHost(origin));
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");

  if (HOSTED) {
    if (!isApi) return NextResponse.next();
    if (request.nextUrl.pathname !== "/api/hosted") return NextResponse.json({ error: "Not found." }, { status: 404 });
    const crossSite = origin ? originHost(origin) !== host : site === "cross-site";
    if (crossSite) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    return NextResponse.next();
  }

  if (!LOOPBACK.test(host)) {
    return new NextResponse("JobApply only accepts connections from this computer (http://localhost).", { status: 403 });
  }
  if (isApi) {
    const crossSite = origin ? !trustedLocalOrigin(origin) : site === "cross-site";
    if (crossSite) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
