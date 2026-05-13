'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { AttributeDto, AttributeValueDto } from '@art-garage/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const formSchema = z.object({
  value: z.string().trim().min(1, 'Введи значение').max(64),
  label: z.string().trim().max(64).optional(),
  code: z
    .string()
    .trim()
    .max(16)
    .regex(/^[A-Za-z0-9_]*$/u, 'Только латиница, цифры, _')
    .optional(),
  swatch: z.string().trim().max(128).optional(),
  sortOrder: z.coerce.number().int().optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  attribute: AttributeDto;
  value?: AttributeValueDto | null;
  onSaved: () => void;
}

/** Нормализация value: UPPER, пробелы → '_'. Применяется при submit. */
function normalizeValue(v: string): string {
  return v
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, '_');
}

export function ValueFormDialog({ open, onOpenChange, attribute, value, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!value;
  const isSwatch = attribute.type === 'SWATCH';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: '', label: '', code: '', swatch: '', sortOrder: 0 },
  });

  const swatchField = watch('swatch');

  useEffect(() => {
    if (open) {
      reset({
        value: value?.value ?? '',
        label: value?.label ?? '',
        code: value?.code ?? '',
        swatch: value?.swatch ?? '',
        sortOrder: value?.sortOrder ?? 0,
      });
    }
  }, [open, value, reset]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const normValue = normalizeValue(values.value);
      const normCode = values.code?.trim().toUpperCase() || undefined;
      const payload = {
        value: normValue,
        label: values.label?.trim() || null,
        code: normCode,
        swatch: isSwatch ? (values.swatch?.trim() || null) : null,
        sortOrder: values.sortOrder ?? 0,
      };
      if (isEdit && value) {
        await api.attributes.updateValue(value.id, payload);
        toast.success('Значение обновлено');
      } else {
        await api.attributes.createValue(attribute.id, payload);
        toast.success('Значение добавлено');
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Редактировать значение' : `Новое значение «${attribute.name}»`}
          </DialogTitle>
          <DialogDescription>
            Значение нормализуется при сохранении: UPPER, пробелы → подчёркивания.
            Например, «Royal Blue» → ROYAL_BLUE.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="value">
              Значение
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                как в SKU и в JSON
              </span>
            </Label>
            <Input
              id="value"
              autoFocus
              className="font-mono uppercase"
              placeholder="RED"
              {...register('value')}
            />
            {errors.value && <p className="text-sm text-destructive">{errors.value.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">
              Подпись
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                для UI (опционально)
              </span>
            </Label>
            <Input id="label" placeholder="Красный" {...register('label')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">
              Код для SKU
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                необязательно — по умолчанию = значению
              </span>
            </Label>
            <Input
              id="code"
              className="font-mono uppercase"
              placeholder="RED"
              maxLength={16}
              {...register('code')}
            />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          {isSwatch && (
            <div className="space-y-2">
              <Label htmlFor="swatch">Цвет (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 cursor-pointer p-1"
                  value={swatchField || '#000000'}
                  onChange={(e) =>
                    setValue('swatch', e.target.value, { shouldDirty: true })
                  }
                />
                <Input
                  id="swatch"
                  placeholder="#dc2626"
                  className="font-mono"
                  {...register('swatch')}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sortOrder">
              Порядок
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                меньше — выше в списке
              </span>
            </Label>
            <Input
              id="sortOrder"
              type="number"
              defaultValue={0}
              {...register('sortOrder')}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняю…' : isEdit ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
