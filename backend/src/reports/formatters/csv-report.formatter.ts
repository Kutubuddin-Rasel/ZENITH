import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import { ReportFormat } from '../interfaces/reports.interfaces';
import type {
  IReportFormatter,
  ReportTable,
  ReportColumn,
  ReportRow,
  ReportCellValue,
} from '../interfaces/reports.interfaces';

// RFC-4180: quote a field iff it contains a quote, comma, CR or LF.
const NEEDS_QUOTING = /[",\r\n]/;
const ROW_TERMINATOR = '\r\n';

/**
 * CSV format port (NEW) — the living proof of the OCP win.
 *
 * Adding a third export format required ZERO changes to any provider or to the
 * other formatters: this class implements `IReportFormatter`, registers under
 * `REPORT_FORMATTER_TOKEN`, and the Step-3 registry picks it up by `format`.
 *
 * RFC-4180 compliant (CRLF terminators, double-quote escaping). Rows are pushed
 * to the `PassThrough` as they are serialized — O(row) memory. Multi-section
 * reports (issue breakdown) are emitted as blank-line-separated blocks, each
 * prefixed with its section title.
 */
@Injectable()
export class CsvReportFormatter implements IReportFormatter {
  readonly format = ReportFormat.CSV;
  private readonly logger = new Logger(CsvReportFormatter.name);

  render(table: ReportTable): PassThrough {
    const passThrough = new PassThrough();

    this.writeSection(passThrough, table.columns, table.rows);

    for (const section of table.sections ?? []) {
      passThrough.write(ROW_TERMINATOR);
      passThrough.write(`${this.escape(section.title)}${ROW_TERMINATOR}`);
      this.writeSection(passThrough, section.columns, section.rows);
    }

    passThrough.end();

    this.logger.log(
      `CSV rendered: "${table.title}" (${table.rows.length} rows)`,
    );
    return passThrough;
  }

  private writeSection(
    stream: PassThrough,
    columns: readonly ReportColumn[],
    rows: readonly ReportRow[],
  ): void {
    const header = columns.map((c) => this.escape(c.header)).join(',');
    stream.write(`${header}${ROW_TERMINATOR}`);

    for (const row of rows) {
      const line = columns
        .map((c) => this.escape(this.cell(row[c.key])))
        .join(',');
      stream.write(`${line}${ROW_TERMINATOR}`);
    }
  }

  private cell(value: ReportCellValue | undefined): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private escape(field: string): string {
    return NEEDS_QUOTING.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
  }
}
