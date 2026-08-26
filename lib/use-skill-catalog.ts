"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type SkillCatalogEntry = {
  skillId: string;
  key: string;
  name: string;
  status: "active" | "archived";
};

/**
 * The coach-managed skill catalog. Labels come from the database —
 * archived skills are kept in the label map so historical records
 * still display their names.
 */
export function useSkillCatalog() {
  const skills = useQuery(api.skills.catalog, {});

  const active: SkillCatalogEntry[] = (skills ?? [])
    .filter((s) => s.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));

  const labelByKey = new Map((skills ?? []).map((s) => [s.key, s.name]));
  const label = (key: string) => labelByKey.get(key) ?? key;

  return { skills: skills ?? [], active, label, isLoading: skills === undefined };
}
