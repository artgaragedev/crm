'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { AttributeDto, AttributeType } from '@art-garage/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const TYPE_LABELS: Record<AttributeType, string> = {
  TEXT: 'Текст (M, L, Стекло)',
  SWATCH: 'Цвет (с превью)',
  NUMBER: 'Число (с единицей)',
};

const formSchema = z.object({
  name: z.string().trim().min(1, 'Введи название').max(64),
  code: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(16)
    .regex(/^[A-Za-z0-9_]+$/u, 'Только латиница, цифры, _'),
  type: z.enum(['TEXT', 'SWATCH', 'NUMBER']),
  unit: z.string().trim().max(16).optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  attribute?: AttributeDto | null;
  onSaved: () => void;
}

export function AttributeFormDialog({ open, onOpenChange, attribute, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!attribute;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', type: 'TEXT', unit: '' },
  });

  const type = watch('type');

  useEffect(() => {
    if (open) {
      reset({
        name: attribute?.name ?? '',
        code: attribute?.code ?? '',
        type: attribute?.type ?? 'TEXT',
        unit: attribute?.unit ?? '',
      });
    }
  }, [open, attribute, reset]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const code = values.code.toUpperCase();
      const unit = values.unit?.trim() || null;
      if (isEdit && attribute) {
        await api.attributes.update(attribute.id, {
          name: values.name,
          code,
          type: values.type,
          unit: values.type === 'NUMBER' ? unit : null,
        });
        toast.success('Атрибут обновлён');
      } else {
        await api.attributes.create({
          name: values.name,
          code,
          type: values.type,
          unit: values.type === 'NUMBER' ? unit : null,
        });
        toast.success('Атрибут создан');
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
          <DialogTitle>{isEdit ? 'Редактировать атрибут' : 'Новый атрибут'}</DialogTitle>
          <DialogDescription>
            Атрибут — это ось вариативности (Цвет, Размер, Объём). Используется во всех
            товарах. Значения для этого атрибута добавляются отдельно.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" autoFocus placeholder="Цвет" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">
              Код
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                машинный, в SKU. Например: COLOR, SIZE
              </span>
            </Label>
            <Input
              id="code"
              className="font-mono uppercase"
              placeholder="COLOR"
              maxLength={16}
              {...register('code')}
            />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Тип</Label>
            <Select
              value={type}
              onValueChange={(v) => setValue('type', v as AttributeType, { shouldDirty: true })}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['TEXT', 'SWATCH', 'NUMBER'] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === 'NUMBER' && (
            <div className="space-y-2">
              <Label htmlFor="unit">
                Единица
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  мл, г, см
                </span>
              </Label>
              <Input id="unit" placeholder="мл" maxLength={16} {...register('unit')} />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняю…' : isEdit ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
