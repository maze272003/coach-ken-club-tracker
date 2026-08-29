import type { Metadata } from "next";
import { DocumentationPage } from "@/components/docs/documentation-page";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "System documentation for CoachKen Tracker — modules, flows, permissions, and step-by-step guides.",
};

export default function DocsPage() {
  return <DocumentationPage />;
}
