import type { Constraints, PlaceInput, Preference, StopInput } from "../schemas/common.js";
import type { AccessibilityInfo, CrowdSnapshot, RiskLevel, RouteEstimate } from "./providers.js";

export interface ScoreInput {
  route: RouteEstimate;
  crowd: CrowdSnapshot;
  accessibility: AccessibilityInfo;
  constraints: Constraints;
  preferences: Preference[];
  stop?: StopInput;
}

export interface ScoreResult {
  score: number;
  riskLevel: RiskLevel;
  warnings: string[];
  reasons: string[];
  penalties: {
    travel: number;
    crowd: number;
    accessibility: number;
    constraints: number;
  };
}

export function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function chooseInitialTime(index: number, desiredTime?: string, start = "09:30"): string {
  return desiredTime ?? addMinutes(start, index * 90);
}

export function betterTimes(targetTime: string): string[] {
  const hour = Number(targetTime.slice(0, 2));
  if (hour >= 12 && hour <= 15) {
    return ["10:00", "11:00", "16:30"];
  }
  if (hour >= 17 && hour <= 19) {
    return ["10:30", "14:30", "20:00"];
  }
  return [addMinutes(targetTime, -60), addMinutes(targetTime, 90)];
}

export function scoreStop(input: ScoreInput): ScoreResult {
  const { route, crowd, accessibility, constraints, preferences, stop } = input;
  const warnings: string[] = [];
  const reasons: string[] = [];
  const travelPenalty = Math.min(35, route.minutes * 0.7 + route.walkingMeters / 180 + route.transfers * 6);
  let crowdPenalty = crowd.score * 0.35;
  let accessibilityPenalty = 0;
  let constraintPenalty = 0;

  if (constraints.panic_sensitive && crowd.level === "high") {
    crowdPenalty += 30;
    warnings.push("공황 민감 사용자는 이 시간대의 높은 혼잡을 피하는 편이 좋습니다.");
  }
  if (constraints.with_luggage) {
    constraintPenalty += route.walkingMeters > 700 ? 14 : 4;
    constraintPenalty += route.hasStairs ? 18 : 0;
    if (route.hasStairs) warnings.push("캐리어 동반 시 계단이나 복잡한 수직 이동이 부담될 수 있습니다.");
  }
  if (constraints.avoid_stairs || constraints.low_mobility) {
    constraintPenalty += route.hasStairs ? 25 : 0;
    accessibilityPenalty += route.elevatorAvailable ? -8 : 16;
    if (!route.elevatorAvailable) warnings.push("이 구간은 엘리베이터 이용 가능성이 불확실합니다.");
  }
  if (constraints.with_child || constraints.need_restroom) {
    accessibilityPenalty += accessibility.restroom ? -8 : 14;
    accessibilityPenalty += accessibility.nursingRoom && constraints.with_child ? -6 : 8;
    if (!accessibility.restroom) warnings.push("이 장소 주변 화장실 접근성이 불확실합니다.");
  }
  if (constraints.rainy_day) {
    constraintPenalty += route.walkingMeters / 160;
    if (!accessibility.indoorWait) warnings.push("실내 대기 장소가 불확실해 우천 시 여유 시간이 필요합니다.");
  }
  if (preferences.includes("fastest")) {
    reasons.push("이동 시간을 우선해 평가했습니다.");
  }
  if (preferences.includes("least_crowded") && crowd.level !== "low") {
    crowdPenalty += 12;
  }
  if (preferences.includes("least_transfer")) {
    constraintPenalty += route.transfers * 5;
  }
  if (preferences.includes("accessibility_first")) {
    accessibilityPenalty -= accessibility.restPointScore / 20;
  }

  const priorityBonus = stop ? stop.priority * 2 : 0;
  const rawScore = 100 - travelPenalty - crowdPenalty - accessibilityPenalty - constraintPenalty + priorityBonus;
  const score = Math.max(1, Math.min(99, Math.round(rawScore)));

  if (crowd.level === "low") reasons.push("혼잡도가 낮아 비교적 편하게 방문할 수 있습니다.");
  if (accessibility.restroom) reasons.push("화장실 접근 가능성이 높습니다.");
  if (route.elevatorAvailable) reasons.push("엘리베이터 친화적인 이동 가능성이 있습니다.");
  if (route.transfers === 0) reasons.push("환승 없이 이동 가능한 경로입니다.");

  const riskLevel = score < 45 || warnings.length >= 2 ? "high" : score < 70 || warnings.length === 1 ? "medium" : "low";

  return {
    score,
    riskLevel,
    warnings: warnings.slice(0, 3),
    reasons: reasons.slice(0, 4),
    penalties: {
      travel: Math.round(travelPenalty),
      crowd: Math.round(crowdPenalty),
      accessibility: Math.round(accessibilityPenalty),
      constraints: Math.round(constraintPenalty)
    }
  };
}

export function sortStopsForFeasibility<TStop extends StopInput>(stops: TStop[], constraints: Constraints, preferences: Preference[]): TStop[] {
  return [...stops].sort((a, b) => {
    const aShopping = /olive|store|shop|market|올리브영|쇼핑/i.test(a.name) ? 1 : 0;
    const bShopping = /olive|store|shop|market|올리브영|쇼핑/i.test(b.name) ? 1 : 0;
    const priorityDelta = b.priority - a.priority;
    const accessibilityDelta = constraints.with_child || constraints.low_mobility || preferences.includes("accessibility_first")
      ? Number(/station|mall|museum|역|몰|백화점/i.test(b.name)) - Number(/station|mall|museum|역|몰|백화점/i.test(a.name))
      : 0;
    const shoppingDelta = preferences.includes("shopping_focused") ? bShopping - aShopping : 0;
    return accessibilityDelta || shoppingDelta || priorityDelta;
  });
}

export function compactPlace(place: PlaceInput): { name: string; category?: string; address?: string } {
  return {
    name: place.name,
    ...(place.category ? { category: place.category } : {}),
    ...(place.address ? { address: place.address } : {})
  };
}
