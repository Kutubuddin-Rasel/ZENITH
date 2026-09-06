/**
 * Export Report Query DTO — validates export request parameters.
 *
 * Ensures format is strictly one of the supported types,
 * preventing injection of arbitrary values.
 */
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportFormat } from '../interfaces/reports.interfaces';

// The unified enums live in the canonical contract layer. Both are re-exported
// here so existing import sites (`reports.controller`) keep resolving from this
// DTO module unchanged.
export { ReportType } from '../interfaces/reports.interfaces';
export { ReportFormat } from '../interfaces/reports.interfaces';

export class ExportReportQueryDto {
  // Step 3 widened validation from the transitional `pdf|xlsx` subset to the
  // full `ReportFormat` (pdf | xlsx | csv) now that the streaming
  // `CsvReportFormatter` is wired through the O(1) registry — a `csv` request
  // now routes to its formatter instead of 400-ing.
  @IsEnum(ReportFormat, {
    message: `format must be one of: ${Object.values(ReportFormat).join(', ')}`,
  })
  format: ReportFormat;

  /** Optional sprint ID for burndown exports */
  @IsOptional()
  @IsString()
  sprintId?: string;

  /** Optional days parameter for cumulative flow */
  @IsOptional()
  @IsString()
  days?: string;
}
