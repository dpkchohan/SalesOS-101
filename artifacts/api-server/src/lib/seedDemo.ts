import { eq } from "drizzle-orm";
import {
  db,
  companiesTable,
  contactsTable,
  leadsTable,
  interactionsTable,
  tasksTable,
  aiSignalsTable,
  documentsTable,
} from "@workspace/db";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysAhead(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function seedDemoData(orgId: string, ownerUserId: string): Promise<void> {
  const existing = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.orgId, orgId))
    .limit(1);
  if (existing.length > 0) {
    return;
  }

  const [acme, globex, initech, hooli] = await db
    .insert(companiesTable)
    .values([
      { orgId, name: "Acme Robotics", industry: "Manufacturing", sizeBucket: "201-1000", website: "acme.io" },
      { orgId, name: "Globex Health", industry: "Healthcare", sizeBucket: "51-200", website: "globex.health" },
      { orgId, name: "Initech Systems", industry: "FinTech", sizeBucket: "1001-5000", website: "initech.com" },
      { orgId, name: "Hooli Cloud", industry: "Software", sizeBucket: "5000+", website: "hooli.xyz" },
    ])
    .returning();

  const [marcus, sarah, raj, lisa, dan] = await db
    .insert(contactsTable)
    .values([
      {
        orgId,
        companyId: acme.id,
        name: "Marcus Chen",
        title: "VP Operations",
        email: "marcus@acme.io",
        phone: "+1-415-555-0102",
        tags: ["champion", "decision-maker"],
      },
      {
        orgId,
        companyId: globex.id,
        name: "Sarah Patel",
        title: "Director of IT",
        email: "sarah.patel@globex.health",
        phone: "+1-617-555-0188",
        tags: ["evaluator"],
      },
      {
        orgId,
        companyId: initech.id,
        name: "Raj Kapoor",
        title: "Head of Procurement",
        email: "rkapoor@initech.com",
        phone: "+1-212-555-0144",
        tags: ["budget-holder"],
      },
      {
        orgId,
        companyId: hooli.id,
        name: "Lisa Nakamura",
        title: "VP Engineering",
        email: "lisa.n@hooli.xyz",
        phone: "+1-415-555-0211",
        tags: ["technical"],
      },
      {
        orgId,
        companyId: acme.id,
        name: "Dan Holloway",
        title: "CFO",
        email: "dan@acme.io",
        phone: "+1-415-555-0103",
        tags: ["finance"],
      },
    ])
    .returning();

  const [acmeLead, globexLead, initechLead, hooliLead] = await db
    .insert(leadsTable)
    .values([
      {
        orgId,
        contactId: marcus.id,
        companyId: acme.id,
        assignedTo: ownerUserId,
        stage: "negotiating",
        valueUsd: 84000,
        currency: "USD",
        source: "Inbound — webform",
        closeDate: isoDate(daysAhead(14)),
      },
      {
        orgId,
        contactId: sarah.id,
        companyId: globex.id,
        assignedTo: ownerUserId,
        stage: "qualified",
        valueUsd: 42000,
        currency: "USD",
        source: "Outbound — LinkedIn",
        closeDate: isoDate(daysAhead(28)),
      },
      {
        orgId,
        contactId: raj.id,
        companyId: initech.id,
        assignedTo: ownerUserId,
        stage: "interested",
        valueUsd: 156000,
        currency: "USD",
        source: "Referral",
        closeDate: isoDate(daysAhead(45)),
      },
      {
        orgId,
        contactId: lisa.id,
        companyId: hooli.id,
        assignedTo: ownerUserId,
        stage: "new",
        valueUsd: 24000,
        currency: "USD",
        source: "Conference",
        closeDate: isoDate(daysAhead(60)),
      },
    ])
    .returning();

  await db.insert(interactionsTable).values([
    {
      orgId,
      leadId: acmeLead.id,
      contactId: marcus.id,
      userId: ownerUserId,
      type: "call",
      date: daysAgo(2),
      gist: "Marcus walked through procurement workflow. They want SSO + audit logs before signing. Asked for pricing on 50 vs 100 seats.",
      gains: ["Confirmed budget by Q-end", "Champion identified", "Procurement intro"],
      misses: ["Hasn't seen security review yet", "No mutual close plan"],
      actionItems: [
        { title: "Send 50/100 seat pricing", dueDate: daysAhead(1) },
        { title: "Loop in security for SOC2 docs", dueDate: daysAhead(3) },
      ],
      nextStep: "Pricing follow-up email by Friday, then security review call next week",
      durationMinutes: 35,
      sentiment: "positive",
    },
    {
      orgId,
      leadId: acmeLead.id,
      contactId: dan.id,
      userId: ownerUserId,
      type: "email",
      date: daysAgo(7),
      gist: "Dan (CFO) flagged annual billing preference. Wants ROI deck before approving.",
      gains: ["Got CFO engaged"],
      misses: ["No ROI deck delivered"],
      actionItems: [{ title: "Build ROI one-pager for Acme", dueDate: daysAhead(2) }],
      nextStep: "Deliver ROI one-pager",
      sentiment: "neutral",
    },
    {
      orgId,
      leadId: globexLead.id,
      contactId: sarah.id,
      userId: ownerUserId,
      type: "meeting",
      date: daysAgo(4),
      gist: "Demo with Sarah's team (5 people). Loved the pipeline view. Need HIPAA addendum to move forward.",
      gains: ["Strong demo feedback", "5 stakeholders engaged"],
      misses: ["HIPAA paperwork pending"],
      actionItems: [{ title: "Send HIPAA BAA template", dueDate: daysAhead(1) }],
      nextStep: "HIPAA BAA, then trial provisioning",
      durationMinutes: 45,
      sentiment: "positive",
    },
    {
      orgId,
      leadId: initechLead.id,
      contactId: raj.id,
      userId: ownerUserId,
      type: "call",
      date: daysAgo(18),
      gist: "Raj said timing is tight, may push to next quarter. Hasn't responded to last 2 emails.",
      gains: [],
      misses: ["Slipping timing", "Dropped responsiveness"],
      actionItems: [],
      nextStep: "Re-engage with new angle",
      durationMinutes: 12,
      sentiment: "negative",
    },
    {
      orgId,
      leadId: hooliLead.id,
      contactId: lisa.id,
      userId: ownerUserId,
      type: "email",
      date: daysAgo(1),
      gist: "Lisa requested a sandbox to test our API rate limits before deeper eval.",
      gains: ["Active interest", "Technical eval next"],
      misses: [],
      actionItems: [{ title: "Provision sandbox for Hooli", dueDate: daysAhead(1) }],
      nextStep: "Sandbox + integration call",
      sentiment: "positive",
    },
  ]);

  await db.insert(tasksTable).values([
    {
      orgId,
      leadId: acmeLead.id,
      assignedTo: ownerUserId,
      title: "Send Acme 50/100 seat pricing comparison",
      dueDate: isoDate(new Date()),
      priority: "high",
    },
    {
      orgId,
      leadId: acmeLead.id,
      assignedTo: ownerUserId,
      title: "Build ROI one-pager for Dan (CFO)",
      dueDate: isoDate(daysAhead(1)),
      priority: "high",
    },
    {
      orgId,
      leadId: globexLead.id,
      assignedTo: ownerUserId,
      title: "Email Sarah HIPAA BAA template",
      dueDate: isoDate(new Date()),
      priority: "medium",
    },
    {
      orgId,
      leadId: initechLead.id,
      assignedTo: ownerUserId,
      title: "Re-engage Raj — new angle on FY26 budget cycle",
      dueDate: isoDate(daysAhead(2)),
      priority: "high",
    },
    {
      orgId,
      leadId: hooliLead.id,
      assignedTo: ownerUserId,
      title: "Provision Hooli sandbox + share API docs",
      dueDate: isoDate(new Date()),
      priority: "medium",
    },
    {
      orgId,
      assignedTo: ownerUserId,
      title: "Weekly pipeline review",
      dueDate: isoDate(daysAhead(5)),
      priority: "low",
    },
  ]);

  await db.insert(aiSignalsTable).values([
    {
      orgId,
      leadId: initechLead.id,
      signalType: "no_response_18d",
      severity: "high",
      message: "No reply from Raj in 18 days despite 2 follow-ups. Deal at risk of slipping to next quarter.",
      recommendation: "Re-engage with a fresh angle — share a relevant case study or tie to their FY26 planning cycle.",
    },
    {
      orgId,
      leadId: acmeLead.id,
      signalType: "missing_decision_maker",
      severity: "medium",
      message: "Champion identified but no economic buyer engaged on the call. CFO Dan only seen via email.",
      recommendation: "Request a 30-min CFO sync; bring ROI deck and reference customer.",
    },
  ]);

  await db.insert(documentsTable).values([
    {
      orgId,
      leadId: acmeLead.id,
      type: "proposal",
      title: "Acme Robotics — Annual Plan Proposal",
      content:
        "Tiered annual plan covering 100 seats with SSO, audit logs, and dedicated CSM. Includes pilot success criteria and migration timeline.",
      format: "html",
      status: "draft",
    },
    {
      orgId,
      leadId: globexLead.id,
      type: "contract",
      title: "Globex Health — HIPAA BAA",
      content: "Standard Business Associate Agreement covering PHI handling, breach notification, and audit obligations.",
      format: "html",
      status: "sent",
      sentAt: daysAgo(3),
    },
    {
      orgId,
      leadId: hooliLead.id,
      type: "case_study",
      title: "How TechCo cut response time 60% — case study",
      content: "Customer story showing API integration patterns, sandbox-to-production workflow, and SLAs.",
      format: "html",
      status: "draft",
    },
  ]);
}
