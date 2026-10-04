/**
 * Worldwide places for setup: every country with common aliases and its main job-market cities,
 * plus the region words job ads use for remote roles. All lowercase, matched as whole words.
 */
export type Country = { name: string; aliases: string[]; cities: string[] };
export type Region = { name: string; aliases: string[]; hint: string };

const c = (name: string, aliases: string[], cities: string[]): Country => ({ name, aliases, cities });

export const COUNTRIES: Country[] = [
  // Middle East & North Africa
  c("united arab emirates", ["uae", "emirates"], ["dubai", "abu dhabi", "sharjah", "ajman", "ras al khaimah"]),
  c("saudi arabia", ["ksa"], ["riyadh", "jeddah", "dammam", "khobar", "neom"]),
  c("qatar", [], ["doha"]),
  c("bahrain", [], ["manama"]),
  c("kuwait", [], ["kuwait city"]),
  c("oman", [], ["muscat"]),
  c("jordan", [], ["amman"]),
  c("lebanon", [], ["beirut"]),
  c("egypt", [], ["cairo", "alexandria", "giza"]),
  c("morocco", [], ["casablanca", "rabat", "marrakech", "tangier"]),
  c("tunisia", [], ["tunis"]),
  c("algeria", [], ["algiers", "oran"]),
  c("libya", [], ["tripoli", "benghazi"]),
  c("iraq", [], ["baghdad", "erbil", "basra"]),
  c("iran", [], ["tehran", "isfahan"]),
  c("israel", [], ["tel aviv", "jerusalem", "haifa", "herzliya"]),
  c("palestine", [], ["ramallah"]),
  c("syria", [], ["damascus", "aleppo"]),
  c("yemen", [], ["sanaa", "aden"]),
  c("turkey", ["turkiye", "türkiye"], ["istanbul", "ankara", "izmir"]),
  c("cyprus", [], ["nicosia", "limassol", "larnaca"]),
  // Europe
  c("united kingdom", ["uk", "great britain", "britain", "england", "scotland", "wales", "northern ireland"], ["london", "manchester", "edinburgh", "birmingham", "bristol", "cambridge", "oxford", "leeds", "glasgow", "belfast"]),
  c("ireland", [], ["dublin", "cork", "galway", "limerick"]),
  c("france", [], ["paris", "lyon", "marseille", "toulouse", "nice", "bordeaux"]),
  c("germany", ["deutschland"], ["berlin", "munich", "hamburg", "frankfurt", "cologne", "stuttgart", "düsseldorf"]),
  c("netherlands", ["holland"], ["amsterdam", "rotterdam", "the hague", "utrecht", "eindhoven"]),
  c("belgium", [], ["brussels", "antwerp", "ghent"]),
  c("luxembourg", [], ["luxembourg city"]),
  c("switzerland", [], ["zurich", "geneva", "basel", "lausanne", "zug", "bern"]),
  c("austria", [], ["vienna", "graz", "linz"]),
  c("spain", [], ["madrid", "barcelona", "valencia", "seville", "malaga"]),
  c("portugal", [], ["lisbon", "porto", "braga"]),
  c("italy", [], ["milan", "rome", "turin", "bologna", "florence", "naples"]),
  c("malta", [], ["valletta", "sliema"]),
  c("greece", [], ["athens", "thessaloniki"]),
  c("sweden", [], ["stockholm", "gothenburg", "malmö"]),
  c("norway", [], ["oslo", "bergen", "trondheim"]),
  c("denmark", [], ["copenhagen", "aarhus"]),
  c("finland", [], ["helsinki", "espoo", "tampere"]),
  c("iceland", [], ["reykjavik"]),
  c("estonia", [], ["tallinn", "tartu"]),
  c("latvia", [], ["riga"]),
  c("lithuania", [], ["vilnius", "kaunas"]),
  c("poland", [], ["warsaw", "krakow", "wroclaw", "gdansk", "poznan"]),
  c("czech republic", ["czechia"], ["prague", "brno"]),
  c("slovakia", [], ["bratislava"]),
  c("hungary", [], ["budapest"]),
  c("romania", [], ["bucharest", "cluj napoca", "iasi"]),
  c("bulgaria", [], ["sofia", "plovdiv", "varna"]),
  c("serbia", [], ["belgrade", "novi sad"]),
  c("croatia", [], ["zagreb", "split"]),
  c("slovenia", [], ["ljubljana"]),
  c("bosnia and herzegovina", ["bosnia"], ["sarajevo"]),
  c("north macedonia", ["macedonia"], ["skopje"]),
  c("albania", [], ["tirana"]),
  c("montenegro", [], ["podgorica"]),
  c("kosovo", [], ["pristina"]),
  c("moldova", [], ["chisinau"]),
  c("ukraine", [], ["kyiv", "kiev", "lviv", "kharkiv", "odesa"]),
  c("belarus", [], ["minsk"]),
  c("russia", ["russian federation"], ["moscow", "saint petersburg"]),
  c("georgia", [], ["tbilisi", "batumi"]),
  c("armenia", [], ["yerevan"]),
  c("azerbaijan", [], ["baku"]),
  c("monaco", [], ["monte carlo"]),
  c("liechtenstein", [], ["vaduz"]),
  c("andorra", [], ["andorra la vella"]),
  c("san marino", [], ["san marino"]),
  c("gibraltar", [], ["gibraltar"]),
  // North America
  c("united states", ["usa", "us", "united states of america", "america"], ["new york", "san francisco", "los angeles", "seattle", "austin", "boston", "chicago", "miami", "washington dc", "denver", "atlanta", "dallas"]),
  c("canada", [], ["toronto", "vancouver", "montreal", "calgary", "ottawa", "waterloo"]),
  c("mexico", [], ["mexico city", "guadalajara", "monterrey"]),
  // Central America & Caribbean
  c("guatemala", [], ["guatemala city"]),
  c("belize", [], ["belize city"]),
  c("honduras", [], ["tegucigalpa", "san pedro sula"]),
  c("el salvador", [], ["san salvador"]),
  c("nicaragua", [], ["managua"]),
  c("costa rica", [], ["san jose"]),
  c("panama", [], ["panama city"]),
  c("cuba", [], ["havana"]),
  c("dominican republic", [], ["santo domingo"]),
  c("jamaica", [], ["kingston"]),
  c("puerto rico", [], ["san juan"]),
  c("bahamas", [], ["nassau"]),
  c("barbados", [], ["bridgetown"]),
  c("trinidad and tobago", ["trinidad"], ["port of spain"]),
  c("haiti", [], ["port au prince"]),
  c("cayman islands", [], ["george town"]),
  c("bermuda", [], ["hamilton"]),
  // South America
  c("brazil", ["brasil"], ["são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "brasilia", "curitiba", "porto alegre"]),
  c("argentina", [], ["buenos aires", "cordoba", "rosario"]),
  c("chile", [], ["santiago", "valparaiso"]),
  c("colombia", [], ["bogota", "medellin", "cali"]),
  c("peru", [], ["lima"]),
  c("uruguay", [], ["montevideo"]),
  c("paraguay", [], ["asuncion"]),
  c("bolivia", [], ["la paz", "santa cruz"]),
  c("ecuador", [], ["quito", "guayaquil"]),
  c("venezuela", [], ["caracas"]),
  c("guyana", [], ["georgetown"]),
  c("suriname", [], ["paramaribo"]),
  // Asia
  c("india", [], ["bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "gurgaon", "gurugram", "noida", "hyderabad", "pune", "chennai", "kolkata", "ahmedabad"]),
  c("pakistan", [], ["karachi", "lahore", "islamabad"]),
  c("bangladesh", [], ["dhaka", "chittagong"]),
  c("sri lanka", [], ["colombo"]),
  c("nepal", [], ["kathmandu"]),
  c("bhutan", [], ["thimphu"]),
  c("maldives", [], ["male"]),
  c("afghanistan", [], ["kabul"]),
  c("china", ["prc"], ["shanghai", "beijing", "shenzhen", "guangzhou", "hangzhou", "chengdu"]),
  c("hong kong", ["hk", "hksar"], ["hong kong"]),
  c("macau", ["macao"], ["macau"]),
  c("taiwan", [], ["taipei", "hsinchu", "taichung"]),
  c("japan", [], ["tokyo", "osaka", "kyoto", "fukuoka", "yokohama"]),
  c("south korea", ["korea", "republic of korea"], ["seoul", "busan", "pangyo"]),
  c("mongolia", [], ["ulaanbaatar"]),
  c("singapore", [], ["singapore"]),
  c("malaysia", [], ["kuala lumpur", "penang", "johor bahru", "cyberjaya"]),
  c("indonesia", [], ["jakarta", "bali", "surabaya", "bandung"]),
  c("thailand", [], ["bangkok", "chiang mai", "phuket"]),
  c("vietnam", ["viet nam"], ["ho chi minh city", "hanoi", "da nang"]),
  c("philippines", [], ["manila", "makati", "taguig", "cebu"]),
  c("cambodia", [], ["phnom penh"]),
  c("laos", [], ["vientiane"]),
  c("myanmar", ["burma"], ["yangon"]),
  c("brunei", [], ["bandar seri begawan"]),
  c("timor leste", ["east timor"], ["dili"]),
  c("kazakhstan", [], ["almaty", "astana"]),
  c("uzbekistan", [], ["tashkent"]),
  c("kyrgyzstan", [], ["bishkek"]),
  c("tajikistan", [], ["dushanbe"]),
  c("turkmenistan", [], ["ashgabat"]),
  // Oceania
  c("australia", [], ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"]),
  c("new zealand", ["nz"], ["auckland", "wellington", "christchurch"]),
  c("fiji", [], ["suva"]),
  c("papua new guinea", ["png"], ["port moresby"]),
  c("samoa", [], ["apia"]),
  c("tonga", [], ["nukualofa"]),
  c("vanuatu", [], ["port vila"]),
  c("solomon islands", [], ["honiara"]),
  // Sub-Saharan Africa
  c("nigeria", [], ["lagos", "abuja", "port harcourt"]),
  c("kenya", [], ["nairobi", "mombasa"]),
  c("south africa", [], ["johannesburg", "cape town", "durban", "pretoria"]),
  c("ghana", [], ["accra", "kumasi"]),
  c("ethiopia", [], ["addis ababa"]),
  c("rwanda", [], ["kigali"]),
  c("uganda", [], ["kampala"]),
  c("tanzania", [], ["dar es salaam", "dodoma", "zanzibar"]),
  c("senegal", [], ["dakar"]),
  c("ivory coast", ["cote d'ivoire", "côte d'ivoire"], ["abidjan"]),
  c("cameroon", [], ["douala", "yaounde"]),
  c("zambia", [], ["lusaka"]),
  c("zimbabwe", [], ["harare"]),
  c("botswana", [], ["gaborone"]),
  c("namibia", [], ["windhoek"]),
  c("mozambique", [], ["maputo"]),
  c("angola", [], ["luanda"]),
  c("mauritius", [], ["port louis", "ebene"]),
  c("madagascar", [], ["antananarivo"]),
  c("malawi", [], ["lilongwe", "blantyre"]),
  c("sudan", [], ["khartoum"]),
  c("south sudan", [], ["juba"]),
  c("somalia", [], ["mogadishu"]),
  c("djibouti", [], ["djibouti"]),
  c("eritrea", [], ["asmara"]),
  c("democratic republic of the congo", ["drc", "dr congo"], ["kinshasa", "lubumbashi"]),
  c("republic of the congo", ["congo"], ["brazzaville"]),
  c("gabon", [], ["libreville"]),
  c("equatorial guinea", [], ["malabo"]),
  c("benin", [], ["cotonou"]),
  c("togo", [], ["lome"]),
  c("burkina faso", [], ["ouagadougou"]),
  c("mali", [], ["bamako"]),
  c("niger", [], ["niamey"]),
  c("chad", [], ["ndjamena"]),
  c("central african republic", [], ["bangui"]),
  c("guinea", [], ["conakry"]),
  c("guinea bissau", [], ["bissau"]),
  c("sierra leone", [], ["freetown"]),
  c("liberia", [], ["monrovia"]),
  c("gambia", [], ["banjul"]),
  c("mauritania", [], ["nouakchott"]),
  c("cape verde", ["cabo verde"], ["praia"]),
  c("burundi", [], ["bujumbura"]),
  c("lesotho", [], ["maseru"]),
  c("eswatini", ["swaziland"], ["mbabane"]),
  c("seychelles", [], ["victoria"]),
  c("comoros", [], ["moroni"]),
  c("sao tome and principe", [], ["sao tome"]),
];

/** Words job ads use for remote or multi-country roles. */
export const REGIONS: Region[] = [
  { name: "emea", aliases: [], hint: "Europe, Middle East & Africa" },
  { name: "mena", aliases: ["middle east"], hint: "Middle East & North Africa" },
  { name: "gcc", aliases: ["gulf"], hint: "Gulf states: UAE, Saudi Arabia, Qatar, Bahrain, Kuwait, Oman" },
  { name: "europe", aliases: ["eu", "european union"], hint: "European countries" },
  { name: "dach", aliases: [], hint: "Germany, Austria, Switzerland" },
  { name: "nordics", aliases: ["scandinavia"], hint: "Sweden, Norway, Denmark, Finland, Iceland" },
  { name: "benelux", aliases: [], hint: "Belgium, Netherlands, Luxembourg" },
  { name: "cee", aliases: ["eastern europe"], hint: "Central & Eastern Europe" },
  { name: "africa", aliases: [], hint: "African countries" },
  { name: "apac", aliases: ["asia pacific"], hint: "Asia-Pacific" },
  { name: "asia", aliases: [], hint: "Asian countries" },
  { name: "south asia", aliases: [], hint: "India, Pakistan, Bangladesh, Sri Lanka…" },
  { name: "southeast asia", aliases: [], hint: "Singapore, Malaysia, Indonesia, Vietnam…" },
  { name: "anz", aliases: [], hint: "Australia & New Zealand" },
  { name: "americas", aliases: [], hint: "North, Central & South America" },
  { name: "north america", aliases: [], hint: "USA & Canada" },
  { name: "latam", aliases: ["latin america"], hint: "Latin America" },
  { name: "worldwide", aliases: ["anywhere", "global"], hint: "Any location" },
];

/** Search hit for the location picker. */
export type PlaceHit =
  | { kind: "country"; country: Country }
  | { kind: "city"; city: string; country: Country }
  | { kind: "region"; region: Region };

/** Prefix matches first, then substring; countries before cities before regions on ties. */
export function searchPlaces(query: string, limit = 12): PlaceHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { hit: PlaceHit; score: number }[] = [];
  // Mid-word matches ("uni" in "munich") are noise until the query is long enough to be specific.
  const rank = (s: string) =>
    s === q ? 0 : s.startsWith(q) ? 1 : s.split(/[\s-]/).some((w) => w.startsWith(q)) ? 2 : q.length >= 4 && s.includes(q) ? 3 : -1;
  for (const country of COUNTRIES) {
    const r = Math.min(...[country.name, ...country.aliases].map(rank).map((x) => (x < 0 ? 9 : x)));
    if (r < 9) scored.push({ hit: { kind: "country", country }, score: r * 10 });
    for (const city of country.cities) {
      const rc = rank(city);
      if (rc >= 0) scored.push({ hit: { kind: "city", city, country }, score: rc * 10 + 1 });
    }
  }
  for (const region of REGIONS) {
    const r = Math.min(...[region.name, ...region.aliases].map(rank).map((x) => (x < 0 ? 9 : x)));
    if (r < 9) scored.push({ hit: { kind: "region", region }, score: r * 10 + 2 });
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => a.score - b.score)
    .map((s) => s.hit)
    .filter((h) => {
      const key = h.kind === "city" ? `city:${h.city}` : h.kind === "country" ? `country:${h.country.name}` : `region:${h.region.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** The match terms a country adds: its name, aliases and (optionally) its cities. */
export function countryTerms(country: Country, withCities: boolean): string[] {
  return [...new Set([country.name, ...country.aliases, ...(withCities ? country.cities : [])])];
}

export type PlaceGroup = {
  /** "country:<name>", "region:<name>" or "term:<term>" */
  key: string;
  kind: "country" | "region" | "term";
  /** Country/region name, or the term itself. */
  name: string;
  /** The group's terms that are currently selected, in their original order. */
  terms: string[];
  /** Every term this group can hold (name, aliases, cities), for expanding into toggles. */
  options: string[];
};

let owners: Map<string, { kind: "country" | "region"; name: string; options: string[] }> | undefined;
function ownerOf(term: string) {
  if (!owners) {
    owners = new Map();
    for (const r of REGIONS) {
      const options = [r.name, ...r.aliases];
      for (const t of options) owners.set(t, { kind: "region", name: r.name, options });
    }
    for (const c of COUNTRIES) {
      const options = countryTerms(c, true);
      for (const t of options) if (!owners.has(t)) owners.set(t, { kind: "country", name: c.name, options });
    }
  }
  return owners.get(term);
}

/**
 * Group flat match terms by the country or region they belong to, so the UI can show
 * "United Arab Emirates" as one selection and remove all of its terms together.
 * Terms not in the catalogue stay on their own. Groups keep first-appearance order.
 */
export function groupPlaces(terms: readonly string[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const term of terms) {
    const owner = ownerOf(term);
    const key = owner ? `${owner.kind}:${owner.name}` : `term:${term}`;
    const g = groups.get(key);
    if (g) {
      if (!g.terms.includes(term)) g.terms.push(term);
    } else {
      groups.set(key, owner ? { key, kind: owner.kind, name: owner.name, terms: [term], options: owner.options } : { key, kind: "term", name: term, terms: [term], options: [term] });
    }
  }
  return [...groups.values()];
}
