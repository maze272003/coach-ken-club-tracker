import { Progress } from "@/components/ui/progress";

/**
 * Accessible progress row: the bar plus a textual percentage,
 * so progress is never communicated by color alone.
 */
export function ProgressRow({
  label,
  value,
  maxValue = 100,
}: {
  label: string;
  value: number | null;
  maxValue?: number;
  valueLabel?: string;
}) {
  const display =
    value === null ? null : Math.round((value / maxValue) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          {display === null ? "—" : `${display}%`}
        </span>
      </div>
      <Progress
        value={display ?? 0}
        max={100}
        aria-label={`${label}: ${display === null ? "no progress recorded yet" : `${display} percent`}`}
      />
    </div>
  );
}
