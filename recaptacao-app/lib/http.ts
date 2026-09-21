export const err = (error: string) => Response.json({ error }, { status: 400 });
