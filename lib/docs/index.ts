import type { DocBlock, DocSection, DocSubsection } from "./types";
import { overviewSection } from "./content/overview";
import { modulesSection } from "./content/modules";
import { flowsSection } from "./content/flows";
import { rolesSection } from "./content/roles";
import { howToSection } from "./content/howto";
import { architectureSection } from "./content/architecture";
import { securitySection } from "./content/security";
import { errorsSection } from "./content/errors";
import { referenceSection } from "./content/reference";

/** All documentation sections, in display order. */
export const docSections: DocSection[] = [
  overviewSection,
  modulesSection,
  flowsSection,
  rolesSection,
  howToSection,
  architectureSection,
  securitySection,
  errorsSection,
  referenceSection,
];

/**
 * Collect the searchable plain text of a block. Kept in sync with the
 * renderers in `components/docs/blocks.tsx` — every user-visible string
 * participates so search matches what readers actually see.
 */
function blockText(block: DocBlock): string {
  switch (block.type) {
    case "p":
      return block.text;
    case "bullets":
      return block.items.join(" ");
    case "table":
      return [block.caption ?? "", block.headers.join(" "), ...block.rows.map((r) => r.join(" "))].join(" ");
    case "steps":
      return [
        block.intro ?? "",
        ...block.steps.map((s) => `${s.title} ${s.detail ?? ""}`),
      ].join(" ");
    case "flow":
      return [block.label ?? "", block.nodes.join(" ")].join(" ");
    case "callout":
      return `${block.title ?? ""} ${block.text}`;
    case "code":
      return block.title ?? "";
    case "statusList":
      return block.items.map((i) => `${i.label} ${i.note ?? ""}`).join(" ");
  }
}

function subsectionText(sub: DocSubsection): string {
  return [sub.title, sub.route ?? "", ...sub.blocks.map(blockText)].join(" ");
}

export type SearchResult = {
  section: DocSection;
  subsection: DocSubsection;
};

/** Case-insensitive filter over section summaries and subsection content. */
export function searchDocs(query: string): Map<string, SearchResult[]> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const results = new Map<string, SearchResult[]>();
  for (const section of docSections) {
    const hits: SearchResult[] = [];
    const sectionMatches =
      section.title.toLowerCase().includes(q) ||
      section.summary.toLowerCase().includes(q);
    for (const sub of section.subsections) {
      const text = subsectionText(sub).toLowerCase();
      if (sectionMatches || sub.title.toLowerCase().includes(q) || text.includes(q)) {
        hits.push({ section, subsection: sub });
      }
    }
    if (hits.length > 0) {
      results.set(section.id, hits);
    }
  }
  return results;
}
