/**
 * Géocodage local des principales villes françaises (L-14).
 *
 * Évite un appel API de géocodage par lead (Nominatim est rate-limité).
 * Couvre les villes du jeu de démo + les 40 plus grandes agglomérations FR.
 * Pour une ville absente : le lead n'apparaît pas sur la carte (compté à part).
 */
export type LatLng = { lat: number; lng: number };

const CITIES: Record<string, LatLng> = {
  paris: { lat: 48.8566, lng: 2.3522 },
  marseille: { lat: 43.2965, lng: 5.3698 },
  lyon: { lat: 45.764, lng: 4.8357 },
  toulouse: { lat: 43.6047, lng: 1.4442 },
  nice: { lat: 43.7102, lng: 7.262 },
  nantes: { lat: 47.2184, lng: -1.5536 },
  montpellier: { lat: 43.6108, lng: 3.8767 },
  strasbourg: { lat: 48.5734, lng: 7.7521 },
  bordeaux: { lat: 44.8378, lng: -0.5792 },
  lille: { lat: 50.6292, lng: 3.0573 },
  rennes: { lat: 48.1173, lng: -1.6778 },
  reims: { lat: 49.2583, lng: 4.0317 },
  "le havre": { lat: 49.4944, lng: 0.1079 },
  "saint-etienne": { lat: 45.4397, lng: 4.3872 },
  toulon: { lat: 43.1242, lng: 5.928 },
  grenoble: { lat: 45.1885, lng: 5.7245 },
  dijon: { lat: 47.322, lng: 5.0415 },
  angers: { lat: 47.4784, lng: -0.5632 },
  nimes: { lat: 43.8367, lng: 4.3601 },
  "clermont-ferrand": { lat: 45.7772, lng: 3.087 },
  "aix-en-provence": { lat: 43.5297, lng: 5.4474 },
  brest: { lat: 48.3904, lng: -4.4861 },
  limoges: { lat: 45.8336, lng: 1.2611 },
  tours: { lat: 47.3941, lng: 0.6848 },
  amiens: { lat: 49.8941, lng: 2.2958 },
  perpignan: { lat: 42.6887, lng: 2.8948 },
  metz: { lat: 49.1193, lng: 6.1757 },
  besancon: { lat: 47.238, lng: 6.0243 },
  orleans: { lat: 47.9029, lng: 1.909 },
  rouen: { lat: 49.4432, lng: 1.0993 },
  mulhouse: { lat: 47.7508, lng: 7.3359 },
  caen: { lat: 49.1829, lng: -0.3707 },
  nancy: { lat: 48.6921, lng: 6.1844 },
  avignon: { lat: 43.9493, lng: 4.8055 },
  poitiers: { lat: 46.5802, lng: 0.3404 },
  pau: { lat: 43.2951, lng: -0.3708 },
  "la rochelle": { lat: 46.1603, lng: -1.1511 },
  annecy: { lat: 45.8992, lng: 6.1294 },
  cannes: { lat: 43.5528, lng: 7.0174 },
  bayonne: { lat: 43.4929, lng: -1.4748 },
};

function normalizeCity(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function geocodeCity(city: string | null | undefined): LatLng | null {
  if (!city) return null;
  return CITIES[normalizeCity(city)] ?? null;
}

/** Distance Haversine en km entre deux points (filtre rayon). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export const FRANCE_CENTER: LatLng = { lat: 46.6, lng: 2.4 };
