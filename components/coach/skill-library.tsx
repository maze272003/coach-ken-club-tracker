"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Check,
  Pencil,
  Plus,
  Waves,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/format";

/**
 * Coach-only manager for the skill catalog: add new skill programs,
 * rename them, and archive/restore. Archiving hides a skill from
 * pickers and student views while keeping historical data.
 */
export function SkillLibrary() {
  const skills = useQuery(api.skills.catalog, {});
  const addSkill = useMutation(api.skills.add);
  const renameSkill = useMutation(api.skills.rename);
  const setStatus = useMutation(api.skills.setStatus);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding || newName.trim() === "") return;
    setError(null);
    setAdding(true);
    try {
      await addSkill({ name: newName });
      toast.success("Skill added.");
      setNewName("");
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err, "Unable to add the skill. Please try again."));
      setAdding(false);
    }
  }

  async function handleRename(skillId: string) {
    if (busyId !== null || editName.trim() === "") return;
    setError(null);
    setBusyId(skillId);
    try {
      await renameSkill({ skillId: skillId as never, name: editName });
      toast.success("Skill renamed.");
      setEditingId(null);
      setBusyId(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to rename the skill. Please try again."));
      setBusyId(null);
    }
  }

  async function handleSetStatus(
    skillId: string,
    name: string,
    status: "active" | "archived",
  ) {
    if (busyId !== null) return;
    setError(null);
    setBusyId(skillId);
    try {
      await setStatus({ skillId: skillId as never, status });
      toast.success(status === "archived" ? `${name} archived.` : `${name} restored.`);
      setBusyId(null);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to update the skill. Please try again."),
      );
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Waves className="size-4 text-muted-foreground" aria-hidden="true" />
          Skill Library
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-2 sm:flex-row sm:max-w-md"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New skill program, e.g. Butterfly Kick"
            aria-label="New skill name"
            disabled={adding}
            maxLength={60}
          />
          <Button type="submit" disabled={adding || newName.trim() === ""}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {adding ? "Adding…" : "Add Skill"}
          </Button>
        </form>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {skills === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <EmptyState
            icon={Waves}
            title="No skills yet"
            description="Add the skill programs you coach — they become available for progress tracking and training sessions."
            className="border-0 py-6"
          />
        ) : (
          <ul className="divide-y">
            {skills.map((skill) => {
              const editing = editingId === skill.skillId;
              const archived = skill.status === "archived";
              return (
                <li
                  key={skill.skillId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  {editing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label={`Rename ${skill.name}`}
                        maxLength={60}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleRename(skill.skillId);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        disabled={busyId !== null}
                      />
                      <Button
                        size="icon-sm"
                        aria-label="Save name"
                        disabled={busyId !== null || editName.trim() === ""}
                        onClick={() => void handleRename(skill.skillId)}
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label="Cancel rename"
                        disabled={busyId !== null}
                        onClick={() => setEditingId(null)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={archived ? "text-muted-foreground line-through" : "font-medium"}
                      >
                        {skill.name}
                      </span>
                      {archived ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : null}
                    </div>
                  )}
                  {!editing ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId !== null}
                        onClick={() => {
                          setEditingId(skill.skillId);
                          setEditName(skill.name);
                        }}
                      >
                        <Pencil data-icon="inline-start" aria-hidden="true" />
                        Rename
                      </Button>
                      {archived ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId !== null}
                          onClick={() =>
                            void handleSetStatus(
                              skill.skillId,
                              skill.name,
                              "active",
                            )
                          }
                        >
                          <ArchiveRestore data-icon="inline-start" aria-hidden="true" />
                          Restore
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId !== null}
                          onClick={() =>
                            void handleSetStatus(
                              skill.skillId,
                              skill.name,
                              "archived",
                            )
                          }
                        >
                          <Archive data-icon="inline-start" aria-hidden="true" />
                          Archive
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
