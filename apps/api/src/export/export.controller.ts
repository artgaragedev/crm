import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';

// BOM нужен чтобы Excel читал кириллицу из UTF-8 без танцев.
const UTF8_BOM = '﻿';

@Controller('export')
export class ExportController {
  constructor(private readonly exporter: ExportService) {}

  @Get('inventory.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async inventory(@Res() res: Response) {
    const csv = await this.exporter.inventoryCsv();
    const filename = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(UTF8_BOM + csv);
  }

  @Get('movements.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async movements(@Res() res: Response) {
    const csv = await this.exporter.movementsCsv();
    const filename = `movements-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(UTF8_BOM + csv);
  }
}
