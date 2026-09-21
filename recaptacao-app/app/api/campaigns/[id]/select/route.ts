import { selectForCampaign } from "@/lib/select";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await selectForCampaign(id);
  return Response.redirect(new URL(`/recaptacao/${id}`, _req.url), 303);
}
