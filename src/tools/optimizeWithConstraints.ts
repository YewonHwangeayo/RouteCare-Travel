import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderBundle } from "../services/providers.js";
import { optimizeWithConstraintsInputSchema } from "../schemas/tools.js";
import { addMinutes, compactPlace, scoreStop, sortStopsForFeasibility } from "../services/scoring.js";
import { errorResult, jsonResult } from "./result.js";

export function registerOptimizeWithConstraints(server: McpServer, providers: ProviderBundle): void {
  server.registerTool(
    "optimize_with_constraints",
    {
      title: "Optimize With Constraints",
      description:
        "RouteCare Travel(루트케어 트래블): re-optimize an existing itinerary for luggage, child, panic sensitivity, stair avoidance, mobility, restroom, and rainy-day constraints.",
      inputSchema: optimizeWithConstraintsInputSchema.shape,
      annotations: {
        title: "Optimize With Constraints",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async (input) => {
      try {
        const parsed = optimizeWithConstraintsInputSchema.parse(input);
        const ordered = sortStopsForFeasibility(parsed.current_plan, parsed.constraints, parsed.preferences);
        let previous = { name: "현재 위치" };
        const changes: string[] = [];
        const penaltySummary = { travel: 0, crowd: 0, accessibility: 0, constraints: 0 };

        const stops = [];
        for (const [index, stop] of ordered.entries()) {
          const plannedTime = stop.planned_time ?? stop.desired_time ?? addMinutes("09:30", index * 90);
          const route = await providers.routing.estimateRoute(previous, stop, parsed.constraints);
          const crowd = await providers.crowd.getCrowd(stop, plannedTime);
          const accessibility = await providers.accessibility.getAccessibility(stop);
          const score = scoreStop({ route, crowd, accessibility, constraints: parsed.constraints, preferences: parsed.preferences, stop });
          penaltySummary.travel += score.penalties.travel;
          penaltySummary.crowd += score.penalties.crowd;
          penaltySummary.accessibility += score.penalties.accessibility;
          penaltySummary.constraints += score.penalties.constraints;

          if (parsed.current_plan[index]?.name !== stop.name) {
            changes.push(`${stop.name} 방문 순서를 조정해 이동 가능성을 높였습니다.`);
          }

          stops.push({
            place: compactPlace(stop),
            planned_time: plannedTime,
            score: score.score,
            risk: score.riskLevel,
            reasons: score.reasons.slice(0, 3),
            warning: score.warnings[0]
          });
          previous = stop;
        }

        return jsonResult({
          optimized_stops: stops,
          changes: changes.slice(0, 6),
          penalty_summary: penaltySummary,
          warnings: stops.map((stop) => stop.warning).filter((warning): warning is string => Boolean(warning)).slice(0, 5)
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
