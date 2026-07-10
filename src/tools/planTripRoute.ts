import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderBundle } from "../services/providers.js";
import { addMinutes, chooseInitialTime, compactPlace, scoreStop, sortStopsForFeasibility } from "../services/scoring.js";
import { planTripRouteInputSchema } from "../schemas/tools.js";
import { errorResult, jsonResult } from "./result.js";

export function registerPlanTripRoute(server: McpServer, providers: ProviderBundle): void {
  server.registerTool(
    "plan_trip_route",
    {
      title: "Plan Trip Route",
      description:
        "RouteCare Travel(루트케어 트래블): optimize visit order and time windows for feasible outdoor/transit-focused travel routes using crowd, travel-time, accessibility, and traveler constraints.",
      inputSchema: planTripRouteInputSchema,
      annotations: {
        title: "Plan Trip Route",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async (input) => {
      try {
        const parsed = planTripRouteInputSchema.parse(input);
        const start = parsed.time_window?.start ?? "09:30";
        const orderedStops = sortStopsForFeasibility(parsed.stops, parsed.constraints, parsed.preferences);
        let previous = parsed.origin;
        let cursor = start;

        const stops = [];
        const warnings: string[] = [];
        let totalScore = 0;

        for (const [index, stop] of orderedStops.entries()) {
          const plannedTime = chooseInitialTime(index, stop.desired_time, cursor);
          const route = await providers.routing.estimateRoute(previous, stop, parsed.constraints);
          const arrivalTime = addMinutes(plannedTime, route.minutes);
          const crowd = await providers.crowd.getCrowd(stop, arrivalTime);
          const accessibility = await providers.accessibility.getAccessibility(stop);
          const score = scoreStop({ route, crowd, accessibility, constraints: parsed.constraints, preferences: parsed.preferences, stop });
          totalScore += score.score;
          warnings.push(...score.warnings);

          stops.push({
            place: compactPlace(stop),
            planned_time: arrivalTime,
            duration_minutes: stop.duration_minutes,
            score: score.score,
            risk: score.riskLevel,
            reasons: score.reasons.slice(0, 3),
            warning: score.warnings[0]
          });

          previous = stop;
          cursor = addMinutes(arrivalTime, stop.duration_minutes);
        }

        return jsonResult({
          route_name: "RouteCare Travel 추천 동선",
          travel_date: parsed.travel_date,
          origin: compactPlace(parsed.origin),
          stops,
          summary: {
            score: Math.round(totalScore / stops.length),
            warnings: [...new Set(warnings)].slice(0, 5)
          }
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
