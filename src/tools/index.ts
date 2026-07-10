import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderBundle } from "../services/providers.js";
import { registerAnalyzePlaceRisk } from "./analyzePlaceRisk.js";
import { registerOptimizeWithConstraints } from "./optimizeWithConstraints.js";
import { registerPlanTripRoute } from "./planTripRoute.js";
import { registerRenderMapPayload } from "./renderMapPayload.js";
import { registerSuggestAlternatives } from "./suggestAlternatives.js";

export function registerTools(server: McpServer, providers: ProviderBundle): void {
  registerPlanTripRoute(server, providers);
  registerAnalyzePlaceRisk(server, providers);
  registerOptimizeWithConstraints(server, providers);
  registerSuggestAlternatives(server, providers);
  registerRenderMapPayload(server);
}
