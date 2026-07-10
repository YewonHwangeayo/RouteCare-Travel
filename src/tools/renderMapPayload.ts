import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderMapPayloadInputSchema } from "../schemas/tools.js";
import { compactPlace } from "../services/scoring.js";
import { errorResult, jsonResult } from "./result.js";

export function registerRenderMapPayload(server: McpServer): void {
  server.registerTool(
    "render_map_payload",
    {
      title: "Render Map Payload",
      description:
        "RouteCare Travel(루트케어 트래블): convert an optimized itinerary into a minimal map UI payload with ordered waypoints, labels, and warnings without raw polyline data.",
      inputSchema: renderMapPayloadInputSchema.shape,
      annotations: {
        title: "Render Map Payload",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      }
    },
    async (input) => {
      try {
        const parsed = renderMapPayloadInputSchema.parse(input);
        return jsonResult({
          origin: compactPlace(parsed.optimized_plan.origin),
          waypoints: parsed.optimized_plan.stops.map((stop, index) => ({
            order: index + 1,
            label: `${index + 1}. ${stop.name}`,
            time: stop.planned_time,
            coordinate: stop.coordinate,
            warning: stop.warning
          })),
          warnings: parsed.optimized_plan.warnings.slice(0, 6)
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
