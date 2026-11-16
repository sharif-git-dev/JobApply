/**
 * A compact dictionary of skills recruiters and ATS filters actually scan for.
 * Each entry is `canonical name: [aliases]`. Matching is case-insensitive and
 * boundary-aware, so "Go" doesn't match "Google" and "C++" / ".NET" work.
 */
const DICTIONARY: Record<string, string[]> = {
  // Languages
  JavaScript: ["javascript", "js", "es6"],
  TypeScript: ["typescript", "ts"],
  Python: ["python"],
  Java: ["java"],
  "C#": ["c#", "csharp"],
  "C++": ["c++", "cpp"],
  Go: ["golang"],
  Rust: ["rust"],
  Ruby: ["ruby"],
  PHP: ["php"],
  Swift: ["swift"],
  Kotlin: ["kotlin"],
  Scala: ["scala"],
  R: [],
  SQL: ["sql"],
  Bash: ["bash", "shell scripting"],
  HTML: ["html", "html5"],
  CSS: ["css", "css3"],
  // Frontend
  React: ["react", "react.js", "reactjs"],
  "Next.js": ["next.js", "nextjs"],
  Vue: ["vue", "vue.js", "vuejs"],
  Angular: ["angular"],
  Svelte: ["svelte"],
  Redux: ["redux"],
  "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
  "React Native": ["react native"],
  Flutter: ["flutter"],
  Webpack: ["webpack"],
  // Backend
  "Node.js": ["node.js", "nodejs", "node"],
  Express: ["express", "express.js"],
  Django: ["django"],
  Flask: ["flask"],
  FastAPI: ["fastapi"],
  "Spring Boot": ["spring boot", "spring"],
  ".NET": [".net", "dotnet", "asp.net"],
  "Ruby on Rails": ["rails", "ruby on rails"],
  Laravel: ["laravel"],
  GraphQL: ["graphql"],
  "REST APIs": ["rest api", "rest apis", "restful", "rest"],
  gRPC: ["grpc"],
  Microservices: ["microservices", "microservice"],
  // Data
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis"],
  Elasticsearch: ["elasticsearch", "elastic search"],
  Kafka: ["kafka"],
  Snowflake: ["snowflake"],
  BigQuery: ["bigquery"],
  Spark: ["spark", "pyspark"],
  Airflow: ["airflow"],
  dbt: ["dbt"],
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  Tableau: ["tableau"],
  "Power BI": ["power bi", "powerbi"],
  Excel: ["excel"],
  Looker: ["looker"],
  ETL: ["etl", "elt"],
  "Data Analysis": ["data analysis", "data analytics"],
  "Data Visualization": ["data visualization"],
  Statistics: ["statistics", "statistical analysis"],
  "A/B Testing": ["a/b testing", "ab testing", "experimentation"],
  // AI / ML
  "Machine Learning": ["machine learning", "ml"],
  "Deep Learning": ["deep learning"],
  NLP: ["nlp", "natural language processing"],
  LLMs: ["llm", "llms", "large language models", "generative ai", "genai"],
  PyTorch: ["pytorch"],
  TensorFlow: ["tensorflow"],
  "scikit-learn": ["scikit-learn", "sklearn"],
  "Computer Vision": ["computer vision"],
  // Cloud / DevOps
  AWS: ["aws", "amazon web services"],
  Azure: ["azure"],
  GCP: ["gcp", "google cloud"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  Terraform: ["terraform"],
  Ansible: ["ansible"],
  "CI/CD": ["ci/cd", "cicd", "continuous integration", "continuous delivery"],
  "GitHub Actions": ["github actions"],
  Jenkins: ["jenkins"],
  Linux: ["linux", "unix"],
  Git: ["git"],
  Observability: ["observability", "monitoring"],
  Datadog: ["datadog"],
  Prometheus: ["prometheus"],
  Grafana: ["grafana"],
  Serverless: ["serverless", "lambda"],
  // Quality / security
  "Unit Testing": ["unit testing", "unit tests", "tdd", "test-driven"],
  Jest: ["jest"],
  Cypress: ["cypress"],
  Playwright: ["playwright"],
  Selenium: ["selenium"],
  "QA Automation": ["qa automation", "test automation"],
  Security: ["security", "appsec", "infosec"],
  OAuth: ["oauth", "oauth2", "sso"],
  Accessibility: ["accessibility", "a11y", "wcag"],
  // Design
  Figma: ["figma"],
  "UX Design": ["ux design", "user experience", "ux"],
  "UI Design": ["ui design", "user interface design"],
  "User Research": ["user research", "usability testing"],
  Prototyping: ["prototyping", "wireframing", "wireframes"],
  "Design Systems": ["design system", "design systems"],
  "Adobe Creative Suite": ["photoshop", "illustrator", "adobe creative suite", "indesign"],
  // Product / project
  "Product Management": ["product management", "product manager"],
  "Product Strategy": ["product strategy", "roadmap", "roadmapping"],
  Agile: ["agile", "scrum", "kanban"],
  Jira: ["jira"],
  "Project Management": ["project management", "program management", "pmp"],
  "Stakeholder Management": ["stakeholder management", "stakeholders"],
  "Cross-functional Collaboration": ["cross-functional", "cross functional"],
  Leadership: ["leadership", "team lead", "led a team", "people management"],
  Mentoring: ["mentoring", "mentorship", "mentored", "coaching"],
  // Business / marketing / sales / ops
  SEO: ["seo", "search engine optimization"],
  SEM: ["sem", "ppc", "paid search"],
  "Content Marketing": ["content marketing", "content strategy"],
  Copywriting: ["copywriting", "copywriter"],
  "Email Marketing": ["email marketing", "lifecycle marketing"],
  "Social Media": ["social media"],
  "Google Analytics": ["google analytics", "ga4"],
  HubSpot: ["hubspot"],
  Salesforce: ["salesforce"],
  CRM: ["crm"],
  "B2B Sales": ["b2b sales", "b2b"],
  "Account Management": ["account management", "account manager"],
  "Customer Success": ["customer success"],
  "Customer Support": ["customer support", "customer service", "help desk"],
  Negotiation: ["negotiation", "negotiating"],
  "Lead Generation": ["lead generation", "prospecting"],
  Forecasting: ["forecasting"],
  Budgeting: ["budgeting", "budget management"],
  "Financial Modeling": ["financial modeling", "financial modelling"],
  Accounting: ["accounting", "gaap", "bookkeeping"],
  QuickBooks: ["quickbooks"],
  SAP: ["sap"],
  Recruiting: ["recruiting", "talent acquisition", "sourcing"],
  "Human Resources": ["human resources", "hris"],
  Operations: ["operations management", "process improvement"],
  "Supply Chain": ["supply chain", "logistics", "procurement"],
  "Technical Writing": ["technical writing", "documentation"],
  "Public Speaking": ["public speaking", "presentations"],
  Communication: ["communication skills", "written communication", "verbal communication"],
  "Problem Solving": ["problem solving", "problem-solving"],
  Spanish: ["spanish"],
  French: ["french"],
  German: ["german"],
  Arabic: ["arabic"],
  Mandarin: ["mandarin", "chinese"],
};

/** Short or ambiguous names must match case-sensitively to avoid noise ("go", "r", "c"). */
const CASE_SENSITIVE = new Set(["R", "Go", "SAP", "SEM", "ETL", "Excel", "Swift", "Spark", "Rust", "Express", "Looker"]);

interface Matcher {
  name: string;
  tests: RegExp[];
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A term may not be glued to letters, digits, or the symbols that change its meaning. */
function anyOf(terms: string[], flags: string) {
  const body = [...new Set(terms)].map(escapeRegex).join("|");
  return new RegExp(`(?<![A-Za-z0-9+#.&])(?:${body})(?![A-Za-z0-9+#&]|\\.[A-Za-z])`, flags);
}

const MATCHERS: Matcher[] = Object.entries(DICTIONARY).map(([name, aliases]) => {
  if (CASE_SENSITIVE.has(name)) {
    // The bare name must appear exactly as written; its longer aliases can be any case.
    return { name, tests: [anyOf([name], ""), ...(aliases.length ? [anyOf(aliases, "i")] : [])] };
  }
  return { name, tests: [anyOf([name, ...aliases], "i")] };
});

/** Canonical skills mentioned in a block of text. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  return MATCHERS.filter((m) => m.tests.some((t) => t.test(text))).map((m) => m.name);
}

const CANONICAL = new Map<string, string>();
for (const [name, aliases] of Object.entries(DICTIONARY)) {
  CANONICAL.set(name.toLowerCase(), name);
  for (const a of aliases) CANONICAL.set(a.toLowerCase(), name);
}

/** Map a free-typed skill onto its canonical name where we know one. */
export function canonicalSkill(skill: string): string {
  return CANONICAL.get(skill.trim().toLowerCase()) ?? skill.trim();
}
