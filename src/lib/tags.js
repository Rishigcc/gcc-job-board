export const TAG_OPTIONS = [
  "Bengaluru",
  "Hyderabad",
  "Delhi NCR",
  "Mumbai",
  "Pune",
  "Chennai",
  "Salary & Hikes",
  "Promotions",
  "Interview Tips",
  "Onboarding",
  "Job Search",
  "Work Culture",
  "Career Growth",
  "Layoffs",
  "Remote Work",
  "AI & Automation",
];

const TAG_KEYWORDS = {
  Bengaluru: ["bengaluru", "bangalore"],
  Hyderabad: ["hyderabad", "secunderabad"],
  "Delhi NCR": [
    "delhi",
    "noida",
    "gurgaon",
    "gurugram",
    "faridabad",
    "ghaziabad",
  ],
  Mumbai: ["mumbai"],
  Pune: ["pune"],
  Chennai: ["chennai"],
  "Salary & Hikes": [
    "salary",
    "hike",
    "ctc",
    "compensation",
    "increment",
    "pay hike",
  ],
  Promotions: ["promotion", "promoted", "band change", "level up"],
  "Interview Tips": [
    "interview",
    "hiring process",
    "rounds",
    "offer letter",
    "resume",
  ],
  Onboarding: [
    "onboarding",
    "joined",
    "first week",
    "new joinee",
    "notice period",
  ],
  "Job Search": [
    "switch",
    "switching",
    "job search",
    "looking for",
    "should i move",
    "should i switch",
  ],
  "Work Culture": [
    "work culture",
    "wlb",
    "work life balance",
    "toxic",
    "manager",
    "team culture",
  ],
  "Career Growth": ["career growth", "career", "growth", "skills", "upskill"],
  Layoffs: ["layoff", "layoffs", "rif", "downsizing", "job security"],
  "Remote Work": ["remote", "wfh", "work from home", "hybrid"],
  "AI & Automation": [
    "ai",
    "genai",
    "gen ai",
    "automation",
    "copilot",
    "artificial intelligence",
  ],
};

export function suggestTags(text, maxTags = 4) {
  const normalized = (text || "").toLowerCase();

  const scored = TAG_OPTIONS.map((tag) => {
    const keywords = TAG_KEYWORDS[tag] || [];

    const score = keywords.reduce(
      (count, keyword) => count + (normalized.includes(keyword) ? 1 : 0),
      0
    );

    return { tag, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTags)
    .map((entry) => entry.tag);
}
