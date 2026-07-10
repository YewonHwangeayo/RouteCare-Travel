import type { Coordinate, PlaceInput } from "../schemas/common.js";

export const SEOUL_STATION: Coordinate = { lat: 37.5547, lng: 126.9706 };

export function hashText(value: string): number {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function inferCoordinate(place: PlaceInput): Coordinate {
  if (place.coordinate) {
    return place.coordinate;
  }

  const hash = hashText(place.name);
  return {
    lat: SEOUL_STATION.lat + ((hash % 70) - 35) / 1000,
    lng: SEOUL_STATION.lng + ((hash % 90) - 45) / 1000
  };
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const latMeters = (a.lat - b.lat) * 111_000;
  const lngMeters = (a.lng - b.lng) * 88_000;
  return Math.round(Math.sqrt(latMeters ** 2 + lngMeters ** 2));
}
