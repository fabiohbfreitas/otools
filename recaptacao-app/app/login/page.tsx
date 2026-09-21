import LoginForm from "./form";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  const safe = next?.startsWith("/") && !next.startsWith("//") ? next : "/pacientes";
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <strong className="brand">Recaptação</strong>
        <p className="muted">Acesso interno — entre com o usuário e a senha do ambiente.</p>
        <LoginForm next={safe} />
      </div>
    </div>
  );
}
