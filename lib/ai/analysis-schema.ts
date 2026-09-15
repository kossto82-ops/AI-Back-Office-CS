import { z } from 'zod';
import { CASE_CATEGORIES } from '@/lib/db/case-categories';
import { AiInvalidOutputError } from './errors';

export const URGENCY_LEVELS = ['low', 'medium', 'high'] as const;

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const rawAnalysisSchema = z.object({
  category: z.enum(CASE_CATEGORIES, {
    error: 'category must be one of the supported case categories'
  }),
  summary: z.string().trim().min(1).max(1200),
  intent: z.string().trim().min(1).max(500),
  urgency: z.enum(URGENCY_LEVELS, {
    error: 'urgency must be low, medium or high'
  }),
  recommendedAction: z.string().trim().min(1).max(2000),
  draftResponse: z.string().trim().min(1).max(4000),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(20),
  confidence: z
    .number({
      error: 'confidence must be a number between 0 and 1'
    })
    .min(0)
    .max(1),
  sources: z.array(z.string().trim().min(1).max(20)).max(20)
});

export type RawAnalysis = z.infer<typeof rawAnalysisSchema>;

export function parseRawAnalysis(value: unknown): RawAnalysis {
  const parsed = rawAnalysisSchema.safeParse(value);
  if (!parsed.success) {
    throw new AiInvalidOutputError(
      `AI output did not match the required analysis schema`
    );
  }
  return parsed.data;
}