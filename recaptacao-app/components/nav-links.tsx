"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/pacientes", label: "Pacientes" },
  { href: "/recaptacao", label: "Recaptações" },
  { href: "/config", label: "Configuração" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className={path === l.href || path.startsWith(l.href + "/") ? "active" : ""}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
