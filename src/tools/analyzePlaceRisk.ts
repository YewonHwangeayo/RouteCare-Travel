import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderBundle } from "../services/providers.js";
import { analyzePlaceRiskInputSchema } from "../schemas/tools.js";
import { betterTimes, compactPlace, scoreStop } from "../services/scoring.js";
import { hydrateAlternatives } from "../services/mockProviders.js";
import { errorResult, jsonResult } from "./result.js";

export function registerAnalyzePlaceRisk(server: McpServer, providers: ProviderBundle): void {
  server.registerTool(
    "analyze_place_risk",
    {
      title: "Analyze Place Risk",
      description:
        "RouteCare Travel(루트케어 트래블): analyze crowd, accessibility, and traveler burden risk for one place at a target time, with better time and alternative-place suggestions.",
      inputSchema: analyzePlaceRiskInputSchema.shape,
      annotations: {
        title: "Analyze Place Risk",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async (input) => {
      try {
        const parsed = analyzePlaceRiskInputSchema.parse(input);
        const crowd = await providers.crowd.getCrowd(parsed.place, parsed.target_time);
        const accessibility = await providers.accessibility.getAccessibility(parsed.place);
        const route = await providers.routing.estimateRoute({ name: "현재 위치" }, parsed.place, parsed.constraints);
        const score = scoreStop({ route, crowd, accessibility, constraints: parsed.constraints, preferences: ["least_crowded"] });
        const alternatives = await hydrateAlternatives(providers, parsed.place, parsed.target_time, parsed.constraints, 800, ["least_crowded"]);

        return jsonResult({
          place: compactPlace(parsed.place),
          target_time: parsed.target_time,
          risk_level: score.riskLevel,
          score: score.score,
          reasons: [crowd.reason, ...score.reasons].slice(0, 4),
          better_times: betterTimes(parsed.target_time),
          alternatives: alternatives.slice(0, 2).map((alternative) => ({
            name: alternative.place.name,
            distance_meters: alternative.distanceMeters,
            crowd: alternative.crowd.level,
            accessibility: {
              restroom: alternative.accessibility.restroom,
              indoor_wait: alternative.accessibility.indoorWait
            }
          })),
          warnings: score.warnings
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
