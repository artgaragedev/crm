'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AttributeDto, AttributeValueDto } from '@art-garage/shared';
import { api, ApiError } from '@/lib/api';
import { pluralize } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AttributeFormDialog } from './attribute-form-dialog';
import { ValueFormDialog } from './value-form-dialog';

const TYPE_LABELS: Record<AttributeDto['type'], string> = {
  TEXT: 'Текст',
  SWATCH: 'Цвет',
  NUMBER: 'Число',
};

export default function AttributesPage() {
  const [items, setItems] = useState<AttributeDto[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingAttribute, setEditingAttribute] = useState<AttributeDto | null>(null);
  const [creatingAttribute, setCreatingAttribute] = useState(false);
  const [deletingAttribute, setDeletingAttribute] = useState<AttributeDto | null>(null);

  const [valueDialog, setValueDialog] = useState<{
    attribute: AttributeDto;
    value: AttributeValueDto | null;
  } | null>(null);
  const [deletingValue, setDeletingValue] = useState<{
    attribute: AttributeDto;
    value: AttributeValueDto;
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.attributes.list({ pageSize: 200 });
      setItems(res.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить атрибуты';
      toast.error(msg);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Атрибуты"
        description="Глобальный справочник осей вариативности: Цвет, Размер, Объём. Используется при создании вариативных товаров."
        actions={
          <Button onClick={() => setCreatingAttribute(true)}>
            <Plus className="mr-2 h-4 w-4" /> Создать атрибут
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Пока нет атрибутов. Создай первый — например «Цвет» или «Размер».
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-24">Код</TableHead>
                  <TableHead className="w-20">Тип</TableHead>
                  <TableHead className="w-32">Значений</TableHead>
                  <TableHead className="w-32">Товаров</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => {
                  const isOpen = expanded.has(a.id);
                  const valueCount = a.values?.length ?? 0;
                  return (
                    <AttributeRows
                      key={a.id}
                      attribute={a}
                      isOpen={isOpen}
                      valueCount={valueCount}
                      onToggle={() => toggleExpanded(a.id)}
                      onEditAttribute={() => setEditingAttribute(a)}
                      onDeleteAttribute={() => setDeletingAttribute(a)}
                      onAddValue={() => setValueDialog({ attribute: a, value: null })}
                      onEditValue={(v) => setValueDialog({ attribute: a, value: v })}
                      onDeleteValue={(v) => setDeletingValue({ attribute: a, value: v })}
                    />
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AttributeFormDialog
        open={creatingAttribute}
        onOpenChange={setCreatingAttribute}
        onSaved={() => {
          setCreatingAttribute(false);
          void reload();
        }}
      />
      <AttributeFormDialog
        attribute={editingAttribute}
        open={!!editingAttribute}
        onOpenChange={(v) => !v && setEditingAttribute(null)}
        onSaved={() => {
          setEditingAttribute(null);
          void reload();
        }}
      />
      <ConfirmDialog
        open={!!deletingAttribute}
        onOpenChange={(v) => !v && setDeletingAttribute(null)}
        title="Удалить атрибут?"
        description={
          deletingAttribute && (
            <>
              «{deletingAttribute.name}»
              {(deletingAttribute.productCount ?? 0) > 0 && (
                <>
                  {' '}используется в {deletingAttribute.productCount}{' '}
                  {pluralize(deletingAttribute.productCount ?? 0, 'товаре', 'товарах', 'товарах')}.
                  Удалить не получится — сначала отвяжи от товаров.
                </>
              )}
            </>
          )
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (deletingAttribute) await api.attributes.remove(deletingAttribute.id);
        }}
        onConfirmed={() => {
          toast.success('Атрибут удалён');
          setDeletingAttribute(null);
          void reload();
        }}
      />

      {valueDialog && (
        <ValueFormDialog
          open={!!valueDialog}
          onOpenChange={(v) => !v && setValueDialog(null)}
          attribute={valueDialog.attribute}
          value={valueDialog.value}
          onSaved={() => {
            setValueDialog(null);
            void reload();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deletingValue}
        onOpenChange={(v) => !v && setDeletingValue(null)}
        title="Удалить значение?"
        description={
          deletingValue && (
            <>
              «{deletingValue.value.label ?? deletingValue.value.value}» атрибута «
              {deletingValue.attribute.name}». Если значение уже используется в вариантах
              товаров — удаление не пройдёт.
            </>
          )
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (deletingValue) await api.attributes.removeValue(deletingValue.value.id);
        }}
        onConfirmed={() => {
          toast.success('Значение удалено');
          setDeletingValue(null);
          void reload();
        }}
      />
    </>
  );
}

interface AttributeRowsProps {
  attribute: AttributeDto;
  isOpen: boolean;
  valueCount: number;
  onToggle: () => void;
  onEditAttribute: () => void;
  onDeleteAttribute: () => void;
  onAddValue: () => void;
  onEditValue: (v: AttributeValueDto) => void;
  onDeleteValue: (v: AttributeValueDto) => void;
}

function AttributeRows({
  attribute: a,
  isOpen,
  valueCount,
  onToggle,
  onEditAttribute,
  onDeleteAttribute,
  onAddValue,
  onEditValue,
  onDeleteValue,
}: AttributeRowsProps) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={onToggle}>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{a.name}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{a.code}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {TYPE_LABELS[a.type]}
          {a.unit ? `, ${a.unit}` : ''}
        </TableCell>
        <TableCell className="text-muted-foreground">{valueCount}</TableCell>
        <TableCell className="text-muted-foreground">{a.productCount ?? 0}</TableCell>
        <TableCell>
          <div
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={onEditAttribute}
              aria-label="Редактировать"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteAttribute}
              aria-label="Удалить"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell />
          <TableCell colSpan={6} className="py-3">
            <div className="space-y-2">
              {(a.values ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Значений пока нет. Добавь, например {a.type === 'SWATCH' ? '«RED», «BLACK»' : '«M», «L»'}.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(a.values ?? []).map((v) => (
                    <ValueChip
                      key={v.id}
                      attribute={a}
                      value={v}
                      onEdit={() => onEditValue(v)}
                      onDelete={() => onDeleteValue(v)}
                    />
                  ))}
                </div>
              )}
              <div className="pt-1">
                <Button variant="outline" size="sm" onClick={onAddValue}>
                  <Plus className="mr-1 h-3 w-3" /> Добавить значение
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ValueChip({
  attribute,
  value,
  onEdit,
  onDelete,
}: {
  attribute: AttributeDto;
  value: AttributeValueDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
      {attribute.type === 'SWATCH' && (
        <span
          className="h-4 w-4 rounded-full border"
          style={{ background: value.swatch ?? 'transparent' }}
          aria-label={`Цвет ${value.value}`}
        />
      )}
      <span className="font-medium">{value.label ?? value.value}</span>
      <span className="font-mono text-xs text-muted-foreground">{value.code ?? value.value}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-60 hover:opacity-100"
        onClick={onEdit}
        aria-label="Редактировать значение"
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-destructive opacity-60 hover:opacity-100 hover:text-destructive"
        onClick={onDelete}
        aria-label="Удалить значение"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
