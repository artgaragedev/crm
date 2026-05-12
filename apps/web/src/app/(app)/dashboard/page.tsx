'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Box,
  Boxes,
  Coins,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type DashboardSummary } from '@/lib/api';
import { formatDateTime, formatPrice, formatSigned } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { AttributesDisplay } from '@/components/attributes-display';
import { MovementTypeBadge } from '@/components/movement-type-badge';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const UNIT_LABEL: Record<string, string> = {
  PCS: 'шт',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак',
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.dashboard
      .summary()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить дашборд';
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Дашборд"
        description={user ? `Добро пожаловать, ${user.name}.` : undefined}
      />

      {loading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <KpiGrid summary={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RecentMovements summary={data} />
            <LowStock summary={data} />
          </div>
        </div>
      )}
    </>
  );
}

function KpiGrid({ summary }: { summary: DashboardSummary }) {
  const { inventory, activity } = summary;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={<Coins className="h-4 w-4" />}
        title="Стоимость инвентаря"
        value={formatPrice(inventory.totalValue)}
        hint={
          inventory.totalVariants === 0
            ? 'нет вариаций'
            : inventory.pricedVariants < inventory.totalVariants
              ? `по ${inventory.pricedVariants} из ${inventory.totalVariants} вариаций (с ценой)`
              : `по всем ${inventory.totalVariants} вариациям`
        }
      />
      <KpiCard
        icon={<Boxes className="h-4 w-4" />}
        title="Вариаций"
        value={inventory.totalVariants.toString()}
        hint={
          inventory.outOfStockCount > 0
            ? `${inventory.outOfStockCount} с нулевым остатком`
            : 'все имеют положительный остаток'
        }
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        title={`Движений за ${activity.days} дн.`}
        value={activity.total.toString()}
        hint={
          activity.total === 0
            ? 'движений ещё не было'
            : `+${activity.in} приходов · −${activity.out} списаний · ${activity.adjust} корр.`
        }
      />
      <KpiCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title={`Низкий остаток (≤${summary.lowStockThreshold})`}
        value={(inventory.lowStockCount + inventory.outOfStockCount).toString()}
        hint={
          inventory.lowStockCount + inventory.outOfStockCount === 0
            ? 'всё в норме'
            : `${inventory.outOfStockCount} закончилось, ${inventory.lowStockCount} мало`
        }
        warn={inventory.lowStockCount + inventory.outOfStockCount > 0}
      />
    </div>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint?: string;
  warn?: boolean;
}

function KpiCard({ icon, title, value, hint, warn }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className={warn ? 'text-amber-600' : 'text-muted-foreground'}>{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function RecentMovements({ summary }: { summary: DashboardSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Последние движения</CardTitle>
        <Link href="/movements" className="text-xs text-muted-foreground hover:underline">
          Все →
        </Link>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {summary.recentMovements.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Журнал движений пуст.
          </div>
        ) : (
          <ul className="divide-y">
            {summary.recentMovements.map((m) => {
              const unit = UNIT_LABEL[m.variant.product.unit] ?? '';
              const signed =
                m.type === 'OUT' ? -Math.abs(m.quantity) : m.type === 'IN' ? Math.abs(m.quantity) : m.quantity;
              return (
                <li key={m.id} className="flex items-center gap-3 px-1 py-2">
                  <MovementTypeBadge type={m.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.variant.product.name}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        · {m.variant.sku}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                      {m.supplier?.name && ` · ${m.supplier.name}`}
                      {m.customer?.name && ` · ${m.customer.name}`}
                      {m.note && ` · ${m.note}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      signed >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatSigned(signed, unit)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LowStock({ summary }: { summary: DashboardSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Заканчивается / закончилось</CardTitle>
        <Link href="/products" className="text-xs text-muted-foreground hover:underline">
          К товарам →
        </Link>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {summary.lowStock.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Box className="h-6 w-6 opacity-50" />
            Все остатки в порядке.
          </div>
        ) : (
          <ul className="divide-y">
            {summary.lowStock.map((item) => {
              const unit = UNIT_LABEL[item.unit] ?? '';
              const isOut = item.currentStock <= 0;
              return (
                <li key={item.variantId} className="flex items-center gap-3 px-1 py-2">
                  <span
                    className={
                      isOut ? 'text-rose-600' : 'text-amber-600'
                    }
                  >
                    {isOut ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.productName}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        · {item.sku}
                      </span>
                    </p>
                    {Object.keys(item.attributes).length > 0 && (
                      <div className="mt-0.5">
                        <AttributesDisplay attributes={item.attributes} inline />
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      isOut ? 'text-rose-700' : 'text-amber-700'
                    }`}
                  >
                    {item.currentStock} {unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
