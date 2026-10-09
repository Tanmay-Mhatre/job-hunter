import { INDUSTRIES } from "@rawjobs/core/catalog/industries";

/**
 * The prompt users paste into their own Claude or ChatGPT to merge several resumes into one
 * master resume. RawJobs never sends the resume anywhere; the user runs this themselves.
 * Bump PROMPT_VERSION when the output format changes (parseAiAnswer must still read it).
 */
export const PROMPT_VERSION = 3;

export const MASTER_RESUME_PROMPT = `You are an expert resume writer. I've attached my resumes (and/or pasted them below). I use different versions for different kinds of roles. Merge them into ONE master resume that I can keep as the single source of truth.

Rules:
1. Be truthful. Use only facts that appear in my resumes. Never invent employers, dates, titles, numbers, degrees or skills. If two versions disagree, keep the more specific one and mention the conflict in a short note at the very end of the resume.
2. Keep everything: every role, project, achievement and metric from every version, deduplicated. When the same achievement is worded differently, keep the strongest wording that stays true.
3. Order experience newest first. For each role: title, company, location, dates (Mon YYYY – Mon YYYY), then achievement bullets that start with a verb and include numbers where my resumes have them.
4. Use these Markdown sections, in this order:
   # <Full name>
   (one line: location · email · phone · LinkedIn, only the ones present)
   ## Summary  (4–6 lines covering all my profiles)
   ## Experience
   ## Projects  (only if any)
   ## Skills  (grouped: domain, product/technical, tools, languages)
   ## Education
   ## Certifications  (only if any)
   ## Languages  (only if any)
5. Plain Markdown only: no tables, no images, no columns.

After the resume, add a JSON block for my job search tool. Infer it from the resume. Use lowercase strings, and short terms that would appear in job ads:

\`\`\`json
{
  "rawjobs_profile": {
    "target_titles": ["5-10 job titles I'm qualified for next, e.g. senior product manager"],
    "seniority": ["seniority words that fit me, e.g. senior, lead, head"],
    "exclude_titles": ["titles to avoid, e.g. intern, junior"],
    "locations": ["where I'd work next: my current city and country (add others only if my resumes say I'm open to relocating there)"],
    "open_to_remote": true,
    "remote_regions": ["regions that fit my location, e.g. emea"],
    "keywords": { "domain or skill term": 5 },
    "industries": ["1-4 industry ids from the list below that match my experience and where I want to work next"],
    "past_employers": ["every company I've worked at, newest first, spelled as on my resume"]
  }
}
\`\`\`

For "keywords", list 10-25 domain and skill terms from my experience, weighted 1-5 (5 = my core expertise).
For "industries", use only these ids: ${INDUSTRIES.map((i) => `${i.id} (${i.label})`).join(", ")}. Output the resume and the JSON block only, with no other commentary.`;
