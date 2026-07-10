import { z } from "zod";
import {
  coerceToArray,
  constraintsSchema,
  placeInputSchema,
  planStopSchema,
  preferencesSchema,
  stopInputSchema,
  timeWindowSchema
} from "./common.js";

const stopsArraySchema = z
  .array(stopInputSchema)
  .min(1)
  .max(12)
  .describe("Visit stops in priority order. Pass an array of stop objects.");

const planStopsArraySchema = z.array(planStopSchema).min(1).max(12);

export const planTripRouteInputSchema = z.object({
  origin: placeInputSchema,
  stops: z.preprocess(coerceToArray, stopsArraySchema),
  travel_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format."),
  time_window: timeWindowSchema.optional(),
  constraints: constraintsSchema.optional().default({}),
  preferences: z.preprocess(coerceToArray, preferencesSchema)
});

export const analyzePlaceRiskInputSchema = z.object({
  place: placeInputSchema,
  target_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."),
  constraints: constraintsSchema.optional().default({})
});

export const optimizeWithConstraintsInputSchema = z.object({
  current_plan: z.preprocess(coerceToArray, planStopsArraySchema),
  constraints: constraintsSchema.optional().default({}),
  preferences: z.preprocess(coerceToArray, preferencesSchema)
});

export const suggestAlternativesInputSchema = z.object({
  place: placeInputSchema,
  target_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."),
  constraints: constraintsSchema.optional().default({}),
  radius: z.number().int().min(100).max(5000).optional().default(800)
});

export const optimizedPlanForMapSchema = z.object({
  origin: placeInputSchema,
  stops: z.array(
    z.object({
      name: z.string().min(1).max(120),
      planned_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      coordinate: placeInputSchema.shape.coordinate.optional(),
      warning: z.string().max(180).optional()
    })
  ).min(1).max(12),
  warnings: z.array(z.string().max(180)).max(8).optional().default([])
});

export const renderMapPayloadInputSchema = z.object({
  optimized_plan: optimizedPlanForMapSchema
});

export type PlanTripRouteInput = z.infer<typeof planTripRouteInputSchema>;
export type AnalyzePlaceRiskInput = z.infer<typeof analyzePlaceRiskInputSchema>;
export type OptimizeWithConstraintsInput = z.infer<typeof optimizeWithConstraintsInputSchema>;
export type SuggestAlternativesInput = z.infer<typeof suggestAlternativesInputSchema>;
export type RenderMapPayloadInput = z.infer<typeof renderMapPayloadInputSchema>;
