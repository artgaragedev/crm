import type { MovementType } from '@art-garage/shared';
import { cn } from '@/lib/utils';

const STYLES: Record<MovementType, { label: string; className: string }> = {
  IN: {
    label: 'Приход',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  OUT: {
    label: 'Списание',
    className: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  ADJUST: {
    label: 'Корр.',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
};

export function MovementTypeBadge({ type }: { type: MovementType }) {
  const s = STYLES[type];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}
