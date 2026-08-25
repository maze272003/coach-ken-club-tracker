"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
};

/**
 * Registry components pass icon names for several icon libraries;
 * this app pins lucide, so the other names are ignored.
 */
export function IconPlaceholder({
  lucide,
  className,
}: {
  lucide: string;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
  className?: string;
}): React.ReactNode {
  const Icon = icons[lucide] ?? CircleCheckIcon;
  return <Icon className={className} />;
}
