import { Response } from 'express';
import { Writable } from 'stream';
import { toFileSlug } from '../../../../common/utils/send-xlsx.util';
import { ExportSink } from './export.types';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Streams an export straight to the HTTP response.
 *
 * The headers go out in the constructor, before any byte of the body: once the
 * writer starts, the status line is already on the wire and a failure can only
 * end as a broken download, never as a 4xx (ADR-08).
 *
 * `finalize` is deliberately empty — `WorkbookWriter.commit()` ends the stream,
 * and calling `res.end()` again would throw.
 */
export class HttpResponseSink implements ExportSink {
  constructor(
    private readonly res: Response,
    filename: string,
  ) {
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${toFileSlug(filename.replace(/\.xlsx$/i, ''))}.xlsx"`,
    );
  }

  stream(): Writable {
    return this.res;
  }

  async finalize(): Promise<void> {
    // no-op: the writer owns closing the stream
  }
}
