import { NextRequest } from "next/server";
import { importWorkbook } from "@/lib/import";

export async function POST(req: NextRequest) {
  const files = (await req.formData())
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return new Response("arquivo ausente", { status: 400 });
  let rows = 0;
  let ignored = 0;
  for (const file of files) {
    const r = await importWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
    rows += r.rows;
    ignored += r.ignored;
  }
  return Response.redirect(
    new URL(`/pacientes?importados=${rows}&ignorados=${ignored}`, req.url),
    303,
  );
}
