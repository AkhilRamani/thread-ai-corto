import { z } from "zod";

const sourceIds = z.array(z.string().min(1).max(80)).min(1).max(6);
const statement = z.strictObject({
  text: z.string().trim().min(1).max(320),
  sourceIds,
});

// One contract for structured model output and the rendered brief.
export const workBriefSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  overview: z.string().trim().min(1).max(600),
  sourceIds,
  observations: z.array(statement).max(3),
  nextStep: statement.nullable(),
});

export type WorkBrief = z.infer<typeof workBriefSchema>;
