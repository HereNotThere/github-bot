import { z } from "zod";

/** Supported redirect actions after OAuth completion */
export const RedirectActionSchema = z.enum(["subscribe", "query"]);
export type RedirectAction = z.infer<typeof RedirectActionSchema>;

/** Redirect data passed through OAuth state */
export const RedirectDataSchema = z.object({
  repo: z.string(),
  eventTypes: z.string().optional(),
  messageEventId: z.string().optional(),
});
export type RedirectData = z.infer<typeof RedirectDataSchema>;
