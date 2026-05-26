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

// BUCKET_RULES — first match wins. Ordering is therefore a hard contract,
// not a stylistic choice. Tier order (top to bottom):
//   T1 (1-6):   Bank / payment infrastructure. Distinctive system descriptors.
//   T2 (7-14):  Named SaaS / platform merchants. Must precede broad retail
//               so AWS hits Cloud and not AMAZON in Consumer Goods.
//   T3 (15-22): Operational categories with merchant overlap.
//   T4 (23-26): Catch-all retail / consumer / transit. Evaluated last so all
//               specifics win. Meals precedes Ground Transit so "UBER EATS"
//               hits Meals instead of "UBER" hitting Transit.
const BUCKET_RULES: ReadonlyArray<readonly [ExpenseCategory, readonly string[]]> = [
  // ───────────────────────── T1: Bank / payment infrastructure ─────────────────────────
  ["Bank Fees & Treasury Services", [
    "SERVICE CHG", "ANNUAL FEE", "ANALYSIS FEE", "RECURRING FEE", "CARD FEE", "WIRE FEE",
    "WIRE CHG", "MAINTENANCE FEE", "OVERDRAFT", "STOP PAYMENT", "STOP PMNT", "INSUFFICIENT",
    "NSF", "INTEREST EXP", "FINANCE CHG", "RET RETURNED", "FEE", "CHG", "MISC", "SVC",
    "CHASE", "JPMORGAN", "BOFA", "BANK OF AMERICA", "WELLS FARGO", "CITI", "CAPITAL ONE",
    "US BANK", "PNC", "TRUIST", "TD BANK", "CHARLES SCHWAB", "FIDELITY", "NAVY FEDERAL",
    "PENFED", "CREDIT UNION", "FCU", "BREX", "RAMP", "MERCURY", "NOVO", "RELAY", "RHO"
  ]],
  ["Zelle & Peer Payments", [
    "ZELLE", "P2P", "PEER TO PEER", "VENMO", "CASH APP", "PAYPAL *", "PYPL"
  ]],
  ["Internal Account Sweeps", [
    "SWEEP", "INTRACO", "INTERNAL TRANSFER", "ONLINE TRANSFER TO", "ZBA", "BOOK TRANSFER",
    "LIQUIDITY MGMT", "ACCT XFER"
  ]],
  ["Wires & External Transfers", [
    "FEDWIRE", "WIRE TRANS", "DOMESTIC WIRE", "INTL WIRE", "FX TRANS", "ACH BAL",
    "OUTWARD TRANSFER", "CHIPS", "MERCURY WIRE", "BREX WIRE", "REVOLUT", "WISE.COM",
    "TRANSFERWISE", "REMITLY", "PAYONEER", "WESTERN UNION", "XOOM", "CURRENCYFAIR"
  ]],
  ["Corporate Card Settlements", [
    "CORP CARD", "CREDIT CARD PMNT", "AUTOPAY", "CARDMEMBER SERV", "CC PAYMENT",
    "AMEX EBILL", "CHASE CC", "AMERICAN EXPRESS", "DISCOVER", "MASTERCARD", "VISA"
  ]],
  ["Corporate Taxes & Compliance", [
    "IRS", "USATAX", "STATE TAX", "FRANCHISE", "TAX REVENUE", "ESTIMATED TAX",
    "EFTPS", "LEGAL FILING", "FINCEN", "DEPT OF REVENUE", "TAX PAYMT"
  ]],

  // ───────────────────────── T2: Named SaaS / platform merchants ─────────────────────────
  ["Merchant Services & Revenue Processing", [
    "STRIPE", "SQUARE", "SQ *", "SP *", "BRAINTREE", "AUTHORIZE.NET", "ADYEN",
    "PADDLE.COM", "GUMROAD", "LEMONSQUEEZY", "CLOVER", "TOAST", "SHOPIFY",
    "WOOCOMMERCE", "CHARGEBEE", "RECURLY", "GOCARDLESS", "MERCHANT FEES",
    "DISCOUNT RATE", "CHARGEBACK", "POS RET", "AFFIRM", "KLARNA", "AFTERPAY"
  ]],
  ["Contractor & Freelance Platforms", [
    "UPWORK", "FIVERR", "DEEL", "TOPTAL", "GURU.COM", "FREELANCER", "OUTSOURCE",
    "TOPCODER", "GIGSTER", "99DESIGNS", "DESIGNROW"
  ]],
  ["Payroll & Benefits", [
    "ADP", "GUSTO", "RIPPLING", "TRINET", "BAMBOOHR", "WORKDAY", "PAPAYA GLOBAL",
    "PAYCHEX", "PAYLOCITY", "ZENEFITS", "NAVIA", "JUSTWORKS", "ONPAY", "PAYCOM",
    "MULTIPLIER", "REMOTE.COM", "PAYROLL", "DIR DEP", "SALARY", "WAGE", "HEALTH INS",
    "BENEFITS", "BCBS", "BLUE CROSS", "AETNA", "CIGNA", "HUMANA", "UNITEDHEALTH",
    "KAISER", "401K", "VANGUARD", "EMPOWER", "GUIDELINE"
  ]],
  ["Cloud Infrastructure & DevOps", [
    "AWS", "AMAZON WEB", "VERCEL", "GITHUB", "GOOGLE CLOUD", "GCP", "AZURE",
    "CLOUDFLARE", "DIGITALOCEAN", "LINODE", "RENDER.COM", "NETLIFY", "HEROKU",
    "FLY.IO", "BACKBLAZE", "SUPABASE", "SNOWFLAKE", "DATABRICKS", "MONGODB",
    "PLANETSCALE", "COCKROACHDB", "ALGOLIA", "PINECONE", "ROUTE53", "GODADDY",
    "NAMECHEAP", "NAME.COM", "SQUARESPACE", "TWILIO", "SENDGRID", "POSTMARK",
    "MAILGUN", "APPSMITH", "LOGROCKET", "SENTRY", "DATADOG", "NEWRELIC",
    "PAGERDUTY", "HASHICORP", "OPENAI", "ANTHROPIC", "CLAUDE", "HUGGINGFACE",
    "PERPLEXITY", "COHERE", "VULTR", "ORACLE CLOUD", "IBM CLOUD", "FASTLY",
    "AKAMAI", "DOCKER", "KUBERNETES", "GITLAB", "BITBUCKET"
  ]],
  ["Enterprise SaaS & Workflow", [
    "SLACK", "ZOOM", "LOOM", "INTERCOM", "MIRO", "LUCIDCHART", "FIGMA", "NOTION",
    "LINEAR", "ASANA", "MONDAY.COM", "CLICKUP", "JIRA", "ATLASSIAN", "AIRTABLE",
    "RETOOL", "ZAPIER", "MAKE.COM", "TYPEFORM", "SALESFORCE", "HUBSPOT",
    "GSUITE", "GOOGLE WORK", "MICROSOFT 365", "M365", "OFFICE 365", "DOCUSIGN",
    "HELLOSIGN", "PANDADOC", "RAYCAST", "ZENDESK", "FRESHDESK", "SERVICENOW",
    "DROPBOX", "BOX", "ZOHO", "CALENDLY", "GONG", "OUTREACH", "SOFTWARE",
    "SUBSCRIPTION", "PLATFORM", "DIGITAL", "TECH", "CLOUD", "APP", "SAAS"
  ]],
  ["Creative Tooling & Production", [
    "ADOBE", "CANVA", "ENVATO", "SHUTTERSTOCK", "MIDJOURNEY", "SKETCH", "SPLICE",
    "FRAMER", "INVISION", "CORELDRAW", "AUTODESK", "GETTY IMAGES", "ISTOCK"
  ]],
  ["Marketing Tools & Automation", [
    "MAILCHIMP", "KLAVIYO", "ACTIVECAMPAIGN", "SEMRUSH", "AHREFS", "HOOTSUITE",
    "BUFFER", "SPROUT SOCIAL", "JASPER.AI", "COPY.AI", "DESCRIPT.COM", "VIMEO",
    "MARKETO", "MUNCHKIN", "CONSTANT CONTACT", "BRAZE", "ITERABLE", "APPLOVIN"
  ]],
  ["Marketing & Ads", [
    "FACEBK", "META ADS", "GOOGLE ADS", "ADWORDS", "LINKEDIN ADS", "TWITTER ADS",
    "TIKTOK ADS", "BING ADS", "PINTEREST ADS", "REDDIT ADS", "ADROLL", "TABOOLA",
    "OUTBRAIN", "MARKETING PROMO", "YELP ADS", "APPLE SEARCH ADS"
  ]],

  // ───────────────────────── T3: Operational with merchant overlap ─────────────────────────
  ["Materials & COGS", [
    "MCMASTER", "GRAINGER", "SUPPLY", "INVENTORY", "DISTRIBUTION", "RAW MAT",
    "METALS", "DIGIKEY", "MOUSER", "HARDWARE", "WAREHOUSE", "WHOLESALE",
    "BUILDING MAT", "BUILDERS", "CONSTRUCTION", "COMPONENT", "PLUMBING SUPPLY",
    "INDUSTRIAL SUPPLY", "JOBSITE", "TRADE SUPPLY", "LUMBER", "TIMBER", "STEEL",
    "STAINLESS", "ALUMINUM", "COPPER", "PVC", "PIPE", "FITTING", "FASTENER",
    "ADHESIVE", "EPOXY", "HOME DEPOT", "LOWE'S", "LOWES", "ACE HARDWARE",
    "HARBOR FREIGHT", "TRUE VALUE", "MENARDS", "FERGUSON", "HD SUPPLY", "ULINE",
    "MSC INDUSTRIAL", "ZORO", "FASTENAL", "WURTH", "ARROW ELEC", "AVNET",
    "NEWARK ELEC", "ALLIED ELEC", "TRACTOR SUPPLY", "NORTHERN TOOL", "RYERSON",
    "AIRGAS", "SHERWIN-WILLIAMS"
  ]],
  ["Logistics & Freight", [
    "FEDEX", "UPS ", "USPS", "POSTAL", "DHL", "FREIGHT", "SHIPPING", "CARRIER",
    "FLEXPORT", "FREIGHTOS", "SHIPSTATION", "PIRATESHIP", "STAMPS.COM", "SHIPPIT",
    "MOO.COM", "XPO", "C.H. ROBINSON", "JB HUNT", "OLD DOMINION", "SCHNEIDER",
    "RYDER", "MAERSK", "EXPEDITORS"
  ]],
  ["Insurance & Risk Management", [
    "INSURANCE", "GEICO", "PROGRESSIVE", "HARTFORD", "STATE FARM", "ALLSTATE",
    "MUTUAL", "CHUBB", "TRAVELERS", "LIBERTY MUTUAL", "NATIONWIDE", "FARMERS",
    "HISCOX", "NEXT INSURANCE", "SURE"
  ]],
  ["Legal & Professional Advisory", [
    "LEGAL", "ATTORNEY", "COUNSEL", "CPA", "ACCOUNTING", "CONSULTING", "ADVISORY",
    "LAW FIRM", "EY ", "KPMG", "DELOITTE", "PWC", "LEGALZOOM", "ROCKET LAWYER",
    "CLERKY", "STRIPE ATLAS"
  ]],
  ["Travel, Lodging & Flights", [
    "DELTA", "UNITED AIR", "AMERICAN AIR", "SOUTHWEST", "JETBLUE", "MARRIOTT",
    "HILTON", "AIRBNB", "EXPEDIA", "CAR RENTAL", "HOTEL", "ALASKA AIR", "SPIRIT",
    "FRONTIER", "AIR CANADA", "HYATT", "WYNDHAM", "IHG", "BOOKING.COM",
    "PRICELINE", "KAYAK", "VRBO", "MOTEL", "INN "
  ]],
  ["Automotive, Fuel & Fleet", [
    "SHELL", "EXXON", "CHEVRON", "7-ELEVEN", "AUTOZONE", "BP ", "SPEEDWAY",
    "PILOT TRAVEL", "TESLA SUPER", "SUPERCHARGER", "CHARGEPOINT", "EVGO",
    "HERTZ", "AVIS", "ENTERPRISE RENT", "BUDGET-CAR", "VALVOLINE", "SUNOCO",
    "PHILLIPS 66", "WEX", "FLEETCOR", "U-HAUL", "PENSKE", "JIFFY LUBE", "O'REILLY",
    "PEP BOYS", "CAR WASH", "PARTS", "TIRE"
  ]],
  ["Office Infrastructure & IT", [
    "APPLE", "DELL", "CDW", "STAPLES", "OFFICE DEPOT", "OFFICEMAX", "PAPER",
    "PRINTER", "INK", "DESK", "SHRED-IT", "SAMS CLUB", "SAM'S CLUB", "LENOVO",
    "HP ", "HEWLETT PACKARD", "B&H", "MICRO CENTER", "IKEA", "FURNITURE"
  ]],
  ["Facilities, Rent & Utilities", [
    "REALTY", "PROP MGMT", "LANDLORD", "RENTAL", "WEWORK", "REGUS", "SPACES",
    "COMCAST", "XFINITY", "CHARTER", "SPECTRUM", "COX COMM", "ATT BUSI", "AT&T",
    "VERIZON", "CONED", "CON EDISON", "PG&E", "NATIONAL GRID", "DUKE ENERGY",
    "SOUTHERN CO", "POWER", "UTILITIES", "ELECTRIC", "WASTE MGMT", "REPUBLIC SERV",
    "T-MOBILE", "SPRINT", "CENTURYLINK", "WATER", "SEWER", "TRASH", "GAS "
  ]],

  // ───────────────────────── T4: Catch-all retail / consumer / transit ─────────────────────────
  ["Consumer Goods & Big-Box Retail", [
    "AMZN MKTP", "AMZN", "AMAZON", "WAL-MART", "WALMART", "TARGET", "COSTCO",
    "BEST BUY", "EBAY", "BJ'S", "KROGER", "PUBLIX", "SAFEWAY", "ALBERTSONS",
    "MEIJER", "ALDI", "HEB", "WEGMANS", "MACY", "KOHL", "STORE", "MART", "SHOP"
  ]],
  ["Corporate Subscriptions & Gifts", [
    "LINKEDIN PREMIUM", "HBR", "WSJ", "NEW YORK TIMES", "NYTIMES", "BLOOMBERG",
    "STATISTA", "CORPORATE GIFTS", "STICKERMULE", "PRINTFUL", "VISTAPRINT",
    "PATREON", "SUBSTACK", "MEDIUM"
  ]],
  ["Meals, Dining & Team Perks", [
    "STARBUCKS", "SBUX", "DUNKIN", "TIM HORTONS", "DUTCH BROS", "PEETS",
    "CARIBOU", "DOORDASH", "UBER EATS", "UBEREATS", "GRUBHUB", "SEAMLESS",
    "INSTACART", "SHIPT", "SWEETGREEN", "CHIPOTLE", "PANERA", "AU BON PAIN",
    "EINSTEIN BROS", "WHOLEFOODS", "TRADER JOE", "TST*", "RESTAURANT",
    "RESTURANT", "REST.", "EATERY", "CAFE", "BAKERY", "CATERING", "BAR ",
    "GRILL", "PUB ", "BREWERY", "STEAKHOUSE", "DONUT", "DELI", "DINER",
    "PIZZERIA", "SUSHI", "FOOD", "MARKET", "GROCER", "MCDONALDS", "BURGER KING",
    "WENDYS", "TACO BELL", "CHICK-FIL-A", "SUBWAY", "DOMINOS", "PIZZA HUT",
    "PAPA JOHNS"
  ]],
  ["Ground Transit & Rideshare", [
    "UBER", "LYFT", "TAXI", "CAB ", "MTA", "NYC TRANSIT", "METRA", "AMTRAK",
    "SPOTHERO", "PARKMOBILE", "PASSPORT PARKING", "PAYBYPHONE", "PARKING",
    "TOLL", "TOLLWAY", "E-ZPASS", "EZPASS", "E-Z PASS", "SUNPASS", "FASTRAK",
    "BART", "WMATA", "NJ TRANSIT", "SEPTA", "MBTA", "DART"
  ]],
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

function buildScanText(t: ClassifiableTxn): { raw: string; loose: string } {
  const parts = [t.merchantName, t.name, t.category, t.pfcDetailed, t.pfcPrimary]
    .map((s) => (s ?? "").toString())
    .filter((s) => s.length > 0);
  const raw = parts.join(" ").toUpperCase().replace(/\s+/g, " ").trim();
  // Loose pass strips digits and non-essential punctuation so noisy bank
  // strings ("REST 1234#NYC*72") still hit clean alpha tokens like "REST."
  // or "EATERY". Apostrophes are preserved for tokens like "LOWE'S".
  const loose = raw
    .replace(/[^A-Z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { raw, loose };
}

export function classifyBucket(t: ClassifiableTxn): ExpenseCategory {
  const { raw, loose } = buildScanText(t);
  if (!raw) return FALLBACK_BUCKET;

  for (const [bucket, tokens] of BUCKET_RULES) {
    for (const token of tokens) {
      if (raw.includes(token)) return bucket;
      if (loose.includes(token)) return bucket;
    }
  }
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
