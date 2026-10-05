import { COUNTRIES, countryTerms, placeOwner } from "@jobhunter/core/catalog/places";
import { REMOTE } from "./filters";
import type { Draft } from "./setup";

/** What the Radar's place and industry filters say, as the Radar names things. */
export type FilterPicks = {
  /** Country display names ("United Kingdom"), plus "Remote" for remote roles. */
  countries: string[];
  /** "City, Country" ("Dubai, United Arab Emirates"). */
  locations: string[];
  industries: string[];
};

/**
 * Turn Radar picks into profile settings ("Save to my profile"):
 * - a ticked city narrows its country to the ticked cities
 * - a ticked country you already had keeps your own terms for it (e.g. only Dubai and Abu Dhabi)
 * - a newly ticked country gets its name, aliases and main cities
 * - "Remote" decides whether remote roles count
 * Returns the draft patch, or an error when nothing would be left to search.
 */
export function profileFromPicks(draft: Draft, picks: FilterPicks): { patch: Partial<Draft> } | { error: string } {
  const remote = picks.countries.includes(REMOTE);
  const countries = picks.countries.filter((c) => c !== REMOTE).map((c) => c.toLowerCase());
  const cities = picks.locations.map((l) => {
    const [city, country] = l.split(/,\s*/);
    return { city: city!.toLowerCase(), country: country?.toLowerCase() };
  });

  const places: string[] = [];
  for (const name of countries) {
    const picked = cities.filter((c) => c.country === name).map((c) => c.city);
    if (picked.length) {
      places.push(...picked);
      continue;
    }
    const mine = draft.places.filter((t) => placeOwner(t) === `country:${name}`);
    if (mine.length) {
      places.push(...mine);
      continue;
    }
    const country = COUNTRIES.find((c) => c.name === name);
    places.push(...(country ? countryTerms(country, true) : [name]));
  }
  // Cities picked in a country that isn't ticked still count.
  for (const c of cities) if (!c.country || !countries.includes(c.country)) places.push(c.city);
  // Terms that aren't countries or cities we know (your own words) stay as they were.
  places.push(...draft.places.filter((t) => !placeOwner(t)));

  const unique = [...new Set(places)];
  if (!unique.length && !remote) return { error: "Pick at least one country, city or remote before saving to your profile." };
  return {
    patch: {
      places: unique,
      remote,
      remoteOk: remote && !draft.remoteOk.length ? ["remote"] : draft.remoteOk,
      industries: [...picks.industries],
    },
  };
}
