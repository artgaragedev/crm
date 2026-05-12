'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { Supplier } from '@art-garage/shared';
import { api, ApiError } from '@/lib/api';
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
  name: z.string().trim().min(1, 'Название обязательно').max(200),
  phone: z.string().trim().max(50).optional(),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Некорректный email'),
  note: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier?: Supplier | null;
  onSaved: () => void;
}

export function SupplierFormDialog({ open, onOpenChange, supplier, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!supplier;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', phone: '', email: '', note: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: supplier?.name ?? '',
        phone: supplier?.phone ?? '',
        email: supplier?.email ?? '',
        note: supplier?.note ?? '',
      });
    }
  }, [open, supplier, reset]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const payload = {
      name: values.name.trim(),
      phone: values.phone?.trim() || undefined,
      email: values.email?.trim() || undefined,
      note: values.note?.trim() || undefined,
    };
    try {
      if (isEdit && supplier) {
        await api.suppliers.update(supplier.id, payload);
        toast.success('Поставщик обновлён');
      } else {
        await api.suppliers.create(payload);
        toast.success('Поставщик создан');
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
          <DialogTitle>{isEdit ? 'Редактировать поставщика' : 'Новый поставщик'}</DialogTitle>
          <DialogDescription>Название обязательно, остальное — на усмотрение.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" autoFocus {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" type="tel" placeholder="+373 …" {...register('phone')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Заметка</Label>
            <Textarea id="note" rows={3} {...register('note')} />
          </div>

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
