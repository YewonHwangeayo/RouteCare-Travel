import { z } from "zod";

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

export const placeInputSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
  category: z.string().max(80).optional(),
  coordinate: coordinateSchema.optional()
});

export const timeWindowSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format.")
});

export const constraintsSchema = z.object({
  with_luggage: z.boolean().optional().default(false),
  with_child: z.boolean().optional().default(false),
  panic_sensitive: z.boolean().optional().default(false),
  avoid_stairs: z.boolean().optional().default(false),
  need_restroom: z.boolean().optional().default(false),
  low_mobility: z.boolean().optional().default(false),
  rainy_day: z.boolean().optional().default(false)
});

export const preferenceSchema = z.enum([
  "fastest",
  "least_crowded",
  "least_transfer",
  "accessibility_first",
  "shopping_focused"
]);

export const preferencesSchema = z.array(preferenceSchema).max(5).optional().default([]);

/**
 * MCP Inspector sometimes sends array fields as a single object or as
 * numeric-keyed objects ({ "0": {...}, "1": {...} }). Coerce those forms
 * before Zod validates the array schema.
 */

export function coerceToArray<T>(value: unknown): T[] | unknown {
  // 1. null이나 undefined 방어
  if (value == null) {
    return value;
  }

  // 2. 문자열로 들어온 경우 (JSON.parse 시도)
  if (typeof value === "string") {
    try {
      return coerceToArray(JSON.parse(value));
    } catch {
      return value;
    }
  }

  // 3. 이미 정상적인 배열인 경우
  if (Array.isArray(value)) {
    return value;
  }

  // 4. MCP Inspector 버그 방어 및 단일 객체 처리
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);

    if (keys.length === 0) {
      return value;
    }

    // {"0": {...}, "1": {...}} 형태인 경우 배열로 변환
    if (keys.every((key) => /^\d+$/.test(key))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => record[key]) as T[];
    }

    // 일반 객체 하나만 달랑 들어왔다면, 배열의 단일 아이템으로 간주하고 배열로 감싸줌
    return [value] as T[];
  }

  return value;
}


export const stopInputSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
  category: z.string().max(80).optional(),
  coordinate: coordinateSchema.optional(),
  desired_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format.").optional(),
  duration_minutes: z.number().int().min(10).max(360).optional().default(45),
  priority: z.number().int().min(1).max(5).optional().default(3)
});

// (stopsArraySchema가 명시되어 있지 않아 추가했습니다)
const stopsArraySchema = z.array(stopInputSchema);

export const planTripRouteInputSchema = z.object({
  origin: placeInputSchema,
  // 💡 z.preprocess를 사용해 안전하게 배열 변환 함수를 거치게 합니다.
  stops: z.preprocess(coerceToArray, stopsArraySchema),
  travel_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format."),
  time_window: timeWindowSchema.optional(),
  constraints: constraintsSchema.optional().default({}),
  preferences: z.preprocess(coerceToArray, preferencesSchema)
});


export const planStopSchema = stopInputSchema.extend({
  planned_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format.").optional()
});

export type Coordinate = z.infer<typeof coordinateSchema>;
export type PlaceInput = z.infer<typeof placeInputSchema>;
export type StopInput = z.infer<typeof stopInputSchema>;
export type PlanStop = z.infer<typeof planStopSchema>;
export type Constraints = z.infer<typeof constraintsSchema>;
export type Preference = z.infer<typeof preferenceSchema>;
