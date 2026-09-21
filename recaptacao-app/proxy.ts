import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, validSession } from "./lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const pass = () => {
    const h = new Headers(req.headers);
    h.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: h } });
  };
  if (pathname === "/login" || pathname === "/api/login") return pass();
  if (await validSession(req.cookies.get(COOKIE)?.value)) return pass();
  if (pathname.startsWith("/api/"))
    return Response.json({ error: "não autenticado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
