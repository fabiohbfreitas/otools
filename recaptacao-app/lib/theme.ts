"use server";

import { cookies } from "next/headers";

export async function getTheme() {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}

export async function setTheme(theme: "light" | "dark") {
  (await cookies()).set("theme", theme, { path: "/", maxAge: 31536000, sameSite: "lax" });
}
