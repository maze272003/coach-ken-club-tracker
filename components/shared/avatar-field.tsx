"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Link2, Trash2, Upload } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Optional profile picture picker: upload a file (stored in Convex file
 * storage; the value becomes the storage ID) or paste an image link.
 * An empty value means no picture. The parent owns the value; this
 * component reports every change through onChange.
 */
export function AvatarField({
  idPrefix,
  name,
  value,
  onChange,
  disabled = false,
  error,
}: {
  idPrefix: string;
  name: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const [mode, setMode] = useState<"upload" | "link">(
    isHttpUrl(value) ? "link" : "upload",
  );
  const [linkValue, setLinkValue] = useState(isHttpUrl(value) ? value : "");
  const [uploading, setUploading] = useState(false);
  const [uploadRef, setUploadRef] = useState("");
  const [uploadBlobUrl, setUploadBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.students.generateUploadUrl);

  // Sync the link input when the value is changed externally (profile
  // loads, dialog resets). Adjusting state during render is the
  // recommended alternative to a setState-in-effect.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (isHttpUrl(value) || value === "") setLinkValue(value);
  }

  const uploadActive = uploadRef !== "" && value === uploadRef;

  useEffect(() => {
    return () => {
      if (uploadBlobUrl) URL.revokeObjectURL(uploadBlobUrl);
    };
  }, [uploadBlobUrl]);

  function handleLinkChange(raw: string) {
    setLinkValue(raw);
    onChange(raw.trim());
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || uploading) return;
    if (!file.type.startsWith("image/")) {
      toast.warning("Please choose an image file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.warning("Image must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const postUrl = await generateUploadUrl({});
      const response = await fetch(postUrl, { method: "POST", body: file });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: string };
      const newBlobUrl = URL.createObjectURL(file);
      setUploadBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return newBlobUrl;
      });
      setUploadRef(storageId);
      setLinkValue("");
      onChange(storageId);
    } catch {
      toast.error("Unable to upload the image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    onChange("");
  }

  const linkInvalid = mode === "link" && linkValue !== "" && !isHttpUrl(linkValue);
  const previewSrc = uploadActive
    ? uploadBlobUrl
    : isHttpUrl(value)
      ? value
      : null;

  return (
    <div className="flex flex-col gap-2">
      <Label>Profile picture (optional)</Label>
      <div className="flex items-start gap-4">
        <Avatar className="size-16">
          {previewSrc ? <AvatarImage src={previewSrc} alt="" /> : null}
          <AvatarFallback>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            role="tablist"
            aria-label="Picture source"
            className="inline-flex w-fit items-center gap-0.5 rounded-lg border bg-muted p-0.5"
          >
            {(
              [
                { key: "upload", label: "Upload", icon: Upload },
                { key: "link", label: "Link", icon: Link2 },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                disabled={disabled || uploading}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {mode === "upload" ? (
            <div className="flex flex-col gap-1.5">
              <input
                ref={fileInputRef}
                id={`${idPrefix}-file`}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleFileChange}
                disabled={disabled || uploading}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
              >
                <Upload className="size-4" aria-hidden="true" />
                {uploading ? "Uploading…" : "Choose image"}
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG, JPG or WebP, up to 5 MB.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                id={`${idPrefix}-link`}
                type="url"
                placeholder="https://…"
                autoComplete="off"
                value={linkValue}
                onChange={(e) => handleLinkChange(e.target.value)}
                disabled={disabled || uploading}
                aria-invalid={linkInvalid}
                aria-describedby={linkInvalid ? `${idPrefix}-link-error` : undefined}
              />
              {linkInvalid ? (
                <p id={`${idPrefix}-link-error`} className="text-xs text-destructive">
                  Enter a valid URL starting with http:// or https://
                </p>
              ) : null}
            </div>
          )}
          {value !== "" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={disabled || uploading}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove picture
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
