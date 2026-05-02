import type {
  CompanyCredentials,
  Contact,
  Company,
  Lead,
  Interaction,
} from "@workspace/db";
import { claudeJson } from "./claude";

interface ProposalInput {
  branding: CompanyCredentials | null;
  contact: Contact;
  company: Company | null;
  lead: Lead;
  interactions: Interaction[];
  extraContext: string | null;
}

interface ProposalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface ProposalAi {
  introParagraph: string;
  sections: ProposalSection[];
  pricingNote?: string;
  nextSteps: string[];
  closing: string;
}

const SYSTEM = `You are a senior B2B sales writer producing crisp, professional proposals.
Reply with strict JSON only — no prose, no code fences.
Output shape:
{
  "introParagraph": "1-2 sentence opening that thanks the prospect and frames the proposal",
  "sections": [
    {
      "heading": "Section title (e.g. Understanding Your Needs, Proposed Solution, Implementation Timeline, Investment)",
      "paragraphs": ["1-2 short paragraphs"],
      "bullets": ["optional bullet points"]
    }
  ],
  "pricingNote": "Optional 1-line pricing summary (omit if no pricing context)",
  "nextSteps": ["3-5 concrete next steps"],
  "closing": "Warm 1-2 sentence closing"
}
Rules:
- Tone: confident, specific, no fluff. Reference the actual conversation context.
- 4-6 sections. Each ≤ 120 words.
- Never invent prices, dates, or commitments not in the source material.`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(s: unknown): string {
  if (s == null) return "";
  return escapeHtml(String(s));
}

function summarizeInteractions(interactions: Interaction[]): string {
  if (!interactions.length) return "(no recent interactions logged)";
  return interactions
    .slice(0, 8)
    .map((i) => {
      const date = i.date ? `[${String(i.date).slice(0, 10)}]` : "";
      const gist = i.gist ?? "";
      const gains = i.gains?.length ? ` Gains: ${i.gains.join("; ")}.` : "";
      const next = i.nextStep ? ` Next: ${i.nextStep}.` : "";
      return `${date} ${i.type}: ${gist}${gains}${next}`.trim();
    })
    .join("\n");
}

export async function generateProposalHtml(input: ProposalInput): Promise<string> {
  const { branding, contact, company, lead, interactions, extraContext } = input;

  const senderName = branding?.companyName ?? "Our Team";
  const primary = branding?.primaryColor ?? "#F94D00";
  const secondary = branding?.secondaryColor ?? "#7C3AED";
  const accent = branding?.accentColor ?? "#06B6D4";
  const footer =
    branding?.footerText ??
    ([branding?.companyName, branding?.website, branding?.email]
      .filter(Boolean)
      .join(" • ") ||
      "");
  const logo = branding?.companyLogoUrl ?? null;

  const contextSummary = `
Prospect: ${contact.name}${contact.title ? `, ${contact.title}` : ""}${
    company ? ` at ${company.name}` : ""
  }${contact.email ? ` (${contact.email})` : ""}.
Lead: stage="${lead.stage}", title="${lead.title ?? "(untitled)"}", value=${
    lead.value ?? "unknown"
  }, closeDate=${lead.closeDate ?? "unknown"}.
Sender: ${senderName}.
Recent conversation:
${summarizeInteractions(interactions)}
${extraContext ? `\nExtra context from sales rep: ${extraContext}` : ""}
`.trim();

  let ai: ProposalAi;
  try {
    ai = await claudeJson<ProposalAi>(SYSTEM, contextSummary);
  } catch {
    ai = {
      introParagraph: `Thanks for the conversation. ${senderName} is excited to share this proposal outlining how we can help${
        company ? ` ${company.name}` : ""
      } reach the next milestone.`,
      sections: [
        {
          heading: "Understanding Your Needs",
          paragraphs: [
            extraContext ??
              "Based on our discussions, you are evaluating partners who can deliver measurable results without unnecessary complexity.",
          ],
        },
        {
          heading: "Proposed Solution",
          paragraphs: [
            "We would partner with your team to scope, deliver, and iterate against the goals we discussed.",
          ],
        },
      ],
      nextSteps: [
        "Review this proposal at your convenience.",
        "Reply with any questions or change requests.",
        "Sign off so we can schedule kick-off.",
      ],
      closing: "Looking forward to building this together.",
    };
  }

  const sectionsHtml = ai.sections
    .map(
      (s) => `
    <section class="prop-section">
      <h2 style="color:${primary};">${fmt(s.heading)}</h2>
      ${s.paragraphs.map((p) => `<p>${fmt(p)}</p>`).join("")}
      ${
        s.bullets && s.bullets.length
          ? `<ul>${s.bullets.map((b) => `<li>${fmt(b)}</li>`).join("")}</ul>`
          : ""
      }
    </section>`,
    )
    .join("\n");

  const nextStepsHtml = ai.nextSteps
    .map(
      (n, i) =>
        `<li><span class="step-num" style="background:${secondary};">${
          i + 1
        }</span><span>${fmt(n)}</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${fmt(`Proposal for ${contact.name}`)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #111827; background: #ffffff; line-height: 1.55; }
  .doc { max-width: 800px; margin: 0 auto; padding: 48px 32px 24px; }
  .header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom: 24px; border-bottom: 4px solid ${primary}; margin-bottom: 32px; }
  .header .logo-box { display:flex; align-items:center; gap:12px; }
  .header img.logo { max-height: 56px; width: auto; }
  .header .sender { font-weight:700; font-size: 18px; color:${primary}; }
  .header .meta { text-align:right; font-size: 12px; color:#6b7280; }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; color: #0f172a; }
  .lede { color:#374151; font-size: 16px; margin: 0 0 28px; }
  .recipient { background:#f9fafb; border:1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; margin-bottom: 28px; }
  .recipient .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color:#6b7280; font-weight: 700; }
  .recipient .name { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .recipient .sub { font-size: 13px; color:#4b5563; margin-top: 2px; }
  .prop-section { margin: 24px 0; }
  .prop-section h2 { font-size: 18px; margin: 0 0 8px; }
  .prop-section p { margin: 8px 0; font-size: 14.5px; color:#1f2937; }
  .prop-section ul { padding-left: 20px; margin: 8px 0; }
  .prop-section li { font-size: 14.5px; color:#1f2937; margin: 4px 0; }
  .pricing { background: linear-gradient(135deg, ${primary}10, ${secondary}10); border-left: 4px solid ${accent}; padding: 16px 20px; border-radius: 8px; margin: 24px 0; font-size: 14px; color:#374151; }
  .next-steps { margin-top: 32px; }
  .next-steps h2 { color: ${primary}; font-size: 18px; margin: 0 0 12px; }
  .next-steps ol { list-style:none; padding: 0; margin: 0; }
  .next-steps li { display:flex; gap: 12px; align-items:flex-start; padding: 10px 0; font-size: 14.5px; }
  .step-num { display:inline-flex; align-items:center; justify-content:center; min-width: 28px; height: 28px; border-radius: 999px; color:#fff; font-weight:700; font-size: 13px; flex-shrink:0; }
  .closing { margin-top: 32px; font-size: 15px; color:#1f2937; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align:center; font-size: 12px; color:#6b7280; }
  @media print {
    .doc { padding: 24px; max-width: 100%; }
    body { background: #fff; }
  }
</style>
</head>
<body>
<div class="doc">
  <header class="header">
    <div class="logo-box">
      ${logo ? `<img class="logo" src="${fmt(logo)}" alt="${fmt(senderName)} logo" />` : `<span class="sender">${fmt(senderName)}</span>`}
    </div>
    <div class="meta">
      <div>${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
      ${branding?.website ? `<div>${fmt(branding.website)}</div>` : ""}
    </div>
  </header>
  <h1>Proposal for ${fmt(contact.name)}${company ? ` <span style="color:${secondary};">— ${fmt(company.name)}</span>` : ""}</h1>
  <p class="lede">${fmt(ai.introParagraph)}</p>
  <div class="recipient">
    <div class="label">Prepared for</div>
    <div class="name">${fmt(contact.name)}</div>
    <div class="sub">${fmt([contact.title, company?.name].filter(Boolean).join(" • "))}</div>
    ${contact.email ? `<div class="sub">${fmt(contact.email)}</div>` : ""}
  </div>
  ${sectionsHtml}
  ${ai.pricingNote ? `<div class="pricing"><strong>Pricing:</strong> ${fmt(ai.pricingNote)}</div>` : ""}
  <div class="next-steps">
    <h2>Next Steps</h2>
    <ol>${nextStepsHtml}</ol>
  </div>
  <p class="closing">${fmt(ai.closing)}</p>
  <div class="footer">${fmt(footer)}</div>
</div>
</body>
</html>`;
}
