import type {
  AccessibilityInfo,
  AccessibilityProvider,
  AlternativePlace,
  CrowdProvider,
  CrowdSnapshot,
  PlacesProvider,
  ProviderBundle,
  RouteEstimate,
  RoutingProvider
} from "./providers.js";
import type { Constraints, Coordinate, PlaceInput, Preference } from "../schemas/common.js";
import { distanceMeters, hashText, inferCoordinate } from "./geo.js";

function timeToHour(time: string): number {
  return Number(time.slice(0, 2));
}

export class MockCrowdProvider implements CrowdProvider {
  async getCrowd(place: PlaceInput, time: string): Promise<CrowdSnapshot> {
    const hour = timeToHour(time);
    const placeBias = hashText(place.name) % 25;
    const rushBias = hour >= 17 && hour <= 19 ? 25 : 0;
    const lunchBias = hour >= 12 && hour <= 14 ? 20 : 0;
    const shoppingBias = /olive|mall|store|market|올리브영|성수|쇼핑/i.test(place.name) ? 15 : 0;
    const score = Math.min(100, 25 + placeBias + rushBias + lunchBias + shoppingBias);

    if (score >= 70) {
      return { level: "high", score, reason: "이 시간대에는 혼잡 압력이 높을 가능성이 큽니다." };
    }
    if (score >= 45) {
      return { level: "medium", score, reason: "혼잡도가 보통 수준이라 이동 여유 시간이 필요합니다." };
    }
    return { level: "low", score, reason: "비교적 관리 가능한 혼잡도로 예상됩니다." };
  }
}

export class MockRoutingProvider implements RoutingProvider {
  async estimateRoute(from: PlaceInput, to: PlaceInput, constraints: Constraints): Promise<RouteEstimate> {
    const meters = distanceMeters(inferCoordinate(from), inferCoordinate(to));
    const walkingMeters = Math.max(180, Math.round(meters * 0.28));
    const transfers = meters > 8000 ? 2 : meters > 3000 ? 1 : 0;
    const hasStairs = transfers > 0 || walkingMeters > 700;
    const elevatorAvailable = !/old|hill|계단/i.test(to.name);
    const escalatorAvailable = transfers > 0;
    const luggageBuffer = constraints.with_luggage ? 6 : 0;
    const mobilityBuffer = constraints.low_mobility ? 8 : 0;
    const rainyBuffer = constraints.rainy_day ? Math.ceil(walkingMeters / 250) : 0;

    return {
      minutes: Math.max(8, Math.round(meters / 420) + transfers * 7 + luggageBuffer + mobilityBuffer + rainyBuffer),
      walkingMeters,
      transfers,
      hasStairs,
      elevatorAvailable,
      escalatorAvailable,
      summary: transfers === 0 ? "대체로 직접 이동 가능한 구간입니다." : "환승 여유 시간이 필요한 대중교통 구간입니다."
    };
  }
}

export class MockAccessibilityProvider implements AccessibilityProvider {
  async getAccessibility(place: PlaceInput): Promise<AccessibilityInfo> {
    const name = place.name.toLowerCase();
    const hubLike = /station|역|terminal|airport|mall|department|백화점|몰/.test(name);
    const childFriendly = /museum|library|mall|park|키즈|수유|family/.test(name);
    const outdoor = /park|trail|street|거리|공원/.test(name);

    return {
      restroom: hubLike || childFriendly || !/popup|market|street|거리/.test(name),
      nursingRoom: hubLike || childFriendly,
      indoorWait: hubLike || childFriendly || /cafe|카페|store|olive|올리브영/.test(name),
      elevatorLikely: hubLike || !/hill|stairs|계단|언덕/.test(name),
      restPointScore: hubLike ? 90 : childFriendly ? 80 : outdoor ? 45 : 65,
      notes: [
        hubLike ? "대형 시설 편의시설이 있을 가능성이 높습니다." : "편의시설 여부는 장소 유형을 기준으로 추정했습니다.",
        outdoor ? "비 오는 날에는 야외 노출이 불편할 수 있습니다." : "주변 실내 대기 장소가 있을 가능성이 있습니다."
      ]
    };
  }
}

export class MockPlacesProvider implements PlacesProvider {
  async findAlternatives(place: PlaceInput, radius: number, preferences: Preference[]): Promise<Array<PlaceInput & { coordinate: Coordinate }>> {
    const base = inferCoordinate(place);
    const shopping = preferences.includes("shopping_focused") || /olive|store|shop|올리브영|쇼핑/i.test(place.name);
    const category = shopping ? "store" : place.category ?? "nearby";

    return [1, 2, 3].map((index) => ({
      name: shopping ? `${place.name} 근처 후보 ${index}` : `${place.name} 대체 장소 ${index}`,
      category,
      address: `${place.name} 기준 약 ${Math.round((radius / 4) * index)}m 이내`,
      coordinate: {
        lat: base.lat + index * 0.0015,
        lng: base.lng - index * 0.0012
      }
    }));
  }
}

export async function hydrateAlternatives(
  providers: ProviderBundle,
  place: PlaceInput,
  targetTime: string,
  constraints: Constraints,
  radius: number,
  preferences: Preference[]
): Promise<AlternativePlace[]> {
  const base = inferCoordinate(place);
  const alternatives = await providers.places.findAlternatives(place, radius, preferences);

  return Promise.all(
    alternatives.map(async (alternative) => ({
      place: alternative,
      distanceMeters: distanceMeters(base, alternative.coordinate),
      accessibility: await providers.accessibility.getAccessibility(alternative),
      crowd: await providers.crowd.getCrowd(alternative, targetTime)
    }))
  );
}

export function createMockProviders(): ProviderBundle {
  return {
    crowd: new MockCrowdProvider(),
    routing: new MockRoutingProvider(),
    accessibility: new MockAccessibilityProvider(),
    places: new MockPlacesProvider()
  };
}
