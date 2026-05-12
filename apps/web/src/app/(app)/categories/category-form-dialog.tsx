'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { hexColorSchema, type Category } from '@art-garage/shared';
import { api, ApiError } from '@/lib/api';
import { suggestCategoryCode } from '@/lib/sku';
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

// Локальная схема: цвет опциональный + допускаем пустую строку (для UX color-input).
const formSchema = z.object({
  name: z.string().min(1, 'Введи название').max(100),
  code: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[A-Za-z0-9-]{1,10}$/.test(v),
      'Код только из латиницы, цифр и дефисов, до 10 символов',
    ),
  color: z
    .string()
    .optional()
    .refine((v) => !v || hexColorSchema.safeParse(v).success, 'Цвет должен быть в формате #rrggbb'),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category?: Category | null;
  onSaved: () => void;
}

export function CategoryFormDialog({ open, onOpenChange, category, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!category;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', color: '' },
  });

  const nameField = watch('name');
  const handleSuggestCode = () => {
    const candidate = suggestCategoryCode(nameField ?? '');
    if (!candidate) {
      toast.error('Сначала введи название категории');
      return;
    }
    setValue('code', candidate, { shouldDirty: true });
  };

  useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? '',
        code: category?.code ?? '',
        color: category?.color ?? '',
      });
    }
  }, [open, category, reset]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const trimmedCode = values.code?.trim();
      if (isEdit && category) {
        await api.categories.update(category.id, {
          name: values.name.trim(),
          color: values.color || undefined,
          // null = очистить, undefined = не трогать
          code: trimmedCode ? trimmedCode.toUpperCase() : null,
        });
        toast.success('Категория обновлена');
      } else {
        await api.categories.create({
          name: values.name.trim(),
          ...(values.color ? { color: values.color } : {}),
          ...(trimmedCode ? { code: trimmedCode.toUpperCase() } : {}),
        });
        toast.success('Категория создана');
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
          <DialogTitle>{isEdit ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
          <DialogDescription>
            Название должно быть уникальным. Цвет — опционально, помогает в списке товаров.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" autoFocus {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">
              Код (артикул)
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                префикс для SKU, до 10 символов — например BTL, MUG
              </span>
            </Label>
            <div className="flex gap-1">
              <Input
                id="code"
                className="font-mono uppercase"
                placeholder="BTL"
                maxLength={10}
                {...register('code')}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSuggestCode}
                title="Предложить из названия"
                aria-label="Сгенерировать код"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Цвет</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                type="color"
                className="h-10 w-16 cursor-pointer p-1"
                {...register('color')}
              />
              <Input placeholder="#3b82f6" className="font-mono" {...register('color')} />
            </div>
            {errors.color && <p className="text-sm text-destructive">{errors.color.message}</p>}
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
