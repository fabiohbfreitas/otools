// Auth simples por env (uso interno): sessão stateless em cookie assinado (HMAC
// com APP_PASSWORD), 12h. Sem estado no servidor: funciona em qualquer runtime,
// instância ou restart — trocar a senha invalida todas as sessões.
export const COOKIE = "recaptacao_sess";
export const MAX_AGE = 60 * 60 * 12;

export const creds = () => ({
  user: process.env.APP_USER ?? "",
  pass: process.env.APP_PASSWORD ?? "",
});

// Comparação em tempo constante, sem node:crypto (vale no middleware).
export function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function newSession() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${await hmac(creds().pass, exp)}`;
}

export async function validSession(v: string | undefined) {
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const { pass } = creds();
  if (!pass) return false;
  return sameSecret(sig, await hmac(pass, exp));
}

export const cookieHeader = (token: string) =>
  `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
export const clearCookieHeader = () => `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
