import { clearCookieHeader } from "@/lib/auth";

export async function POST() {
  // Sessão é stateless (assinada): sair = descartar o cookie.
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": clearCookieHeader() },
  });
}
