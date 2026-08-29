"use client";

import Link from "next/link";
import {
  BookOpen,
  CircleCheck,
  CircleHelp,
  Info,
  TriangleAlert,
  CircleX,
} from "lucide-react";
import type {
  DocBlock,
  DocStatus,
  DocTone,
} from "@/lib/docs/types";
import { docIcons } from "@/components/docs/icons";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Renders inline documentation text. Supports the mini-format documented on
 * `DocInline`: `code`, **bold**, and [label](href) links.
 */
export function InlineText({ text }: { text: string }) {
  const parts = text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          const [, label, href] = link;
          if (href.startsWith("/") || href.startsWith("#")) {
            return (
              <Link
                key={i}
                href={href}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {label}
              </Link>
            );
          }
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {label}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const calloutTones: Record<
  DocTone,
  { className: string; icon: typeof Info }
> = {
  info: {
    className: "border-primary/25 bg-primary/5 [&_svg]:text-primary",
    icon: Info,
  },
  success: {
    className:
      "border-emerald-500/30 bg-emerald-500/5 [&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400",
    icon: CircleCheck,
  },
  warning: {
    className:
      "border-amber-500/30 bg-amber-500/5 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400",
    icon: TriangleAlert,
  },
  danger: {
    className: "border-destructive/30 bg-destructive/5 [&_svg]:text-destructive",
    icon: CircleX,
  },
};

const statusStyles: Record<DocStatus, { label: string; className: string }> = {
  implemented: {
    label: "Implemented",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  partial: {
    label: "Partially implemented",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  planned: {
    label: "Planned",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function StatusBadge({ status }: { status: DocStatus }) {
  const s = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        s.className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {s.label}
    </span>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
          <span
            className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60"
            aria-hidden="true"
          />
          <span className="text-muted-foreground">
            <InlineText text={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Steps({
  intro,
  steps,
}: {
  intro?: string;
  steps: { title: string; detail?: string }[];
}) {
  return (
    <div>
      {intro ? (
        <p className="mb-3 text-sm font-medium text-foreground">
          <InlineText text={intro} />
        </p>
      ) : null}
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                <InlineText text={step.title} />
              </p>
              {step.detail ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <InlineText text={step.detail} />
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Flow({
  label,
  nodes,
}: {
  label?: string;
  nodes: string[];
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
      {label ? (
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {nodes.map((node, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs">
              {node}
            </span>
            {i < nodes.length - 1 ? (
              <svg
                className="size-3.5 shrink-0 text-muted-foreground/70 rtl:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function Callout({
  tone,
  title,
  text,
}: {
  tone: DocTone;
  title?: string;
  text: string;
}) {
  const t = calloutTones[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3.5", t.className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title ? (
          <p className="text-sm font-semibold text-foreground">{title}</p>
        ) : null}
        <p className="text-sm leading-relaxed text-muted-foreground">
          <InlineText text={text} />
        </p>
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {title ? (
        <div className="border-b bg-muted/50 px-3.5 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      ) : null}
      <pre className="overflow-x-auto bg-muted/30 p-3.5 font-mono text-xs leading-relaxed text-foreground">
        {code}
      </pre>
    </div>
  );
}

function StatusList({
  items,
}: {
  items: { label: string; status: DocStatus; note?: string }[];
}) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
          <StatusBadge status={item.status} />
          <span className="font-medium text-foreground">{item.label}</span>
          {item.note ? (
            <span className="text-muted-foreground">— {item.note}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: string[][];
  caption?: string;
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {headers.map((h, i) => (
                <TableHead
                  key={i}
                  className={cn("h-9", i === 0 && "font-semibold")}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell
                    key={j}
                    className={cn(
                      "align-top text-sm leading-relaxed",
                      j === 0 && "font-medium text-foreground",
                    )}
                  >
                    <InlineText text={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {caption ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}

/** Renders a single documentation block. */
export function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          <InlineText text={block.text} />
        </p>
      );
    case "bullets":
      return <Bullets items={block.items} />;
    case "table":
      return (
        <DataTable
          headers={block.headers}
          rows={block.rows}
          caption={block.caption}
        />
      );
    case "steps":
      return <Steps intro={block.intro} steps={block.steps} />;
    case "flow":
      return <Flow label={block.label} nodes={block.nodes} />;
    case "callout":
      return (
        <Callout tone={block.tone} title={block.title} text={block.text} />
      );
    case "code":
      return <CodeBlock title={block.title} code={block.code} />;
    case "statusList":
      return <StatusList items={block.items} />;
  }
}

/** Icon tile used on section and subsection headers. */
export function DocIconTile({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  const Icon = (name && docIcons[name]) || BookOpen;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/** Small "who can access this" badge for subsection headers. */
export function AccessBadge({
  access,
}: {
  access: "coach" | "student" | "both" | "public";
}) {
  switch (access) {
    case "coach":
      return <Badge>Coach only</Badge>;
    case "student":
      return <Badge variant="secondary">Student only</Badge>;
    case "both":
      return <Badge variant="outline">Coach & Students</Badge>;
    case "public":
      return <Badge variant="outline">Public</Badge>;
  }
}

/** Icon used by the documentation empty (no search results) state. */
export const DocsEmptyIcon = CircleHelp;
