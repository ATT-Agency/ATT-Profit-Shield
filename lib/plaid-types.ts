export type TellerTransaction = {
  id: string;
  date: string;
  name: string;
  amount: number;
  category: string;
  merchantName: string | null;
  pfcPrimary: string | null;
  pfcDetailed: string | null;
};

export type TellerAccount = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  balanceCurrent: number | null;
  balanceAvailable: number | null;
};

export type TellerSyncData = {
  transactions: TellerTransaction[];
  accounts: TellerAccount[];
  institutionName: string | null;
};

export type PlaidTransaction = TellerTransaction;
export type PlaidAccount = TellerAccount;
export type PlaidExchangeData = TellerSyncData;

export type ExpenseCategory =
  | "Zelle & Peer Payments"
  | "Internal Account Sweeps"
  | "Wires & External Transfers"
  | "Corporate Card Settlements"
  | "Merchant Services & Revenue Processing"
  | "Payroll & Benefits"
  | "Contractor & Freelance Platforms"
  | "Corporate Taxes & Compliance"
  | "Bank Fees & Treasury Services"
  | "Materials & COGS"
  | "Software & SaaS"
  | "Cloud Infrastructure & DevOps"
  | "Enterprise SaaS & Workflow"
  | "Creative Tooling & Production"
  | "Marketing Tools & Automation"
  | "Logistics & Freight"
  | "Marketing & Ads"
  | "Facilities, Rent & Utilities"
  | "Consumer Goods & Big-Box Retail"
  | "Travel, Lodging & Flights"
  | "Ground Transit & Rideshare"
  | "Meals, Dining & Team Perks"
  | "Automotive, Fuel & Fleet"
  | "Office Infrastructure & IT"
  | "Insurance & Risk Management"
  | "Legal & Professional Advisory"
  | "Corporate Subscriptions & Gifts"
  | "Other Operational Overhead";

export const NAMED_BUCKETS = [
  "Zelle & Peer Payments",
  "Internal Account Sweeps",
  "Wires & External Transfers",
  "Corporate Card Settlements",
  "Merchant Services & Revenue Processing",
  "Payroll & Benefits",
  "Contractor & Freelance Platforms",
  "Corporate Taxes & Compliance",
  "Bank Fees & Treasury Services",
  "Materials & COGS",
  "Software & SaaS",
  "Cloud Infrastructure & DevOps",
  "Enterprise SaaS & Workflow",
  "Creative Tooling & Production",
  "Marketing Tools & Automation",
  "Logistics & Freight",
  "Marketing & Ads",
  "Facilities, Rent & Utilities",
  "Consumer Goods & Big-Box Retail",
  "Travel, Lodging & Flights",
  "Ground Transit & Rideshare",
  "Meals, Dining & Team Perks",
  "Automotive, Fuel & Fleet",
  "Office Infrastructure & IT",
  "Insurance & Risk Management",
  "Legal & Professional Advisory",
  "Corporate Subscriptions & Gifts",
] as const;

export type NamedBucket = (typeof NAMED_BUCKETS)[number];

export const FALLBACK_BUCKET: ExpenseCategory = "Other Operational Overhead";
export type FallbackBucket = typeof FALLBACK_BUCKET;
export type CorporateBucket = ExpenseCategory;
export type SpendingBucket = ExpenseCategory;

// ── Regex builders ─────────────────────────────────────────────────────────
// Scan text is uppercased before matching, so all patterns target [A-Z]. We
// treat *letters* (not the wider \w class) as the only word characters: a
// digit or punctuation char counts as a boundary. That lets "AWS" match
// "AWS#1234" and "AWS92" yet reject "PAWS", which a literal `\b` cannot do
// because \b treats digits as word chars and so refuses to match between "S"
// and "9". Two builders:
//   tok(s) — letter boundary on both sides (when the relevant edge is a
//            letter). Use for acronyms and full brand names that should not
//            absorb a longer suffix (AWS, SQUARE, EY, CITI).
//   pre(s) — leading letter boundary only. Use for stems whose suffix in
//            real bank text varies, e.g. "DELTA AIR" must match both
//            "DELTA AIR LINES" and "DELTA AIRLINES".

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function escapeRe(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

function tok(s: string): RegExp {
  const t = s.trim();
  const lead = /^[A-Za-z]/.test(t) ? "(?<![A-Z])" : "";
  const trail = /[A-Za-z]$/.test(t) ? "(?![A-Z])" : "";
  return new RegExp(`${lead}${escapeRe(t)}${trail}`);
}

function pre(s: string): RegExp {
  const t = s.trim();
  const lead = /^[A-Za-z]/.test(t) ? "(?<![A-Z])" : "";
  return new RegExp(`${lead}${escapeRe(t)}`);
}

// ── BUCKET_RULES ───────────────────────────────────────────────────────────
// First match wins. Ordering is a hard contract:
//   T1 (1-6):   Bank / payment infrastructure. Distinctive system descriptors.
//   T2 (7-14):  Named SaaS / platform merchants. Must precede broad retail
//               so AWS hits Cloud and not AMAZON in Consumer Goods.
//   T3 (15-22): Operational categories with merchant overlap.
//   T4 (23-26): Catch-all retail / consumer / transit. Evaluated last so all
//               specifics win. Meals precedes Ground Transit so "UBER EATS"
//               hits Meals instead of "UBER" hitting Transit.
type BucketRule = {
  readonly bucket: ExpenseCategory;
  readonly patterns: ReadonlyArray<RegExp>;
};

const BUCKET_RULES: ReadonlyArray<BucketRule> = [
  // ── T1: Bank / payment infrastructure ────────────────────────────────────
  { bucket: "Bank Fees & Treasury Services", patterns: [
    tok("SERVICE CHARGE"), tok("ANNUAL FEE"), tok("ANALYSIS FEE"),
    tok("MAINTENANCE FEE"), tok("OVERDRAFT"), tok("INSUFFICIENT FUNDS"),
    tok("STOP PAYMENT"), tok("BANK OF AMERICA"), tok("WELLS FARGO"),
    tok("JPMORGAN"), tok("CHASE"), tok("CAPITAL ONE"), tok("CITIBANK"),
    tok("CITI"), tok("US BANK"), tok("PNC BANK"), tok("TRUIST"),
    tok("TD BANK"), tok("CHARLES SCHWAB"), tok("FIDELITY"),
    tok("NAVY FEDERAL"), tok("PENFED"), tok("BREX"), tok("RAMP"),
    tok("MERCURY"), tok("NOVO"), tok("RELAY"), tok("RHO"),
    tok("FOREIGN TRANSACTION"), tok("INTEREST EXPENSE"),
  ] },
  { bucket: "Zelle & Peer Payments", patterns: [
    tok("ZELLE"), tok("PEER TO PEER"), tok("VENMO"), tok("CASH APP"),
    tok("PAYPAL *"), tok("PYPL"),
  ] },
  { bucket: "Internal Account Sweeps", patterns: [
    tok("SWEEP"), tok("INTRACO"), tok("INTERNAL TRANSFER"),
    tok("ONLINE TRANSFER"), tok("ZBA"), tok("BOOK TRANSFER"),
    tok("ACCT XFER"),
  ] },
  { bucket: "Wires & External Transfers", patterns: [
    tok("FEDWIRE"), tok("WIRE TRANSFER"), tok("DOMESTIC WIRE"),
    tok("INTL WIRE"), tok("REMITLY"), tok("PAYONEER"),
    tok("WESTERN UNION"), tok("XOOM"), tok("WISE.COM"),
    tok("TRANSFERWISE"), tok("CURRENCYFAIR"),
  ] },
  { bucket: "Corporate Card Settlements", patterns: [
    tok("CORP CARD"), tok("CREDIT CARD PMNT"), tok("AMEX EBILL"),
    tok("CHASE CC"), tok("AMERICAN EXPRESS"), tok("DISCOVER"),
    tok("MASTERCARD"),
  ] },
  { bucket: "Corporate Taxes & Compliance", patterns: [
    tok("IRS"), tok("USATAX"), tok("FRANCHISE TAX"),
    tok("DEPT OF REVENUE"), tok("TAX PAYMT"), tok("ESTIMATED TAX"),
    tok("FINCEN"),
  ] },

  // ── T2: Named SaaS / platform merchants ──────────────────────────────────
  { bucket: "Merchant Services & Revenue Processing", patterns: [
    tok("STRIPE"), tok("SQUARE"), tok("SQ *"), tok("BRAINTREE"),
    tok("AUTHORIZE.NET"), tok("ADYEN"), tok("PADDLE.COM"), tok("GUMROAD"),
    tok("LEMONSQUEEZY"), tok("CLOVER"), tok("TOAST"), tok("SHOPIFY"),
    tok("WOOCOMMERCE"), tok("CHARGEBEE"), tok("RECURLY"),
    tok("GOCARDLESS"), tok("AFFIRM"), tok("KLARNA"), tok("AFTERPAY"),
    tok("SEZZLE"),
  ] },
  { bucket: "Contractor & Freelance Platforms", patterns: [
    tok("UPWORK"), tok("FIVERR"), tok("DEEL"), tok("TOPTAL"),
    tok("GURU.COM"), tok("FREELANCER"), tok("TOPCODER"), tok("GIGSTER"),
    tok("99DESIGNS"),
  ] },
  { bucket: "Payroll & Benefits", patterns: [
    tok("ADP"), tok("GUSTO"), tok("RIPPLING"), tok("TRINET"),
    tok("BAMBOOHR"), tok("WORKDAY"), tok("PAPAYA GLOBAL"), tok("PAYCHEX"),
    tok("PAYLOCITY"), tok("ZENEFITS"), tok("JUSTWORKS"), tok("ONPAY"),
    tok("PAYCOM"), tok("MULTIPLIER"), tok("REMOTE.COM"),
    tok("BLUE CROSS"), tok("BCBS"), tok("AETNA"), tok("CIGNA"),
    tok("HUMANA"), tok("UNITEDHEALTH"), tok("KAISER"), tok("VANGUARD"),
    tok("EMPOWER"), tok("GUIDELINE"),
  ] },
  { bucket: "Cloud Infrastructure & DevOps", patterns: [
    tok("AWS"), tok("AMAZON WEB"), tok("VERCEL"), tok("GITHUB"),
    tok("GOOGLE CLOUD"), tok("GCP"), tok("AZURE"), tok("CLOUDFLARE"),
    tok("DIGITALOCEAN"), tok("LINODE"), tok("RENDER.COM"), tok("NETLIFY"),
    tok("HEROKU"), tok("FLY.IO"), tok("BACKBLAZE"), tok("SUPABASE"),
    tok("SNOWFLAKE"), tok("DATABRICKS"), tok("MONGODB"),
    tok("PLANETSCALE"), tok("COCKROACHDB"), tok("ALGOLIA"),
    tok("PINECONE"), tok("ROUTE53"), tok("GODADDY"), tok("NAMECHEAP"),
    tok("SQUARESPACE"), tok("TWILIO"), tok("SENDGRID"), tok("POSTMARK"),
    tok("MAILGUN"), tok("LOGROCKET"), tok("SENTRY"), tok("DATADOG"),
    tok("NEWRELIC"), tok("PAGERDUTY"), tok("HASHICORP"), tok("OPENAI"),
    tok("ANTHROPIC"), tok("CLAUDE"), tok("HUGGINGFACE"),
    tok("PERPLEXITY"), tok("COHERE"), tok("VULTR"), tok("FASTLY"),
    tok("AKAMAI"), tok("DOCKER"), tok("GITLAB"), tok("BITBUCKET"),
  ] },
  { bucket: "Enterprise SaaS & Workflow", patterns: [
    tok("SLACK"), tok("ZOOM"), tok("LOOM"), tok("INTERCOM"), tok("MIRO"),
    tok("LUCIDCHART"), tok("FIGMA"), tok("NOTION"), tok("LINEAR"),
    tok("ASANA"), tok("MONDAY.COM"), tok("CLICKUP"), tok("JIRA"),
    tok("ATLASSIAN"), tok("AIRTABLE"), tok("RETOOL"), tok("ZAPIER"),
    tok("MAKE.COM"), tok("TYPEFORM"), tok("SALESFORCE"), tok("HUBSPOT"),
    tok("GSUITE"), tok("GOOGLE WORKSPACE"), tok("MICROSOFT 365"),
    tok("OFFICE 365"), tok("DOCUSIGN"), tok("HELLOSIGN"), tok("PANDADOC"),
    tok("RAYCAST"), tok("ZENDESK"), tok("FRESHDESK"), tok("SERVICENOW"),
    tok("DROPBOX"), tok("BOX.COM"), tok("ZOHO"), tok("CALENDLY"),
    tok("GONG"), tok("OUTREACH"),
  ] },
  { bucket: "Creative Tooling & Production", patterns: [
    tok("ADOBE"), tok("CANVA"), tok("ENVATO"), tok("SHUTTERSTOCK"),
    tok("MIDJOURNEY"), tok("SKETCH"), tok("SPLICE"), tok("FRAMER"),
    tok("INVISION"), tok("CORELDRAW"), tok("AUTODESK"),
    tok("GETTY IMAGES"), tok("ISTOCK"),
  ] },
  { bucket: "Marketing Tools & Automation", patterns: [
    tok("MAILCHIMP"), tok("KLAVIYO"), tok("ACTIVECAMPAIGN"),
    tok("SEMRUSH"), tok("AHREFS"), tok("HOOTSUITE"), tok("BUFFER"),
    tok("SPROUT SOCIAL"), tok("JASPER.AI"), tok("COPY.AI"),
    tok("DESCRIPT.COM"), tok("VIMEO"), tok("MARKETO"),
    tok("CONSTANT CONTACT"), tok("BRAZE"), tok("ITERABLE"),
  ] },
  { bucket: "Marketing & Ads", patterns: [
    tok("FACEBK"), tok("META ADS"), tok("GOOGLE ADS"), tok("ADWORDS"),
    tok("LINKEDIN ADS"), tok("TWITTER ADS"), tok("TIKTOK ADS"),
    tok("BING ADS"), tok("PINTEREST ADS"), tok("REDDIT ADS"),
    tok("ADROLL"), tok("TABOOLA"), tok("OUTBRAIN"), tok("YELP ADS"),
    tok("APPLE SEARCH ADS"),
  ] },

  // ── T3: Operational with merchant overlap ────────────────────────────────
  { bucket: "Materials & COGS", patterns: [
    tok("MCMASTER"), tok("GRAINGER"), tok("DIGIKEY"), tok("MOUSER"),
    tok("HOME DEPOT"), tok("LOWE'S"), tok("LOWES"), tok("ACE HARDWARE"),
    tok("HARBOR FREIGHT"), tok("TRUE VALUE"), tok("MENARDS"),
    tok("FERGUSON"), tok("HD SUPPLY"), tok("ULINE"),
    tok("MSC INDUSTRIAL"), tok("ZORO"), tok("FASTENAL"), tok("WURTH"),
    tok("ARROW ELECTRONICS"), tok("AVNET"), tok("TRACTOR SUPPLY"),
    tok("NORTHERN TOOL"), tok("RYERSON"), tok("AIRGAS"),
    tok("SHERWIN-WILLIAMS"), tok("BUILDERS FIRSTSOURCE"), tok("FASTENERS"),
  ] },
  { bucket: "Logistics & Freight", patterns: [
    tok("FEDEX"), tok("UPS"), tok("USPS"), tok("DHL"), tok("FLEXPORT"),
    tok("FREIGHTOS"), tok("SHIPSTATION"), tok("PIRATESHIP"),
    tok("STAMPS.COM"), tok("SHIPPIT"), tok("MOO.COM"),
    tok("XPO LOGISTICS"), tok("C.H. ROBINSON"), tok("JB HUNT"),
    tok("OLD DOMINION"), tok("SCHNEIDER"), tok("RYDER"), tok("MAERSK"),
    tok("EXPEDITORS"),
  ] },
  { bucket: "Insurance & Risk Management", patterns: [
    tok("GEICO"), tok("PROGRESSIVE"), tok("HARTFORD"), tok("STATE FARM"),
    tok("ALLSTATE"), tok("CHUBB"), tok("TRAVELERS"),
    tok("LIBERTY MUTUAL"), tok("NATIONWIDE"), tok("FARMERS"),
    tok("HISCOX"), tok("NEXT INSURANCE"), tok("SURE"), tok("POLICYGENIUS"),
  ] },
  { bucket: "Legal & Professional Advisory", patterns: [
    tok("LEGALZOOM"), tok("ROCKET LAWYER"), tok("CLERKY"),
    tok("STRIPE ATLAS"), tok("EY"), tok("KPMG"), tok("DELOITTE"),
    tok("PWC"), tok("BDO"), tok("BAKER TILLY"), tok("GRANT THORNTON"),
    tok("COOLEY"), tok("FENWICK"),
  ] },
  { bucket: "Travel, Lodging & Flights", patterns: [
    pre("DELTA AIR"), pre("UNITED AIR"), pre("AMERICAN AIR"),
    pre("SOUTHWEST AIR"), tok("JETBLUE"), tok("MARRIOTT"), tok("HILTON"),
    tok("AIRBNB"), tok("EXPEDIA"), pre("ALASKA AIR"), pre("SPIRIT AIR"),
    pre("FRONTIER AIR"), tok("AIR CANADA"), tok("HYATT"), tok("WYNDHAM"),
    tok("IHG"), tok("BOOKING.COM"), tok("PRICELINE"), tok("KAYAK"),
    tok("VRBO"),
  ] },
  { bucket: "Automotive, Fuel & Fleet", patterns: [
    tok("SHELL OIL"), tok("EXXON"), tok("CHEVRON"), tok("7-ELEVEN"),
    tok("AUTOZONE"), tok("BP"), tok("SPEEDWAY"), tok("PILOT TRAVEL"),
    pre("TESLA SUPER"), tok("SUPERCHARGER"), tok("CHARGEPOINT"),
    tok("EVGO"), tok("HERTZ"), tok("AVIS"), tok("ENTERPRISE RENT"),
    tok("BUDGET-CAR"), tok("VALVOLINE"), tok("SUNOCO"),
    tok("PHILLIPS 66"), tok("WEX"), tok("FLEETCOR"), tok("U-HAUL"),
    tok("PENSKE"), tok("JIFFY LUBE"), tok("O'REILLY AUTO"), tok("PEP BOYS"),
  ] },
  { bucket: "Office Infrastructure & IT", patterns: [
    tok("APPLE STORE"), tok("DELL"), tok("CDW"), tok("STAPLES"),
    tok("OFFICE DEPOT"), tok("OFFICEMAX"), tok("SHRED-IT"),
    tok("SAMS CLUB"), tok("SAM'S CLUB"), tok("LENOVO"),
    tok("HEWLETT PACKARD"), tok("B&H PHOTO"), tok("MICRO CENTER"),
    tok("IKEA"),
  ] },
  { bucket: "Facilities, Rent & Utilities", patterns: [
    tok("WEWORK"), tok("REGUS"), tok("SPACES"), tok("COMCAST"),
    tok("XFINITY"), tok("CHARTER COMM"), tok("SPECTRUM"), tok("COX COMM"),
    tok("ATT BUSI"), tok("AT&T"), tok("VERIZON"), tok("CONED"),
    tok("CON EDISON"), tok("PG&E"), tok("NATIONAL GRID"),
    tok("DUKE ENERGY"), tok("SOUTHERN CO"), tok("WASTE MGMT"),
    tok("REPUBLIC SERV"), tok("T-MOBILE"), tok("SPRINT"),
    tok("CENTURYLINK"),
  ] },

  // ── T4: Catch-all retail / consumer / transit ────────────────────────────
  { bucket: "Consumer Goods & Big-Box Retail", patterns: [
    tok("AMZN MKTP"), tok("AMZN"), tok("AMAZON"), tok("WAL-MART"),
    tok("WALMART"), tok("TARGET"), tok("COSTCO"), tok("BEST BUY"),
    tok("EBAY"), tok("BJ'S"), tok("KROGER"), tok("PUBLIX"),
    tok("SAFEWAY"), tok("ALBERTSONS"), tok("MEIJER"), tok("ALDI"),
    tok("HEB"), tok("WEGMANS"), tok("MACY'S"), tok("KOHL'S"),
  ] },
  { bucket: "Corporate Subscriptions & Gifts", patterns: [
    tok("LINKEDIN PREMIUM"), tok("HBR"), tok("WALL STREET JOURNAL"),
    tok("NEW YORK TIMES"), tok("NYTIMES"), tok("BLOOMBERG"),
    tok("STATISTA"), tok("STICKERMULE"), tok("PRINTFUL"),
    tok("VISTAPRINT"), tok("PATREON"), tok("SUBSTACK"), tok("MEDIUM"),
    tok("CUSTOM INK"),
  ] },
  { bucket: "Meals, Dining & Team Perks", patterns: [
    tok("STARBUCKS"), tok("SBUX"), tok("DUNKIN"), tok("TIM HORTONS"),
    tok("DUTCH BROS"), tok("PEETS"), tok("CARIBOU"), tok("DOORDASH"),
    tok("UBER EATS"), tok("UBEREATS"), tok("GRUBHUB"), tok("SEAMLESS"),
    tok("INSTACART"), tok("SHIPT"), tok("SWEETGREEN"), tok("CHIPOTLE"),
    tok("PANERA"), tok("AU BON PAIN"), tok("EINSTEIN BROS"),
    tok("WHOLEFOODS"), tok("TRADER JOE"), tok("TST*"), tok("MCDONALDS"),
    tok("BURGER KING"), tok("WENDYS"), tok("TACO BELL"),
    tok("CHICK-FIL-A"), tok("SUBWAY"), tok("DOMINOS"), tok("PIZZA HUT"),
    tok("PAPA JOHNS"), tok("KFC"), tok("SONIC"), tok("DAIRY QUEEN"),
    tok("ARBY'S"), tok("IN-N-OUT"), tok("SHAKE SHACK"), tok("FIVE GUYS"),
    tok("POPEYES"), tok("PANDA EXPRESS"), tok("WINGSTOP"),
    tok("LITTLE CAESARS"), tok("JIMMY JOHNS"), tok("JERSEY MIKES"),
    tok("FIREHOUSE SUBS"), tok("CAVA"),
  ] },
  { bucket: "Ground Transit & Rideshare", patterns: [
    tok("UBER"), tok("LYFT"), tok("MTA"), tok("NYC TRANSIT"),
    tok("METRA"), tok("AMTRAK"), tok("SPOTHERO"), tok("PARKMOBILE"),
    tok("PASSPORT PARKING"), tok("PAYBYPHONE"), tok("E-ZPASS"),
    tok("EZPASS"), tok("E-Z PASS"), tok("SUNPASS"), tok("FASTRAK"),
    tok("BART"), tok("WMATA"), tok("NJ TRANSIT"), tok("SEPTA"),
    tok("MBTA"), tok("DART"),
  ] },
];

export function parseTransactionAmount(
  amount: string | number | null | undefined
): number {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === "number") return Number.isFinite(amount) ? amount : 0;
  const cleaned = amount.replace(/[^0-9eE+\-.]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export type ClassifiableTxn = {
  name: string;
  category: string;
  merchantName?: string | null;
  pfcPrimary?: string | null;
  pfcDetailed?: string | null;
};

// Concatenate the supplied fields into one uppercase, single-spaced scan
// line. Empty/nullish fields drop out. Returns "" when nothing survives.
function joinFields(...fields: ReadonlyArray<string | null | undefined>): string {
  let out = "";
  for (const f of fields) {
    if (f === null || f === undefined) continue;
    const s = f.toString().toUpperCase().trim();
    if (s.length === 0) continue;
    if (out.length > 0) out += " ";
    out += s;
  }
  return out.replace(/\s+/g, " ");
}

function scanRules(text: string): ExpenseCategory | null {
  if (text.length === 0) return null;
  for (const { bucket, patterns } of BUCKET_RULES) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return bucket;
    }
  }
  return null;
}

export function classifyBucket(t: ClassifiableTxn): ExpenseCategory {
  // Pass 1 — merchant fields only. `merchantName` and the bank's free-text
  // `name` are the authoritative source of who got paid. We never let
  // Teller's coarse `category` taxonomy bleed into this pass; a generic
  // tag like "Hardware Store" must not steal a transaction whose merchant
  // belongs in a more specific bucket.
  const merchantHit = scanRules(joinFields(t.merchantName, t.name));
  if (merchantHit) return merchantHit;

  // Pass 2 — only if the merchant pass found nothing, fall back to the
  // Teller / Plaid category fields. Useful for transactions with no
  // recognisable merchant string but a known category code.
  const categoryHit = scanRules(joinFields(t.category, t.pfcDetailed, t.pfcPrimary));
  if (categoryHit) return categoryHit;

  return FALLBACK_BUCKET;
}

export function isNamedBucket(b: string): b is NamedBucket {
  return (NAMED_BUCKETS as readonly string[]).includes(b);
}

export function normalizeTransaction(
  t: ClassifiableTxn & { amount: string | number | null | undefined }
): { amount: number; bucket: ExpenseCategory } {
  return {
    amount: parseTransactionAmount(t.amount),
    bucket: classifyBucket(t),
  };
}
