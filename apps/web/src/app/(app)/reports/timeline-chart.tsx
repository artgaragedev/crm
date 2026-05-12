'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Granularity, ReportTimeline } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  data: ReportTimeline | null;
  loading: boolean;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
}

const TZ = 'Europe/Chisinau';

function formatBucket(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === 'month') {
    return d.toLocaleDateString('ru-RU', { timeZone: TZ, month: 'short', year: '2-digit' });
  }
  if (granularity === 'week') {
    return d.toLocaleDateString('ru-RU', { timeZone: TZ, day: '2-digit', month: 'short' });
  }
  return d.toLocaleDateString('ru-RU', { timeZone: TZ, day: '2-digit', month: 'short' });
}

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
};

export function TimelineChart({ data, loading, granularity, onGranularityChange }: Props) {
  const series = useMemo(() => {
    if (!data) return [];
    return data.points.map((p) => ({
      bucket: p.bucket,
      label: formatBucket(p.bucket, granularity),
      revenue: p.revenue,
      profit: p.profit,
    }));
  }, [data, granularity]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Динамика</CardTitle>
        <div className="inline-flex rounded-md border bg-background p-0.5">
          {(['day', 'week', 'month'] as const).map((g) => (
            <Button
              key={g}
              type="button"
              size="sm"
              variant={granularity === g ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => onGranularityChange(g)}
            >
              {GRANULARITY_LABELS[g]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        {loading && !data ? (
          <Skeleton className="h-72 w-full" />
        ) : series.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Нет данных за период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <LineChart data={series} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                className="fill-muted-foreground"
              />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCompact(v)}
                className="fill-muted-foreground"
                width={48}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                contentStyle={{
                  borderRadius: 8,
                  fontSize: 12,
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
                formatter={(value, name) => {
                  const n = typeof value === 'number' ? value : Number(value);
                  const label =
                    name === 'revenue' ? 'Выручка' : name === 'profit' ? 'Прибыль' : String(name);
                  return [formatPrice(Number.isFinite(n) ? n : 0), label];
                }}
                labelFormatter={(label) => String(label ?? '')}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#0f766e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function formatCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}
