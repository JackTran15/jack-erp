import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clear employee photo URLs that were never real uploads.
 *
 * Before media storage existed, the employee form saved the preview URL
 * returned by URL.createObjectURL() as photo_url. A `blob:` URL only lives
 * inside the browser tab that created it, so none of these values has ever
 * rendered after a reload. Photos now live in media_objects (owner type
 * EMPLOYEE_PROFILE); this removes the dead values so the profile screen shows
 * the empty state instead of a broken image.
 *
 * The feature owner confirmed the deletion (A-13). The cleared values cannot
 * be restored and were never usable, so `down` is intentionally a no-op.
 */
export class ClearBlobEmployeePhotoUrls1789950000000
  implements MigrationInterface
{
  name = 'ClearBlobEmployeePhotoUrls1789950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "employee_profiles" SET "photo_url" = NULL WHERE "photo_url" LIKE 'blob:%'`,
    );
  }

  public async down(): Promise<void> {
    // Nothing to restore: the cleared values were browser-local blob: URLs.
  }
}
