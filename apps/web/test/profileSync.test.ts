import { ProfileSchema } from "@jobhunter/core/schema";
import { describe, expect, it } from "vitest";
import { profileFilters, profilePlaces } from "../src/lib/filters";
import { profileFromPicks } from "../src/lib/profileSync";
import { emptyDraft } from "../src/lib/setup";

const profile = ProfileSchema.parse({
  titles: { include: ["product manager"] },
  locations: { include: ["dubai", "abu dhabi", "uae", "united arab emirates", "united kingdom", "uk", "london"], remote_ok: ["emea", "remote"] },
  industries: ["crypto", "brokerage"],
});
const draft = { ...emptyDraft(), places: profile.locations.include, remote: true, remoteOk: ["emea", "remote"], industries: ["crypto", "brokerage"] };

describe("profile defaults for the Radar", () => {
  it("lists your countries and cities as the menus name them", () => {
    expect(profilePlaces(profile)).toEqual({
      countries: ["United Arab Emirates", "United Kingdom"],
      locations: ["Dubai, United Arab Emirates", "Abu Dhabi, United Arab Emirates", "London, United Kingdom"],
      remote: true,
    });
  });

  it("starts the filters on your countries, remote and industries", () => {
    expect(profileFilters(profile)).toMatchObject({ countries: ["United Arab Emirates", "United Kingdom", "Remote"], locations: [], industries: ["crypto", "brokerage"] });
  });
});

describe("profileFromPicks (Save to my profile)", () => {
  it("keeps your own terms for countries you already had, and adds new countries in full", () => {
    const r = profileFromPicks(draft, { countries: ["United Arab Emirates", "Ireland", "Remote"], locations: [], industries: ["crypto"] });
    if ("error" in r) throw new Error(r.error);
    expect(r.patch.places).toEqual(["dubai", "abu dhabi", "uae", "united arab emirates", "ireland", "dublin", "cork", "galway", "limerick"]);
    expect(r.patch).toMatchObject({ remote: true, remoteOk: ["emea", "remote"], industries: ["crypto"] });
  });

  it("narrows a country to the cities you ticked, and drops remote when unticked", () => {
    const r = profileFromPicks(draft, { countries: ["United Arab Emirates"], locations: ["Dubai, United Arab Emirates"], industries: [] });
    if ("error" in r) throw new Error(r.error);
    expect(r.patch).toMatchObject({ places: ["dubai"], remote: false, industries: [] });
  });

  it("refuses to save a profile with no place and no remote", () => {
    expect(profileFromPicks(draft, { countries: [], locations: [], industries: [] })).toHaveProperty("error");
  });
});
