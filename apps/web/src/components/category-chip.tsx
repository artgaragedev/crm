import type { Category } from '@art-garage/shared';

interface Props {
  category: Pick<Category, 'name' | 'color'> | null | undefined;
  /** Compact mode: smaller dot only with name, no border */
  compact?: boolean;
}

export function CategoryChip({ category, compact }: Props) {
  if (!category) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={
        compact
          ? 'inline-flex items-center gap-1.5 text-sm'
          : 'inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs'
      }
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
        style={{ background: category.color ?? 'transparent' }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
