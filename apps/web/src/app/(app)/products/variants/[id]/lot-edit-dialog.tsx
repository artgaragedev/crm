'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api, ApiError, type VariantLot } from '@/lib/api';
import { formatDateTime, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const formSchema = z.object({
  unitCost: z
    .string()
    .min(1, 'Укажи цену')
    .refine((v) => /^\d+([.,]\d{1,2})?$/.test(v), 'Цена 10 / 99.99 / 99,99'),
  note: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  lot: VariantLot | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function LotEditDialog({ lot, onOpenChange, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { unitCost: '', note: '' },
  });

  useEffect(() => {
    if (lot) {
      reset({
        unitCost: String(lot.unitCost ?? 0),
        note: lot.note ?? '',
      });
    }
  }, [lot, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!lot) return;
    setSubmitting(true);
    try {
      await api.lots.update(lot.id, {
        unitCost: Number(values.unitCost.replace(',', '.')),
        note: values.note?.trim() ? values.note.trim() : null,
      });
      toast.success('Партия обновлена');
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const consumed = lot ? lot.initialQuantity - lot.remainingQuantity : 0;

  return (
    <Dialog open={!!lot} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать партию</DialogTitle>
          <DialogDescription>
            Изменение цены влияет на остаточную себестоимость этой партии и будущие списания.
            Историческая себестоимость прошлых движений не пересчитывается (snapshot бухучёта).
          </DialogDescription>
        </DialogHeader>

        {lot && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div>
              <span className="text-muted-foreground">Дата прихода: </span>
              <span className="font-medium">{formatDateTime(lot.receivedAt)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Изначально: </span>
              <span className="font-medium tabular-nums">{lot.initialQuantity}</span>
              {' · '}
              <span className="text-muted-foreground">потреблено: </span>
              <span className="font-medium tabular-nums">{consumed}</span>
              {' · '}
              <span className="text-muted-foreground">остаток: </span>
              <span className="font-medium tabular-nums">{lot.remainingQuantity}</span>
            </div>
            {lot.supplier && (
              <div>
                <span className="text-muted-foreground">Поставщик: </span>
                <span className="font-medium">{lot.supplier.name}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Текущая цена: </span>
              <span className="font-medium">{formatPrice(lot.unitCost)}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unitCost">Цена закупки за единицу</Label>
            <Input id="unitCost" inputMode="decimal" autoFocus {...register('unitCost')} />
            {errors.unitCost && (
              <p className="text-sm text-destructive">{errors.unitCost.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Заметка</Label>
            <Textarea id="note" rows={2} {...register('note')} />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
