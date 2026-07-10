import type {
  AccessibilityInfo,
  AccessibilityProvider,
  CrowdLevel,
  CrowdProvider,
  CrowdSnapshot,
  PlacesProvider,
  ProviderBundle,
  RouteEstimate,
  RoutingProvider
} from "./providers.js";
import type { Constraints, Coordinate, PlaceInput, Preference } from "../schemas/common.js";
import { fetchJson } from "./apiClient.js";
import { createMockProviders } from "./mockProviders.js";
import { distanceMeters, inferCoordinate } from "./geo.js";

interface RealProviderConfig {
  tourApiServiceKey?: string;
  seoulOpenApiKey?: string;
  osrmBaseUrl: string;
  publicToiletApiUrl?: string;
}

interface TourApiItem {
  title?: string;
  addr1?: string;
  contenttypeid?: string;
  mapx?: string;
  mapy?: string;
}

interface TourApiResponse {
  response?: {
    body?: {
      items?: {
        item?: TourApiItem[] | TourApiItem;
      };
    };
  };
}

interface SeoulCityDataResponse {
  CITYDATA?: {
    AREA_NM?: string;
    LIVE_PPLTN_STTS?: Array<{
      AREA_CONGEST_LVL?: string;
      AREA_CONGEST_MSG?: string;
    }>;
  };
}

interface OsrmRouteResponse {
  routes?: Array<{
    duration?: number;
    distance?: number;
  }>;
}

const crowdMap: Record<string, { level: CrowdLevel; score: number }> = {
  여유: { level: "low", score: 25 },
  보통: { level: "medium", score: 50 },
  약간붐빔: { level: "medium", score: 65 },
  붐빔: { level: "high", score: 82 }
};

function normalizeSeoulAreaName(place: PlaceInput): string {
  return place.name
    .replace(/\s*(올리브영|olive young|매장|점)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function contentTypeToCategory(contentTypeId?: string): string {
  switch (contentTypeId) {
    case "12":
      return "tour";
    case "14":
      return "culture";
    case "15":
      return "festival";
    case "38":
      return "shopping";
    case "39":
      return "food";
    default:
      return "place";
  }
}

function parseTourItems(response: TourApiResponse): TourApiItem[] {
  const item = response.response?.body?.items?.item;
  if (!item) {
    return [];
  }
  return Array.isArray(item) ? item : [item];
}

export class SeoulCityDataCrowdProvider implements CrowdProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fallback: CrowdProvider
  ) {}

  async getCrowd(place: PlaceInput, time: string): Promise<CrowdSnapshot> {
    if (!this.apiKey) {
      return this.fallback.getCrowd(place, time);
    }

    try {
      const areaName = normalizeSeoulAreaName(place);
      const url = new URL(`http://openapi.seoul.go.kr:8088/${this.apiKey}/json/citydata/1/5/${encodeURIComponent(areaName)}`);
      const data = await fetchJson<SeoulCityDataResponse>(url);
      const status = data.CITYDATA?.LIVE_PPLTN_STTS?.[0];
      const rawLevel = status?.AREA_CONGEST_LVL?.replace(/\s/g, "");
      const mapped = rawLevel ? crowdMap[rawLevel] : undefined;

      if (!mapped) {
        return this.fallback.getCrowd(place, time);
      }

      return {
        level: mapped.level,
        score: mapped.score,
        reason: `서울 실시간 도시데이터 기준 ${data.CITYDATA?.AREA_NM ?? areaName} 혼잡도는 "${status?.AREA_CONGEST_LVL}"입니다. ${
          status?.AREA_CONGEST_MSG ?? ""
        }`.trim()
      };
    } catch {
      return this.fallback.getCrowd(place, time);
    }
  }
}

export class OsrmRoutingProvider implements RoutingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fallback: RoutingProvider
  ) {}

  async estimateRoute(from: PlaceInput, to: PlaceInput, constraints: Constraints): Promise<RouteEstimate> {
    if (!from.coordinate || !to.coordinate) {
      return this.fallback.estimateRoute(from, to, constraints);
    }

    try {
      const start = `${from.coordinate.lng},${from.coordinate.lat}`;
      const end = `${to.coordinate.lng},${to.coordinate.lat}`;
      const url = new URL(`/route/v1/walking/${start};${end}`, this.baseUrl);
      url.searchParams.set("overview", "false");
      url.searchParams.set("alternatives", "false");
      url.searchParams.set("steps", "false");

      const data = await fetchJson<OsrmRouteResponse>(url);
      const route = data.routes?.[0];
      if (!route?.duration || !route.distance) {
        return this.fallback.estimateRoute(from, to, constraints);
      }

      const walkingMeters = Math.round(route.distance);
      const minutes = Math.max(3, Math.round(route.duration / 60));
      const hasStairs = walkingMeters > 900;

      return {
        minutes: minutes + (constraints.with_luggage ? 4 : 0) + (constraints.low_mobility ? 6 : 0),
        walkingMeters,
        transfers: 0,
        hasStairs,
        elevatorAvailable: !hasStairs,
        escalatorAvailable: false,
        summary: "OSRM 실제 보행 경로 기준 예상 이동시간입니다."
      };
    } catch {
      return this.fallback.estimateRoute(from, to, constraints);
    }
  }
}

export class TourApiPlacesProvider implements PlacesProvider {
  constructor(
    private readonly serviceKey: string | undefined,
    private readonly fallback: PlacesProvider
  ) {}

  async findAlternatives(place: PlaceInput, radius: number, preferences: Preference[]): Promise<Array<PlaceInput & { coordinate: Coordinate }>> {
    if (!this.serviceKey || !place.coordinate) {
      return this.fallback.findAlternatives(place, radius, preferences);
    }

    try {
      const url = new URL("https://apis.data.go.kr/B551011/KorService2/locationBasedList2");
      url.searchParams.set("serviceKey", this.serviceKey);
      url.searchParams.set("MobileOS", "ETC");
      url.searchParams.set("MobileApp", "RouteCareTravel");
      url.searchParams.set("_type", "json");
      url.searchParams.set("mapX", String(place.coordinate.lng));
      url.searchParams.set("mapY", String(place.coordinate.lat));
      url.searchParams.set("radius", String(radius));
      url.searchParams.set("numOfRows", "8");
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("arrange", "S");

      const data = await fetchJson<TourApiResponse>(url);
      const alternatives = parseTourItems(data)
        .filter((item) => item.title && item.mapx && item.mapy && item.title !== place.name)
        .slice(0, 4)
        .map((item) => ({
          name: item.title ?? "이름 없는 장소",
          address: item.addr1,
          category: contentTypeToCategory(item.contenttypeid),
          coordinate: {
            lat: Number(item.mapy),
            lng: Number(item.mapx)
          }
        }))
        .filter((candidate) => Number.isFinite(candidate.coordinate.lat) && Number.isFinite(candidate.coordinate.lng));

      return alternatives.length > 0 ? alternatives : this.fallback.findAlternatives(place, radius, preferences);
    } catch {
      return this.fallback.findAlternatives(place, radius, preferences);
    }
  }
}

export class OpenDataAccessibilityProvider implements AccessibilityProvider {
  constructor(
    private readonly publicToiletApiUrl: string | undefined,
    private readonly fallback: AccessibilityProvider
  ) {}

  async getAccessibility(place: PlaceInput): Promise<AccessibilityInfo> {
    const fallback = await this.fallback.getAccessibility(place);

    if (!this.publicToiletApiUrl || !place.coordinate) {
      return {
        ...fallback,
        notes: [...fallback.notes, "실제 접근성 상세 API가 설정되지 않아 장소 유형 기반 추정을 함께 사용했습니다."].slice(0, 3)
      };
    }

    try {
      const url = new URL(this.publicToiletApiUrl);
      url.searchParams.set("lat", String(place.coordinate.lat));
      url.searchParams.set("lng", String(place.coordinate.lng));
      const data = await fetchJson<{ restroomNearby?: boolean; nursingRoomNearby?: boolean; indoorWaitNearby?: boolean }>(url);

      return {
        ...fallback,
        restroom: Boolean(data.restroomNearby ?? fallback.restroom),
        nursingRoom: Boolean(data.nursingRoomNearby ?? fallback.nursingRoom),
        indoorWait: Boolean(data.indoorWaitNearby ?? fallback.indoorWait),
        notes: ["설정된 접근성 API 응답을 반영했습니다.", ...fallback.notes].slice(0, 3)
      };
    } catch {
      return fallback;
    }
  }
}

export function createRealProvidersFromEnv(): ProviderBundle {
  const fallback = createMockProviders();
  const config: RealProviderConfig = {
    tourApiServiceKey: process.env.TOUR_API_SERVICE_KEY,
    seoulOpenApiKey: process.env.SEOUL_OPEN_API_KEY,
    osrmBaseUrl: process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org",
    publicToiletApiUrl: process.env.ACCESSIBILITY_API_URL
  };

  return {
    crowd: new SeoulCityDataCrowdProvider(config.seoulOpenApiKey, fallback.crowd),
    routing: new OsrmRoutingProvider(config.osrmBaseUrl, fallback.routing),
    accessibility: new OpenDataAccessibilityProvider(config.publicToiletApiUrl, fallback.accessibility),
    places: new TourApiPlacesProvider(config.tourApiServiceKey, fallback.places)
  };
}

export function estimateAlternativeDistance(origin: PlaceInput, alternative: PlaceInput & { coordinate: Coordinate }): number {
  return distanceMeters(inferCoordinate(origin), alternative.coordinate);
}
