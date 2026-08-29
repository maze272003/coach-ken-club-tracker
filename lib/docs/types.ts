/**
 * Data model for the in-app documentation page.
 *
 * Documentation is data-driven: every section is described here and rendered
 * by the shared block renderers in `components/docs/blocks.tsx`. To document
 * a new module, add a subsection to the matching content file — no new UI
 * code is required.
 */

export type DocTone = "info" | "success" | "warning" | "danger";

/** Implementation status labels used across the documentation. */
export type DocStatus = "implemented" | "partial" | "planned";

/** Who can access a documented module or screen. */
export type DocAccess = "coach" | "student" | "both" | "public";

export type DocStep = {
  title: string;
  detail?: string;
};

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "bullets"; items: string[] }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      caption?: string;
    }
  | { type: "steps"; intro?: string; steps: DocStep[] }
  | { type: "flow"; label?: string; nodes: string[] }
  | { type: "callout"; tone: DocTone; title?: string; text: string }
  | { type: "code"; title?: string; code: string }
  | {
      type: "statusList";
      items: { label: string; status: DocStatus; note?: string }[];
    };

export type DocSubsection = {
  id: string;
  title: string;
  /** Key from the docs icon map in `components/docs/icons.ts`. */
  icon?: string;
  /** Access level badge shown on the subsection header. */
  access?: DocAccess;
  /** Implementation status badge (defaults to implemented when omitted). */
  status?: DocStatus;
  /** Primary screen(s) this subsection documents, e.g. `/coach/attendance`. */
  route?: string;
  blocks: DocBlock[];
};

export type DocSection = {
  id: string;
  title: string;
  /** Key from the docs icon map in `components/docs/icons.ts`. */
  icon: string;
  summary: string;
  subsections: DocSubsection[];
};

/**
 * Inline formatting supported inside `p`, `bullets`, `table` cells, `steps`
 * details and `callout` text:
 * - `code`        -> highlighted inline code
 * - **bold**      -> strong text
 * - [label](href) -> link (internal `/docs` hash links or app routes)
 */
export type DocInline = string;
