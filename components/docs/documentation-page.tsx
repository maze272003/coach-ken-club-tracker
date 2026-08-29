"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  SearchX,
  Waves,
  ArrowLeft,
  X,
} from "lucide-react";
import { docSections, searchDocs } from "@/lib/docs";
import type { DocSection, DocSubsection } from "@/lib/docs/types";
import {
  AccessBadge,
  DocBlockView,
  DocIconTile,
  StatusBadge,
} from "@/components/docs/blocks";
import { docIcons } from "@/components/docs/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

const SECTION_PREFIX = "sec-";
const SUBSECTION_PREFIX = "doc-";

function DocsNav({
  sections,
  activeId,
  onSelect,
}: {
  sections: DocSection[];
  activeId: string;
  onSelect: (elementId: string, subsectionId?: string) => void;
}) {
  return (
    <nav aria-label="Documentation contents" className="space-y-0.5">
      {sections.map((section) => {
        const Icon = docIcons[section.icon] ?? BookOpen;
        const active = activeId === section.id;
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => onSelect(`${SECTION_PREFIX}${section.id}`)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {section.title}
            </button>
            {active ? (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-3">
                {section.subsections.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() =>
                      onSelect(`${SUBSECTION_PREFIX}${sub.id}`, sub.id)
                    }
                    className="block w-full truncate rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    {sub.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function SubsectionCard({
  sub,
  open,
  onToggle,
}: {
  sub: DocSubsection;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      id={`${SUBSECTION_PREFIX}${sub.id}`}
      className="scroll-mt-24 overflow-hidden rounded-xl border bg-card"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40"
      >
        {sub.icon ? <DocIconTile name={sub.icon} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {sub.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {sub.route ? (
              <code className="font-mono text-[11px] text-muted-foreground">
                {sub.route}
              </code>
            ) : null}
            {sub.access ? <AccessBadge access={sub.access} /> : null}
            {sub.status && sub.status !== "implemented" ? (
              <StatusBadge status={sub.status} />
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t px-4 py-4 sm:px-5">
          {sub.blocks.map((block, i) => (
            <DocBlockView key={i} block={block} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function DocumentationPage() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(docSections[0]!.id);
  const [navOpen, setNavOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(docSections[0]!.subsections.map((s) => s.id)),
  );

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchDocs(query), [query]);

  const visibleSections = useMemo<DocSection[]>(() => {
    if (!results) return docSections;
    return docSections
      .filter((section) => results.has(section.id))
      .map((section) => ({
        ...section,
        subsections: results
          .get(section.id)!
          .map((r) => r.subsection),
      }));
  }, [results]);

  const matchCount = results
    ? Array.from(results.values()).reduce((n, hits) => n + hits.length, 0)
    : 0;
  const totalTopics = docSections.reduce(
    (n, s) => n + s.subsections.length,
    0,
  );

  const isOpen = (sub: DocSubsection) =>
    searching ? true : openIds.has(sub.id);

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const goTo = (elementId: string, subsectionId?: string) => {
    if (subsectionId) {
      setOpenIds((prev) => new Set(prev).add(subsectionId));
    }
    window.history.replaceState(null, "", `#${elementId}`);
    window.setTimeout(() => {
      document
        .getElementById(elementId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, subsectionId ? 50 : 0);
  };

  // Deep link support: /docs#doc-m-times opens and scrolls to that topic.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    window.setTimeout(() => {
      if (hash.startsWith(SUBSECTION_PREFIX)) {
        setOpenIds((prev) =>
          new Set(prev).add(hash.slice(SUBSECTION_PREFIX.length)),
        );
      }
      document
        .getElementById(hash)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const els = docSections
      .map((s) => document.getElementById(`${SECTION_PREFIX}${s.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) {
          const id = visible[0].target.id.replace(SECTION_PREFIX, "");
          if (id) setActiveId(id);
        }
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const activeSection =
    docSections.find((s) => s.id === activeId) ?? docSections[0]!;

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Back to the app"
          >
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Waves className="size-4" aria-hidden="true" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">
              CoachKen Tracker
            </span>
          </Link>
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:flex"
          >
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">Documentation</span>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
            <span className="truncate" aria-live="polite">
              {activeSection.title}
            </span>
          </nav>
          <div className="ml-auto w-full max-w-64">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documentation…"
                aria-label="Search documentation"
                className="pl-8 pr-8"
              />
              {searching ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:py-10">
        <aside className="hidden lg:block" aria-label="Table of contents">
          <div className="sticky top-[72px] max-h-[calc(100vh-96px)] overflow-y-auto pr-1">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Contents
            </p>
            <DocsNav
              sections={docSections}
              activeId={activeId}
              onSelect={goTo}
            />
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-6 lg:hidden">
            <Button
              variant="outline"
              className="w-full justify-between"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((o) => !o)}
            >
              <span className="flex items-center gap-2">
                <BookOpen className="size-4" aria-hidden="true" />
                Contents
              </span>
              <ChevronDown
                className={cn("size-4 transition-transform", navOpen && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
            {navOpen ? (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border bg-card p-2">
                <DocsNav
                  sections={docSections}
                  activeId={activeId}
                  onSelect={(elementId, subsectionId) => {
                    setNavOpen(false);
                    goTo(elementId, subsectionId);
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="mb-8 rounded-xl border bg-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  System Documentation
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The complete guide to CoachKen Tracker — every module, how
                  they connect, who can do what, and step-by-step instructions
                  for using the system.
                </p>
                <p className="pt-1 text-xs text-muted-foreground">
                  {docSections.length} sections · {totalTopics} topics · for
                  coaches and students
                </p>
              </div>
            </div>
          </div>

          {searching ? (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {matchCount} {matchCount === 1 ? "topic" : "topics"} match{" "}
                <span className="font-medium text-foreground">“{query.trim()}”</span>
              </p>
              <Button variant="ghost" size="xs" onClick={() => setQuery("")}>
                Clear
              </Button>
            </div>
          ) : null}

          {visibleSections.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={`No results for “${query.trim()}”`}
              description="Try different keywords — module names like “times”, “roll call”, “goals”, or a task like “export CSV”."
            />
          ) : (
            <div className="space-y-12">
              {visibleSections.map((section) => (
                <section
                  key={section.id}
                  id={`${SECTION_PREFIX}${section.id}`}
                  className="scroll-mt-24"
                >
                  <div className="flex items-start gap-3 border-b pb-4">
                    <DocIconTile name={section.icon} className="size-9" />
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold tracking-tight">
                        {section.title}
                      </h2>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {section.summary}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {section.subsections.map((sub) => (
                      <SubsectionCard
                        key={sub.id}
                        sub={sub}
                        open={isOpen(sub)}
                        onToggle={() => toggle(sub.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
            This documentation lives inside the app and is maintained with the
            codebase — it documents only what is actually implemented.{" "}
            <Link
              href="/"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Back to the app
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
