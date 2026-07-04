// Restricts the whole site to people who know the shared username/password,
// set via SITE_USER / SITE_PASSWORD environment variables in Vercel. If those
// aren't configured (e.g. local dev), the site is left open so it doesn't
// accidentally lock out development.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REALM = 'Basic realm="Trainer Knowledge Base", charset="UTF-8"';

export function proxy(request: NextRequest) {
  const expectedUser = process.env.SITE_USER;
  const expectedPassword = process.env.SITE_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const providedUser = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);

    if (providedUser === expectedUser && providedPassword === expectedPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse("認証が必要です / Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
