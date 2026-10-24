import { z } from "zod";

export const HealthResponse = z.object({
  ok: z.literal(true),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
