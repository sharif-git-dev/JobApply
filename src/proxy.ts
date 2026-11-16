import { NextResponse, type NextRequest } from "next/server";

/**
 * JobApply holds a resume and an API key and has no login, so it must only ever
 * answer the person sitting at this computer. Two checks:
 *
 * - Host must be a loopback name (blocks DNS-rebinding and LAN access).
 * - API calls must come from the app itself or a browser extension, never from
 *   another website open in the same browser (blocks cross-site requests).
 */

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function trustedOrigin(origin: string): boolean {
  if (/^(chrome|moz|safari-web)-extension:\/\//i.test(origin)) return true;
  try {
    return LOOPBACK.test(new URL(origin).host);
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!LOOPBACK.test(host)) {
    return new NextResponse("JobApply only accepts connections from this computer (http://localhost).", { status: 403 });
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    const crossSite = origin ? !trustedOrigin(origin) : site === "cross-site";
    if (crossSite) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
