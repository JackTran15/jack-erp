import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/** One configured column in a report template (display/visibility/freeze/order). */
export class ReportTemplateColumnDto {
  @IsString()
  @Length(1, 120)
  col: string;

  /** User-renamed label; empty/blank ⇒ persisted as null (falls back to catalog name). */
  @IsOptional()
  @IsString()
  @Length(0, 120)
  displayName?: string | null;

  /** Defaults to true when omitted. */
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  /** Defaults to false when omitted. */
  @IsOptional()
  @IsBoolean()
  frozen?: boolean;

  /** Ignored on persist — the server stamps order from array position. */
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
