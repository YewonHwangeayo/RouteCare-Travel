import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderBundle } from "../services/providers.js";
import { suggestAlternativesInputSchema } from "../schemas/tools.js";
import { hydrateAlternatives } from "../services/mockProviders.js";
import { compactPlace } from "../services/scoring.js";
import { errorResult, jsonResult } from "./result.js";

export function registerSuggestAlternatives(server: McpServer, providers: ProviderBundle): void {
  server.registerTool(
    "suggest_alternatives",
    {
      title: "Suggest Alternatives",
      description:
        "RouteCare Travel(루트케어 트래블): suggest nearby alternative places with concise distance, crowd, and accessibility comparisons for a target visit time.",
      inputSchema: suggestAlternativesInputSchema.shape,
      annotations: {
        title: "Suggest Alternatives",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async (input) => {
      try {
        const parsed = suggestAlternativesInputSchema.parse(input);
        const originalCrowd = await providers.crowd.getCrowd(parsed.place, parsed.target_time);
        const alternatives = await hydrateAlternatives(
          providers,
          parsed.place,
          parsed.target_time,
          parsed.constraints,
          parsed.radius,
          ["least_crowded", "accessibility_first"]
        );

        return jsonResult({
          original: {
            place: compactPlace(parsed.place),
            crowd: originalCrowd.level
          },
          radius_meters: parsed.radius,
          alternatives: alternatives.map((alternative) => ({
            place: compactPlace(alternative.place),
            distance_meters: alternative.distanceMeters,
            comparison: {
              crowd: `${originalCrowd.level} -> ${alternative.crowd.level}`,
              restroom: alternative.accessibility.restroom,
              indoor_wait: alternative.accessibility.indoorWait,
              elevator_likely: alternative.accessibility.elevatorLikely
            },
            note: alternative.crowd.level === "high" ? "시간 조정이 가능할 때만 권장합니다." : "현재 제약 조건에는 더 적합한 후보입니다."
          }))
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
