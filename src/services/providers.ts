import type { Constraints, Coordinate, PlaceInput, Preference } from "../schemas/common.js";

export type CrowdLevel = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

export interface CrowdSnapshot {
  level: CrowdLevel;
  score: number;
  reason: string;
}

export interface RouteEstimate {
  minutes: number;
  walkingMeters: number;
  transfers: number;
  hasStairs: boolean;
  elevatorAvailable: boolean;
  escalatorAvailable: boolean;
  summary: string;
}

export interface AccessibilityInfo {
  restroom: boolean;
  nursingRoom: boolean;
  indoorWait: boolean;
  elevatorLikely: boolean;
  restPointScore: number;
  notes: string[];
}

export interface AlternativePlace {
  place: PlaceInput & { coordinate: Coordinate };
  distanceMeters: number;
  accessibility: AccessibilityInfo;
  crowd: CrowdSnapshot;
}

export interface CrowdProvider {
  getCrowd(place: PlaceInput, time: string): Promise<CrowdSnapshot>;
}

export interface RoutingProvider {
  estimateRoute(from: PlaceInput, to: PlaceInput, constraints: Constraints): Promise<RouteEstimate>;
}

export interface AccessibilityProvider {
  getAccessibility(place: PlaceInput): Promise<AccessibilityInfo>;
}

export interface PlacesProvider {
  findAlternatives(place: PlaceInput, radius: number, preferences: Preference[]): Promise<Array<PlaceInput & { coordinate: Coordinate }>>;
}

export interface ProviderBundle {
  crowd: CrowdProvider;
  routing: RoutingProvider;
  accessibility: AccessibilityProvider;
  places: PlacesProvider;
}
