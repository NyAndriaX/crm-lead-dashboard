export const DEMO_SOURCE = "Démo CRM";

export const TEAM_NAME = "Équipe commerciale Île-de-France";

export const USER_FIXTURES = [
  { email: "admin@crm.local", name: "Administrateur", role: "ADMIN" },
  { email: "manager@crm.local", name: "Sophie Martin", role: "MANAGER" },
  { email: "lucas.bernard@crm.local", name: "Lucas Bernard", role: "COMMERCIAL" },
  { email: "emma.dupont@crm.local", name: "Emma Dupont", role: "COMMERCIAL" },
  { email: "lecteur@crm.local", name: "Observateur CRM", role: "LECTEUR" },
];

export const TAG_FIXTURES = [
  { name: "SaaS", color: "#1677ff" },
  { name: "Retail", color: "#722ed1" },
  { name: "Prioritaire", color: "#fa541c" },
  { name: "Salon Paris 2026", color: "#13c2c2" },
  { name: "Webinar", color: "#52c41a" },
  { name: "VIP", color: "#eb2f96" },
  { name: "Relance chaude", color: "#faad14" },
];

export const PIPELINE_STAGES = [
  { name: "Nouveau", color: "#8c8c8c" },
  { name: "Contacté", color: "#1677ff" },
  { name: "Qualifié", color: "#13c2c2" },
  { name: "Proposition", color: "#722ed1" },
  { name: "Négociation", color: "#fa8c16" },
  { name: "Gagné", color: "#52c41a" },
  { name: "Perdu", color: "#ff4d4f" },
];

export const LEAD_VIEW_FIXTURES = [
  {
    ownerEmail: "manager@crm.local",
    name: "Pipeline qualifié",
    shared: true,
    filters: { status: "QUALIFIE", scoreMin: 40 },
    columns: ["company", "status", "score", "assignedToId", "lastActionAt"],
  },
  {
    ownerEmail: "lucas.bernard@crm.local",
    name: "Mes leads actifs",
    shared: false,
    filters: { assignedToId: "__SELF__", scoreMin: 30 },
    columns: ["name", "company", "status", "score", "source"],
  },
  {
    ownerEmail: "emma.dupont@crm.local",
    name: "À relancer cette semaine",
    shared: false,
    filters: { status: "CONTACTE", source: "Salon Paris 2026" },
    columns: ["company", "email", "status", "lastActionAt"],
  },
];

export const IMPORT_JOB_FIXTURES = [
  {
    ownerEmail: "manager@crm.local",
    fileName: "salon_paris_2026_prospects.xlsx",
    totalRows: 128,
    importedRows: 118,
    duplicateRows: 7,
    errorRows: 3,
    status: "done",
    daysAgo: 12,
    mapping: {
      email: "Email",
      firstName: "Prénom",
      lastName: "Nom",
      company: "Société",
      city: "Ville",
      source: "Source",
    },
  },
  {
    ownerEmail: "admin@crm.local",
    fileName: "webinar_croissance_b2b.csv",
    totalRows: 64,
    importedRows: 61,
    duplicateRows: 2,
    errorRows: 1,
    status: "done",
    daysAgo: 4,
    mapping: {
      email: "email",
      company: "company",
      sector: "sector",
      source: "source",
    },
  },
  {
    ownerEmail: "lucas.bernard@crm.local",
    fileName: "linkedin_export_q2.csv",
    totalRows: 87,
    importedRows: 82,
    duplicateRows: 4,
    errorRows: 1,
    status: "done",
    daysAgo: 2,
    mapping: { email: "email", firstName: "first_name", lastName: "last_name", company: "company" },
  },
  {
    ownerEmail: "emma.dupont@crm.local",
    fileName: "partenaires_q2_2026.xlsx",
    totalRows: 42,
    importedRows: 0,
    duplicateRows: 0,
    errorRows: 0,
    status: "running",
    daysAgo: 0,
    mapping: { email: "Email", company: "Société", source: "Source" },
  },
  {
    ownerEmail: "manager@crm.local",
    fileName: "ancien_export_corrompu.csv",
    totalRows: 0,
    importedRows: 0,
    duplicateRows: 0,
    errorRows: 0,
    status: "failed",
    daysAgo: 6,
    mapping: { email: "email" },
  },
  {
    ownerEmail: "admin@crm.local",
    fileName: "evenement_tech_lyon.xlsx",
    totalRows: 56,
    importedRows: 53,
    duplicateRows: 2,
    errorRows: 1,
    status: "done",
    daysAgo: 19,
    mapping: { email: "Email", firstName: "Prénom", lastName: "Nom", company: "Entreprise" },
  },
];

// ── Audit logs (CRM-073) ──────────────────────────────────────────────────────
// Génère un journal d'activité réaliste : connexions, actions sur leads, imports.
export const AUDIT_LOG_FIXTURES = [
  { actorEmail: "admin@crm.local",          action: "auth.login",          daysAgo: 0,  ip: "192.168.1.10" },
  { actorEmail: "admin@crm.local",          action: "user.create",         daysAgo: 14, ip: "192.168.1.10" },
  { actorEmail: "admin@crm.local",          action: "scoring.update",      daysAgo: 8,  ip: "192.168.1.10" },
  { actorEmail: "admin@crm.local",          action: "import.start",        daysAgo: 4,  ip: "192.168.1.10" },
  { actorEmail: "manager@crm.local",        action: "auth.login",          daysAgo: 0,  ip: "192.168.1.22" },
  { actorEmail: "manager@crm.local",        action: "auth.login",          daysAgo: 1,  ip: "192.168.1.22" },
  { actorEmail: "manager@crm.local",        action: "lead.assign",         daysAgo: 2,  ip: "192.168.1.22" },
  { actorEmail: "manager@crm.local",        action: "view.create",         daysAgo: 3,  ip: "192.168.1.22" },
  { actorEmail: "manager@crm.local",        action: "import.start",        daysAgo: 12, ip: "192.168.1.22" },
  { actorEmail: "lucas.bernard@crm.local",  action: "auth.login",          daysAgo: 0,  ip: "10.0.0.45" },
  { actorEmail: "lucas.bernard@crm.local",  action: "auth.login",          daysAgo: 1,  ip: "10.0.0.45" },
  { actorEmail: "lucas.bernard@crm.local",  action: "lead.update",         daysAgo: 1,  ip: "10.0.0.45" },
  { actorEmail: "lucas.bernard@crm.local",  action: "lead.status_change",  daysAgo: 2,  ip: "10.0.0.45" },
  { actorEmail: "lucas.bernard@crm.local",  action: "lead.note",           daysAgo: 3,  ip: "10.0.0.45" },
  { actorEmail: "lucas.bernard@crm.local",  action: "import.start",        daysAgo: 2,  ip: "10.0.0.45" },
  { actorEmail: "emma.dupont@crm.local",    action: "auth.login",          daysAgo: 0,  ip: "10.0.0.51" },
  { actorEmail: "emma.dupont@crm.local",    action: "auth.login",          daysAgo: 2,  ip: "10.0.0.51" },
  { actorEmail: "emma.dupont@crm.local",    action: "lead.update",         daysAgo: 0,  ip: "10.0.0.51" },
  { actorEmail: "emma.dupont@crm.local",    action: "lead.assign",         daysAgo: 1,  ip: "10.0.0.51" },
  { actorEmail: "emma.dupont@crm.local",    action: "lead.note",           daysAgo: 4,  ip: "10.0.0.51" },
  { actorEmail: "lecteur@crm.local",        action: "auth.login",          daysAgo: 5,  ip: "172.16.0.8" },
];

// ── Notifications système / business (en plus des assignations) ──────────────
export const SYSTEM_NOTIFICATION_FIXTURES = [
  {
    ownerEmail: "admin@crm.local",
    type: "import_done",
    title: "Import terminé",
    body: "salon_paris_2026_prospects.xlsx — 118/128 leads importés",
    link: "/import",
    daysAgo: 12,
    read: true,
  },
  {
    ownerEmail: "admin@crm.local",
    type: "import_done",
    title: "Import terminé",
    body: "webinar_croissance_b2b.csv — 61/64 leads importés",
    link: "/import",
    daysAgo: 4,
    read: true,
  },
  {
    ownerEmail: "admin@crm.local",
    type: "weekly_digest",
    title: "Bilan hebdomadaire",
    body: "12 nouveaux leads cette semaine, +18% vs semaine précédente",
    link: "/dashboard",
    daysAgo: 1,
    read: false,
  },
  {
    ownerEmail: "admin@crm.local",
    type: "system",
    title: "Configuration scoring mise à jour",
    body: "Les nouveaux poids sont appliqués au prochain recalcul",
    link: "/settings",
    daysAgo: 8,
    read: true,
  },
  {
    ownerEmail: "manager@crm.local",
    type: "weekly_digest",
    title: "Performance équipe",
    body: "Lucas : 4 leads qualifiés · Emma : 6 leads qualifiés cette semaine",
    link: "/dashboard",
    daysAgo: 1,
    read: false,
  },
  {
    ownerEmail: "manager@crm.local",
    type: "import_failed",
    title: "Import échoué",
    body: "ancien_export_corrompu.csv — fichier illisible",
    link: "/import",
    daysAgo: 6,
    read: true,
  },
  {
    ownerEmail: "manager@crm.local",
    type: "lead_replied",
    title: "Un lead VIP a répondu",
    body: "Julien Moreau (HelioSaaS) — réponse positive sur le pilote 30 jours",
    link: "/leads",
    daysAgo: 1,
    read: false,
  },
  {
    ownerEmail: "lucas.bernard@crm.local",
    type: "lead_replied",
    title: "Marc Leroy a répondu",
    body: "Optima RH — confirme le rendez-vous d'onboarding",
    link: "/leads",
    daysAgo: 3,
    read: true,
  },
  {
    ownerEmail: "lucas.bernard@crm.local",
    type: "lead_score_high",
    title: "Lead à fort potentiel",
    body: "Camille Rousseau (NovaRetail) atteint un score de 78/100",
    link: "/leads",
    daysAgo: 1,
    read: false,
  },
  {
    ownerEmail: "emma.dupont@crm.local",
    type: "lead_replied",
    title: "Nouvelle réponse reçue",
    body: "Léa Fontaine (Pulse Analytics) souhaite une démo",
    link: "/leads",
    daysAgo: 0,
    read: false,
  },
  {
    ownerEmail: "emma.dupont@crm.local",
    type: "task_due",
    title: "Relances à faire aujourd'hui",
    body: "5 leads en statut Contacté à relancer cette semaine",
    link: "/leads",
    daysAgo: 0,
    read: false,
  },
];

// ── Templates email (CRM-051) ─────────────────────────────────────────────────
export const TEMPLATE_FIXTURES = [
  {
    name: "Cold outreach — SaaS B2B",
    category: "Prospection",
    subject: "{{firstName}}, un retour rapide sur {{company}} ?",
    bodyHtml: "<p>Bonjour {{firstName}},</p><p>Je vous contacte au sujet de {{company}}. Avez-vous 15 min cette semaine pour échanger ?</p><p>Bien cordialement,<br/>Lucas</p>",
    variables: ["firstName", "company"],
    isPreset: true,
  },
  {
    name: "Suivi webinar croissance B2B",
    category: "Webinar",
    subject: "Merci pour votre participation au webinar !",
    bodyHtml: "<p>Bonjour {{firstName}},</p><p>Merci d'avoir assisté à notre webinar sur la croissance B2B. Voici le replay et les slides en pièce jointe.</p>",
    variables: ["firstName"],
    isPreset: true,
  },
  {
    name: "Relance VIP — proposition commerciale",
    category: "Relance",
    subject: "{{firstName}}, proposition commerciale {{company}}",
    bodyHtml: "<p>Bonjour {{firstName}},</p><p>Suite à nos derniers échanges, vous trouverez ci-joint la proposition commerciale pour {{company}}.</p>",
    variables: ["firstName", "company"],
    isPreset: false,
  },
];

// ── Segments (CRM-053) ────────────────────────────────────────────────────────
export const SEGMENT_FIXTURES = [
  { name: "Leads SaaS qualifiés", filters: { sector: "SaaS", status: "QUALIFIE" } },
  { name: "Participants webinar", filters: { source: "Webinar" } },
  { name: "Salon Paris 2026", filters: { source: "Salon Paris 2026" } },
  { name: "Leads VIP", filters: { tags: ["VIP"] } },
];

// ── Blacklist (CRM-040) ───────────────────────────────────────────────────────
// Adresses notoirement injoignables / désinscrites — alimente le compteur admin.
export const BLACKLIST_FIXTURES = [
  { email: "unsubscribe1@demo.crm.local",  reason: "unsubscribe" },
  { email: "bounce.hard@demo.crm.local",   reason: "hard_bounce" },
  { email: "complaint@demo.crm.local",     reason: "complaint" },
];

// ── Crédits API (CRM-082) ─────────────────────────────────────────────────────
export const API_CREDIT_FIXTURES = [
  { provider: "hunter",       used: 142, quota: 1000 },
  { provider: "apollo",       used: 87,  quota: 500 },
  { provider: "pappers",      used: 23,  quota: 200 },
  { provider: "googlePlaces", used: 56,  quota: 300 },
];

// ──────────────────────────────────────────────────────────────────────────────
// Générateur de leads supplémentaires : ~40 leads variés étalés sur 90 jours.
// Permet d'avoir des graphes, KPIs et filtres réellement remplis sur le dashboard.
// ──────────────────────────────────────────────────────────────────────────────

const FIRST_NAMES = ["Alexandre", "Charlotte", "Damien", "Eva", "Florian", "Gabrielle", "Hadrien", "Isabelle", "Jérôme", "Karine", "Lola", "Mathieu", "Noémie", "Olivier", "Pauline", "Quentin", "Roxane", "Sébastien", "Tania", "Ugo", "Valentine", "William", "Xavier", "Yasmine", "Zoé"];
const LAST_NAMES  = ["Dubois", "Lefèvre", "Bonnet", "Bertrand", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertin", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Mercier", "Boyer"];
const COMPANIES   = ["TechFlux", "BlueOcean", "Velora", "ZenithCorp", "Stellaris", "Nexora", "Linktrade", "Greenwave", "Optimax", "Brightline", "Phoenix Tech", "Valoris Group", "Atomik", "Oxalys", "Vertio", "Kairos Labs", "Numérys", "Solyx", "Métriq", "Sherpa Conseil", "Apogée Digital", "Caelis", "Domino Cloud", "Eclat Studio", "Forevia", "Granité Solutions", "Helia", "Inovéo", "Jukabox", "Kameleon"];
const SECTORS     = ["SaaS", "Retail", "Industrie", "Santé", "Finance", "Logistique", "Énergie", "EdTech", "Agence", "Cybersécurité", "RH", "Mobilité", "BTP", "E-commerce", "Média"];
const CITIES      = ["Paris", "Lyon", "Marseille", "Toulouse", "Nantes", "Bordeaux", "Lille", "Strasbourg", "Rennes", "Grenoble", "Montpellier", "Nice", "Reims", "Le Havre", "Dijon"];
const SOURCES     = ["Inbound", "Salon Paris 2026", "Webinar", "LinkedIn", "Partenaire", "Import CSV", "Référencement Google", "Cold call"];
const STATUS_DISTRIBUTION = [
  ...Array(14).fill("NOUVEAU"),
  ...Array(8).fill("CONTACTE"),
  ...Array(7).fill("QUALIFIE"),
  ...Array(5).fill("EN_DISCUSSION"),
  ...Array(4).fill("CONVERTI"),
  ...Array(3).fill("PERDU"),
];
const ASSIGNEES = [
  "lucas.bernard@crm.local",
  "lucas.bernard@crm.local",
  "emma.dupont@crm.local",
  "emma.dupont@crm.local",
  "manager@crm.local",
  null,
];
const TAG_POOL = ["SaaS", "Retail", "Prioritaire", "Salon Paris 2026", "Webinar", "VIP", "Relance chaude"];

// PRNG déterministe (mulberry32) → seed identique entre runs pour idempotence.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t |= 0;
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

function generateLeads() {
  const rand = mulberry32(20260513);
  const list = [];
  const usedEmails = new Set();

  for (let i = 0; i < STATUS_DISTRIBUTION.length; i++) {
    const status = STATUS_DISTRIBUTION[i];
    const firstName = pick(rand, FIRST_NAMES);
    const lastName  = pick(rand, LAST_NAMES);
    const company   = pick(rand, COMPANIES);
    const city      = pick(rand, CITIES);
    const sector    = pick(rand, SECTORS);
    const source    = pick(rand, SOURCES);
    const assignee  = pick(rand, ASSIGNEES);

    // Étalement temporel pondéré : récents = NOUVEAU/CONTACTE, anciens = CONVERTI/PERDU
    let daysAgo;
    if (status === "NOUVEAU")        daysAgo = Math.floor(rand() * 7);
    else if (status === "CONTACTE")  daysAgo = 2 + Math.floor(rand() * 14);
    else if (status === "QUALIFIE")  daysAgo = 4 + Math.floor(rand() * 21);
    else if (status === "EN_DISCUSSION") daysAgo = 7 + Math.floor(rand() * 28);
    else if (status === "CONVERTI")  daysAgo = 14 + Math.floor(rand() * 60);
    else                              daysAgo = 21 + Math.floor(rand() * 70);

    const lastActionDaysAgo = Math.max(0, daysAgo - Math.floor(rand() * Math.min(daysAgo, 14)));
    const hasReplied = ["EN_DISCUSSION", "CONVERTI"].includes(status) && rand() > 0.3;
    const opens  = Math.floor(rand() * (status === "NOUVEAU" ? 1 : 5));
    const clicks = Math.floor(rand() * (opens + 1));

    // Email stable et unique
    const local = `${firstName.toLowerCase().replace(/[éèêë]/g, "e").replace(/[à]/g, "a")}.${lastName.toLowerCase().replace(/[éèê]/g, "e")}.${i}`.replace(/[^a-z0-9.]/g, "");
    const email = `${local}@demo.crm.local`;
    if (usedEmails.has(email)) continue;
    usedEmails.add(email);

    // Tags : 0 à 2 aléatoires
    const tagCount = Math.floor(rand() * 3);
    const tags = [];
    for (let t = 0; t < tagCount; t++) {
      const tag = pick(rand, TAG_POOL);
      if (!tags.includes(tag)) tags.push(tag);
    }

    const phone = rand() > 0.4
      ? `+33 6 ${String(Math.floor(rand() * 90 + 10))} ${String(Math.floor(rand() * 90 + 10))} ${String(Math.floor(rand() * 90 + 10))} ${String(Math.floor(rand() * 90 + 10))}`
      : null;

    list.push({
      email,
      phone,
      firstName,
      lastName,
      company,
      website: rand() > 0.3 ? `https://${company.toLowerCase().replace(/[^a-z]/g, "")}.fr` : null,
      sector,
      city,
      country: "France",
      source,
      status,
      tags,
      notes: null,
      assigneeEmail: assignee,
      daysAgo,
      lastActionDaysAgo,
      lastReplyDaysAgo: hasReplied ? Math.max(0, lastActionDaysAgo - 1) : undefined,
      signals: { opens, clicks, hasReplied },
      enrichment: rand() > 0.6 ? { employees: 10 + Math.floor(rand() * 500) } : null,
    });
  }
  return list;
}

// `GENERATED_LEADS` et `ALL_LEAD_FIXTURES` sont définis en bas de fichier,
// après la déclaration de LEAD_FIXTURES (évite un TDZ ESM).

/**
 * Leads de démo : emails stables @demo.crm.local pour un seed idempotent.
 * `assigneeEmail` : commercial assigné (ou null).
 * `daysAgo` / `lastActionDaysAgo` : ancienneté relative.
 * `signals` : événements email pour le scoring.
 */
export const LEAD_FIXTURES = [
  {
    email: "camille.rousseau@demo.crm.local",
    phone: "+33 6 12 34 56 01",
    firstName: "Camille",
    lastName: "Rousseau",
    company: "NovaRetail",
    website: "https://novaretail.fr",
    sector: "Retail",
    city: "Paris",
    country: "France",
    source: "Salon Paris 2026",
    status: "QUALIFIE",
    tags: ["Retail", "Salon Paris 2026", "Prioritaire"],
    notes: "Intéressée par une démo pipeline + scoring. Décideuse marketing.",
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 2,
    lastActionDaysAgo: 1,
    signals: { opens: 2, clicks: 1, hasReplied: false },
    enrichment: { employees: 120, revenue: "8M€", linkedin: "novaretail" },
  },
  {
    email: "julien.moreau@demo.crm.local",
    phone: "+33 6 98 76 54 02",
    firstName: "Julien",
    lastName: "Moreau",
    company: "HelioSaaS",
    website: "https://heliosaas.io",
    sector: "SaaS",
    city: "Lyon",
    country: "France",
    source: "Inbound",
    status: "EN_DISCUSSION",
    tags: ["SaaS", "VIP"],
    notes: "Demande un pilote sur 30 jours avec 3 commerciaux.",
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 5,
    lastActionDaysAgo: 0,
    lastReplyDaysAgo: 1,
    signals: { opens: 4, clicks: 2, hasReplied: true },
    enrichment: { employees: 45, funding: "Série A" },
  },
  {
    email: "sarah.benali@demo.crm.local",
    phone: "+33 7 11 22 33 03",
    firstName: "Sarah",
    lastName: "Benali",
    company: "Atlas Logistique",
    website: "https://atlas-logistique.com",
    sector: "Logistique",
    city: "Marseille",
    country: "France",
    source: "Partenaire",
    status: "CONTACTE",
    tags: ["Prioritaire"],
    notes: "Premier échange positif, relance prévue jeudi.",
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 7,
    lastActionDaysAgo: 2,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
  {
    email: "thomas.girard@demo.crm.local",
    firstName: "Thomas",
    lastName: "Girard",
    company: "GreenBuild",
    website: "https://greenbuild.fr",
    sector: "BTP",
    city: "Nantes",
    country: "France",
    source: "Salon Paris 2026",
    status: "NOUVEAU",
    tags: ["Salon Paris 2026"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 0,
    lastActionDaysAgo: 0,
    signals: { opens: 0, clicks: 0, hasReplied: false },
  },
  {
    email: "lea.fontaine@demo.crm.local",
    phone: "+33 6 55 44 33 04",
    firstName: "Léa",
    lastName: "Fontaine",
    company: "Pulse Analytics",
    website: "https://pulse-analytics.fr",
    sector: "SaaS",
    city: "Bordeaux",
    country: "France",
    source: "Webinar",
    status: "QUALIFIE",
    tags: ["SaaS", "Webinar"],
    notes: "A participé au webinar croissance B2B.",
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 4,
    lastActionDaysAgo: 1,
    signals: { opens: 3, clicks: 1, hasReplied: false },
  },
  {
    email: "marc.leroy@demo.crm.local",
    firstName: "Marc",
    lastName: "Leroy",
    company: "Optima RH",
    sector: "RH",
    city: "Lille",
    country: "France",
    source: "Import CSV",
    status: "CONVERTI",
    tags: ["VIP"],
    notes: "Contrat signé — onboarding planifié.",
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 38,
    lastActionDaysAgo: 3,
    signals: { opens: 5, clicks: 3, hasReplied: true },
    enrichment: { employees: 200, contractValue: "24k€/an" },
  },
  {
    email: "nina.petit@demo.crm.local",
    phone: "+33 6 77 88 99 05",
    firstName: "Nina",
    lastName: "Petit",
    company: "Cloudify",
    website: "https://cloudify.eu",
    sector: "SaaS",
    city: "Toulouse",
    country: "France",
    source: "Inbound",
    status: "PERDU",
    tags: ["SaaS"],
    notes: "Budget gelé jusqu'à Q4.",
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 52,
    lastActionDaysAgo: 14,
    signals: { opens: 2, clicks: 0, hasReplied: true },
  },
  {
    email: "hugo.marchand@demo.crm.local",
    firstName: "Hugo",
    lastName: "Marchand",
    company: "DataVerse",
    website: "https://dataverse.io",
    sector: "Data",
    city: "Paris",
    country: "France",
    source: "LinkedIn",
    status: "CONTACTE",
    tags: ["Relance chaude"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 9,
    lastActionDaysAgo: 4,
    signals: { opens: 1, clicks: 1, hasReplied: false },
  },
  {
    email: "amelie.durand@demo.crm.local",
    phone: "+33 6 21 43 65 06",
    firstName: "Amélie",
    lastName: "Durand",
    company: "Maison Éclat",
    website: "https://maison-eclat.fr",
    sector: "Retail",
    city: "Rennes",
    country: "France",
    source: "Salon Paris 2026",
    status: "EN_DISCUSSION",
    tags: ["Retail", "Salon Paris 2026", "VIP"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 11,
    lastActionDaysAgo: 1,
    lastReplyDaysAgo: 2,
    signals: { opens: 3, clicks: 2, hasReplied: true },
  },
  {
    email: "pierre.lambert@demo.crm.local",
    firstName: "Pierre",
    lastName: "Lambert",
    company: "Finexa",
    sector: "Finance",
    city: "Paris",
    country: "France",
    source: "Partenaire",
    status: "NOUVEAU",
    tags: ["Prioritaire"],
    assigneeEmail: null,
    daysAgo: 1,
    lastActionDaysAgo: 1,
    signals: { opens: 0, clicks: 0, hasReplied: false },
  },
  {
    email: "clara.renard@demo.crm.local",
    phone: "+33 6 34 56 78 07",
    firstName: "Clara",
    lastName: "Renard",
    company: "SkillUp",
    website: "https://skillup.fr",
    sector: "EdTech",
    city: "Grenoble",
    country: "France",
    source: "Webinar",
    status: "QUALIFIE",
    tags: ["Webinar", "SaaS"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 6,
    lastActionDaysAgo: 2,
    signals: { opens: 2, clicks: 1, hasReplied: false },
  },
  {
    email: "antoine.vidal@demo.crm.local",
    firstName: "Antoine",
    lastName: "Vidal",
    company: "Mobilité Plus",
    sector: "Mobilité",
    city: "Nice",
    country: "France",
    source: "Import CSV",
    status: "CONTACTE",
    tags: ["Relance chaude"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 15,
    lastActionDaysAgo: 5,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
  {
    email: "ines.chevallier@demo.crm.local",
    phone: "+33 6 90 12 34 08",
    firstName: "Inès",
    lastName: "Chevallier",
    company: "BioMarket",
    website: "https://biomarket.fr",
    sector: "Agroalimentaire",
    city: "Dijon",
    country: "France",
    source: "Inbound",
    status: "CONVERTI",
    tags: ["VIP", "Retail"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 44,
    lastActionDaysAgo: 6,
    signals: { opens: 4, clicks: 2, hasReplied: true },
  },
  {
    email: "romain.blanc@demo.crm.local",
    firstName: "Romain",
    lastName: "Blanc",
    company: "Studio Pixel",
    sector: "Agence",
    city: "Montpellier",
    country: "France",
    source: "LinkedIn",
    status: "PERDU",
    tags: [],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 29,
    lastActionDaysAgo: 20,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
  {
    email: "elodie.mercier@demo.crm.local",
    phone: "+33 6 45 67 89 09",
    firstName: "Élodie",
    lastName: "Mercier",
    company: "Horizon Santé",
    website: "https://horizon-sante.fr",
    sector: "Santé",
    city: "Strasbourg",
    country: "France",
    source: "Partenaire",
    status: "QUALIFIE",
    tags: ["Prioritaire"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 8,
    lastActionDaysAgo: 2,
    signals: { opens: 2, clicks: 1, hasReplied: false },
  },
  {
    email: "maxime.roy@demo.crm.local",
    firstName: "Maxime",
    lastName: "Roy",
    company: "UrbanTech",
    sector: "PropTech",
    city: "Paris",
    country: "France",
    source: "Salon Paris 2026",
    status: "NOUVEAU",
    tags: ["Salon Paris 2026"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 0,
    lastActionDaysAgo: 0,
    signals: { opens: 0, clicks: 0, hasReplied: false },
  },
  {
    email: "chloe.garnier@demo.crm.local",
    phone: "+33 6 56 78 90 10",
    firstName: "Chloé",
    lastName: "Garnier",
    company: "Lumen Energy",
    website: "https://lumen-energy.fr",
    sector: "Énergie",
    city: "Lyon",
    country: "France",
    source: "Webinar",
    status: "EN_DISCUSSION",
    tags: ["Webinar", "VIP"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 13,
    lastActionDaysAgo: 1,
    lastReplyDaysAgo: 3,
    signals: { opens: 3, clicks: 2, hasReplied: true },
  },
  {
    email: "vincent.poulain@demo.crm.local",
    firstName: "Vincent",
    lastName: "Poulain",
    company: "Pack&Go",
    sector: "Logistique",
    city: "Le Havre",
    country: "France",
    source: "Import CSV",
    status: "CONTACTE",
    tags: [],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 18,
    lastActionDaysAgo: 7,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
  {
    email: "manon.lefevre@demo.crm.local",
    phone: "+33 6 23 45 67 11",
    firstName: "Manon",
    lastName: "Lefèvre",
    company: "Cuisine Moderne",
    website: "https://cuisine-moderne.fr",
    sector: "Retail",
    city: "Angers",
    country: "France",
    source: "Inbound",
    status: "QUALIFIE",
    tags: ["Retail"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 10,
    lastActionDaysAgo: 3,
    signals: { opens: 2, clicks: 1, hasReplied: false },
  },
  {
    email: "olivier.fournier@demo.crm.local",
    firstName: "Olivier",
    lastName: "Fournier",
    company: "SecureNet",
    website: "https://securenet.fr",
    sector: "Cybersécurité",
    city: "Toulon",
    country: "France",
    source: "LinkedIn",
    status: "CONVERTI",
    tags: ["SaaS", "VIP"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 57,
    lastActionDaysAgo: 8,
    signals: { opens: 6, clicks: 4, hasReplied: true },
  },
  {
    email: "fatou.diallo@demo.crm.local",
    phone: "+33 6 88 99 00 12",
    firstName: "Fatou",
    lastName: "Diallo",
    company: "MediaFlow",
    sector: "Média",
    city: "Paris",
    country: "France",
    source: "Partenaire",
    status: "NOUVEAU",
    tags: ["Prioritaire"],
    assigneeEmail: null,
    daysAgo: 3,
    lastActionDaysAgo: 3,
    signals: { opens: 0, clicks: 0, hasReplied: false },
  },
  {
    email: "benoit.carpentier@demo.crm.local",
    firstName: "Benoît",
    lastName: "Carpentier",
    company: "AeroParts",
    sector: "Industrie",
    city: "Toulouse",
    country: "France",
    source: "Salon Paris 2026",
    status: "CONTACTE",
    tags: ["Salon Paris 2026"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 16,
    lastActionDaysAgo: 6,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
  {
    email: "laura.meunier@demo.crm.local",
    phone: "+33 6 10 20 30 13",
    firstName: "Laura",
    lastName: "Meunier",
    company: "WellCare",
    website: "https://wellcare.fr",
    sector: "Santé",
    city: "Reims",
    country: "France",
    source: "Webinar",
    status: "PERDU",
    tags: ["Webinar"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 33,
    lastActionDaysAgo: 18,
    signals: { opens: 2, clicks: 0, hasReplied: true },
  },
  {
    email: "nicolas.barre@demo.crm.local",
    firstName: "Nicolas",
    lastName: "Barré",
    company: "NextCommerce",
    website: "https://nextcommerce.fr",
    sector: "E-commerce",
    city: "Paris",
    country: "France",
    source: "Inbound",
    status: "EN_DISCUSSION",
    tags: ["Retail", "Relance chaude"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 14,
    lastActionDaysAgo: 0,
    lastReplyDaysAgo: 1,
    signals: { opens: 4, clicks: 2, hasReplied: true },
  },
  {
    email: "sophie.henry@demo.crm.local",
    phone: "+33 6 14 25 36 14",
    firstName: "Sophie",
    lastName: "Henry",
    company: "Talentia",
    sector: "RH",
    city: "Nantes",
    country: "France",
    source: "Import CSV",
    status: "QUALIFIE",
    tags: ["SaaS"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 21,
    lastActionDaysAgo: 4,
    signals: { opens: 2, clicks: 1, hasReplied: false },
  },
  {
    email: "david.nguyen@demo.crm.local",
    firstName: "David",
    lastName: "Nguyen",
    company: "SmartFleet",
    website: "https://smartfleet.io",
    sector: "Mobilité",
    city: "Lyon",
    country: "France",
    source: "LinkedIn",
    status: "CONTACTE",
    tags: [],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 19,
    lastActionDaysAgo: 9,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
  {
    email: "aurelie.perrin@demo.crm.local",
    phone: "+33 6 32 54 76 15",
    firstName: "Aurélie",
    lastName: "Perrin",
    company: "Artisan Connect",
    sector: "Artisanat",
    city: "Clermont-Ferrand",
    country: "France",
    source: "Partenaire",
    status: "NOUVEAU",
    tags: [],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 2,
    lastActionDaysAgo: 2,
    signals: { opens: 0, clicks: 0, hasReplied: false },
  },
  {
    email: "guillaume.aubert@demo.crm.local",
    firstName: "Guillaume",
    lastName: "Aubert",
    company: "LegalDesk",
    website: "https://legaldesk.fr",
    sector: "LegalTech",
    city: "Paris",
    country: "France",
    source: "Inbound",
    status: "CONVERTI",
    tags: ["VIP", "SaaS"],
    assigneeEmail: "emma.dupont@crm.local",
    daysAgo: 48,
    lastActionDaysAgo: 5,
    signals: { opens: 5, clicks: 3, hasReplied: true },
  },
  {
    email: "marine.collet@demo.crm.local",
    phone: "+33 6 65 43 21 16",
    firstName: "Marine",
    lastName: "Collet",
    company: "FreshFoods",
    sector: "Agroalimentaire",
    city: "Brest",
    country: "France",
    source: "Salon Paris 2026",
    status: "QUALIFIE",
    tags: ["Salon Paris 2026", "Prioritaire"],
    assigneeEmail: "lucas.bernard@crm.local",
    daysAgo: 6,
    lastActionDaysAgo: 1,
    signals: { opens: 2, clicks: 1, hasReplied: false },
  },
  {
    email: "kevin.rousseau@demo.crm.local",
    firstName: "Kevin",
    lastName: "Rousseau",
    company: "PrintLab",
    sector: "Industrie",
    city: "Rouen",
    country: "France",
    source: "Webinar",
    status: "PERDU",
    tags: [],
    assigneeEmail: null,
    daysAgo: 41,
    lastActionDaysAgo: 25,
    signals: { opens: 1, clicks: 0, hasReplied: false },
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// SMTP / IMAP — module Emailing (M-01) + Réponses (R-01)
// ──────────────────────────────────────────────────────────────────────────────
// ⚠️ Les identifiants ci-dessous sont **factices** : ils ne permettent ni
// d'envoyer ni de relever — ils servent juste à peupler l'UI Settings et à
// rattacher les InboxMessage de démo. Pour un test E2E réel, remplacer
// `login`/`password` par les credentials du compte Mailtrap/Inbucket local.
export const SMTP_CONFIG_FIXTURES = [
  {
    label: "Compte principal — prospection",
    host: "smtp.demo.local",
    port: 587,
    login: "noreply-demo@crm.local",
    password: "demo-smtp-password-1",
    fromName: "Équipe CRM Démo",
    fromEmail: "noreply-demo@crm.local",
    dailyLimit: 500,
    isActive: true,
  },
  {
    label: "Compte secondaire — relances",
    host: "smtp.demo.local",
    port: 587,
    login: "relance-demo@crm.local",
    password: "demo-smtp-password-2",
    fromName: "Équipe CRM Démo",
    fromEmail: "relance-demo@crm.local",
    dailyLimit: 300,
    isActive: true,
  },
];

export const IMAP_CONFIG_FIXTURES = [
  {
    label: "Inbox principale — réponses prospection",
    host: "imap.demo.local",
    port: 993,
    login: "noreply-demo@crm.local",
    password: "demo-imap-password-1",
    isActive: true,
    lastSyncDaysAgo: 0,
  },
  {
    label: "Inbox secondaire — réponses relances",
    host: "imap.demo.local",
    port: 993,
    login: "relance-demo@crm.local",
    password: "demo-imap-password-2",
    isActive: true,
    lastSyncDaysAgo: 1,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Inbox — module Réponses (R-01, R-02, R-07)
// ──────────────────────────────────────────────────────────────────────────────
// Chaque thread est ancré à un `leadEmail` (sera résolu en leadId au seed).
// `messageId` doit être unique : utilisé pour l'idempotence et le matching
// In-Reply-To/References. Les `daysAgo` permettent de positionner le fil.
// Si `leadEmail` est `null`, le message reste "orphan" (sans lead rattaché).
export const INBOX_MESSAGE_FIXTURES = [
  // — Thread 1 : Julien Moreau (EN_DISCUSSION, hasReplied) — fil complet
  {
    leadEmail: "julien.moreau@demo.crm.local",
    messageId: "crm-demo-out-1-julien@demo.crm.local",
    direction: "outbound",
    from: '"Lucas Bernard" <lucas.bernard@crm.local>',
    to: "julien.moreau@demo.crm.local",
    subject: "Pilote 30 jours — HelioSaaS",
    bodyHtml: "<p>Bonjour Julien,</p><p>Suite à notre échange, voici la proposition de pilote 30 jours pour HelioSaaS : 3 commerciaux, accompagnement onboarding, restitution KPI à J+30.</p><p>Disponible cette semaine pour un kickoff ?</p><p>Lucas</p>",
    bodyText: "Bonjour Julien, Suite à notre échange, voici la proposition de pilote 30 jours...",
    daysAgo: 3,
  },
  {
    leadEmail: "julien.moreau@demo.crm.local",
    messageId: "reply-demo-julien-001@heliosaas.io",
    inReplyTo: "crm-demo-out-1-julien@demo.crm.local",
    direction: "inbound",
    from: '"Julien Moreau" <julien.moreau@heliosaas.io>',
    to: "lucas.bernard@crm.local",
    subject: "Re: Pilote 30 jours — HelioSaaS",
    bodyHtml: "<p>Bonjour Lucas,</p><p>Très intéressé. Pouvez-vous nous transmettre le détail du SLA et l'estimation de prix au-delà des 30 jours pilote ?</p><p>Mercredi 10h vous conviendrait pour le kickoff.</p><p>Julien</p>",
    bodyText: "Bonjour Lucas, Très intéressé. Pouvez-vous nous transmettre le détail du SLA...",
    isRead: true,
    daysAgo: 1,
  },
  // — Thread 2 : Camille Rousseau (QUALIFIE) — message reçu non lu (cas R-06 demo)
  {
    leadEmail: "camille.rousseau@demo.crm.local",
    messageId: "crm-demo-out-1-camille@demo.crm.local",
    direction: "outbound",
    from: '"Lucas Bernard" <lucas.bernard@crm.local>',
    to: "camille.rousseau@demo.crm.local",
    subject: "Démo pipeline & scoring — NovaRetail",
    bodyHtml: "<p>Bonjour Camille,</p><p>Comme convenu sur le salon, voici les créneaux disponibles pour la démo pipeline + scoring : mardi 14h, jeudi 10h.</p><p>Lucas</p>",
    daysAgo: 2,
  },
  {
    leadEmail: "camille.rousseau@demo.crm.local",
    messageId: "reply-demo-camille-001@novaretail.fr",
    inReplyTo: "crm-demo-out-1-camille@demo.crm.local",
    direction: "inbound",
    from: '"Camille Rousseau" <camille.rousseau@novaretail.fr>',
    to: "lucas.bernard@crm.local",
    subject: "Re: Démo pipeline & scoring — NovaRetail",
    bodyHtml: "<p>Bonjour Lucas,</p><p>Jeudi 10h c'est parfait. Pouvez-vous m'envoyer le lien Teams ?</p><p>Camille</p>",
    isRead: false,
    daysAgo: 0,
  },
  // — Thread 3 : Sarah Benali (CONTACTE) — auto-reply (R-08)
  {
    leadEmail: "sarah.benali@demo.crm.local",
    messageId: "crm-demo-out-1-sarah@demo.crm.local",
    direction: "outbound",
    from: '"Lucas Bernard" <lucas.bernard@crm.local>',
    to: "sarah.benali@demo.crm.local",
    subject: "Optimisation tournées — Atlas Logistique",
    bodyHtml: "<p>Bonjour Sarah,</p><p>Comme évoqué avec notre partenaire, je vous propose un échange pour explorer l'optimisation de vos tournées. 30 min cette semaine ?</p>",
    daysAgo: 4,
  },
  {
    leadEmail: "sarah.benali@demo.crm.local",
    messageId: "autoreply-demo-sarah@atlas-logistique.com",
    inReplyTo: "crm-demo-out-1-sarah@demo.crm.local",
    direction: "inbound",
    from: '"Sarah Benali" <sarah.benali@atlas-logistique.com>',
    to: "lucas.bernard@crm.local",
    subject: "Absence du bureau — Re: Optimisation tournées",
    bodyHtml: "<p>Bonjour,</p><p>Je suis actuellement absente du bureau jusqu'au lundi prochain. Pour toute urgence, contactez mon assistante.</p><p>Cordialement, Sarah</p>",
    bodyText: "Bonjour, Je suis actuellement absente du bureau jusqu'au lundi prochain...",
    isAutoReply: true,
    isRead: false,
    daysAgo: 3,
  },
  // — Message orphan : pas de lead rattaché (cas matching échoué)
  {
    leadEmail: null,
    messageId: "orphan-demo-001@unknown-prospect.com",
    direction: "inbound",
    from: '"Prospect inconnu" <contact@unknown-prospect.com>',
    to: "noreply-demo@crm.local",
    subject: "Demande d'information sur vos services",
    bodyHtml: "<p>Bonjour,</p><p>Nous avons découvert votre solution via LinkedIn. Pourriez-vous nous envoyer une présentation et tarifs ?</p><p>Cordialement</p>",
    isRead: false,
    daysAgo: 0,
  },
  // — Thread 4 : Thomas Girard (NOUVEAU) — premier email de réponse à une campagne
  {
    leadEmail: "thomas.girard@demo.crm.local",
    messageId: "reply-demo-thomas-001@greenbuild.fr",
    direction: "inbound",
    from: '"Thomas Girard" <thomas.girard@greenbuild.fr>',
    to: "noreply-demo@crm.local",
    subject: "Re: Découvrez notre nouvelle offre BTP digital",
    bodyHtml: "<p>Bonjour,</p><p>Intéressant. Comment cela fonctionne-t-il pour les artisans indépendants ?</p>",
    isRead: false,
    daysAgo: 1,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Sequences — module Relances (RL-01, RL-02, RL-04, RL-06)
// ──────────────────────────────────────────────────────────────────────────────
// `steps[].templateRef` est résolu au seed depuis TEMPLATE_FIXTURES (par `name`).
// Si `templateRef` est absent, `subject`/`bodyHtml` sont utilisés directement.
export const SEQUENCE_FIXTURES = [
  {
    name: "Relance prospects froids — 3 étapes",
    maxSteps: 3,
    isPaused: false,
    steps: [
      { delayDays: 0, templateRef: "Cold outreach — SaaS B2B", stopOnReply: true },
      { delayDays: 4, subject: "{{prenom}}, un rappel rapide sur {{entreprise}}", bodyHtml: "<p>Bonjour {{prenom}},</p><p>Je me permets de revenir vers vous concernant {{entreprise}}. Avez-vous eu l'occasion de regarder ma précédente proposition ?</p><p>Cordialement</p>", stopOnReply: true },
      { delayDays: 7, subject: "Dernière prise de contact — {{entreprise}}", bodyHtml: "<p>Bonjour {{prenom}},</p><p>Sans nouvelle de votre part, je clôture ce dossier. N'hésitez pas si vos besoins évoluent.</p><p>Cordialement</p>", stopOnReply: true },
    ],
  },
  {
    name: "Suivi webinar — 2 étapes",
    maxSteps: 2,
    isPaused: false,
    steps: [
      { delayDays: 1, templateRef: "Suivi webinar croissance B2B", stopOnReply: true },
      { delayDays: 5, subject: "Replay + ressources — {{entreprise}}", bodyHtml: "<p>Bonjour {{prenom}},</p><p>Je vous renvoie le replay et les ressources du webinar. Disponible pour un échange ?</p>", stopOnReply: true },
    ],
  },
  {
    name: "Pilote 30 jours — Relance VIP",
    maxSteps: 2,
    isPaused: true, // démo RL-06 : pause manuelle (release mobile en cours, etc.)
    steps: [
      { delayDays: 0, templateRef: "Relance VIP — proposition commerciale", stopOnReply: true },
      { delayDays: 7, subject: "Disponibilité kickoff — {{entreprise}}", bodyHtml: "<p>Bonjour {{prenom}},</p><p>Je relance pour caler le kickoff du pilote. Plusieurs créneaux disponibles cette semaine.</p>", stopOnReply: true },
    ],
  },
];

// Inscription de leads dans les séquences. `nextSendDaysAhead` = jours à partir
// d'aujourd'hui pour le prochain envoi (négatif = passé, positif = futur).
export const SEQUENCE_LEAD_FIXTURES = [
  // Sequence "Relance prospects froids"
  { sequenceName: "Relance prospects froids — 3 étapes", leadEmail: "sarah.benali@demo.crm.local",   currentStep: 1, sentCount: 1, status: "active", nextSendDaysAhead: 2 },
  { sequenceName: "Relance prospects froids — 3 étapes", leadEmail: "thomas.girard@demo.crm.local",  currentStep: 0, sentCount: 0, status: "active", nextSendDaysAhead: 0 },
  // Sequence "Suivi webinar"
  { sequenceName: "Suivi webinar — 2 étapes",            leadEmail: "camille.rousseau@demo.crm.local", currentStep: 1, sentCount: 1, status: "active", nextSendDaysAhead: 3 },
  // Sequence "Pilote 30 jours — VIP" (Julien a déjà répondu → stopped)
  { sequenceName: "Pilote 30 jours — Relance VIP",       leadEmail: "julien.moreau@demo.crm.local",   currentStep: 1, sentCount: 1, status: "stopped", stoppedReason: "reply", nextSendDaysAhead: null },
];

// ──────────────────────────────────────────────────────────────────────────────
// Exports calculés (en bas pour éviter les TDZ ESM)
// ──────────────────────────────────────────────────────────────────────────────

export const GENERATED_LEADS = generateLeads();

// Combo : leads soignés + générés. Utilisé par le seed et resetDemoData().
export const ALL_LEAD_FIXTURES = [...LEAD_FIXTURES, ...GENERATED_LEADS];
