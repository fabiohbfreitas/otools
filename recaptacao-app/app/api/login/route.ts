import { LoginBody } from "@/lib/schemas";
import { cookieHeader, creds, newSession, sameSecret } from "@/lib/auth";
import { err } from "@/lib/http";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err("credenciais inválidas");
  }
  const parsed = LoginBody.safeParse(raw);
  if (!parsed.success) return err("credenciais inválidas");
  const { user, pass } = creds();
  if (!user || !sameSecret(parsed.data.user, user) || !sameSecret(parsed.data.pass, pass))
    return err("credenciais inválidas");
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": cookieHeader(await newSession()) } },
  );
}
