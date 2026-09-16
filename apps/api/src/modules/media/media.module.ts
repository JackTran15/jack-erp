import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaObjectEntity } from './media-object.entity';
import { ObjectStorageService } from './object-storage.service';
import { MediaUploadService } from './media-upload.service';
import { MediaUploadController } from './media-upload.controller';
import { MediaLinkService } from './media-link.service';
import { MediaQueryService } from './media-query.service';
import { MediaOwnerReaderRegistry } from './media-owner-reader.registry';
import { MediaDownloadService } from './media-download.service';
import { MediaDownloadController } from './media-download.controller';
import { MediaCleanupJob } from './media-cleanup.job';

/**
 * `@Global()`, same shape as `RedisModule` (`modules/redis/redis.module.ts`),
 * so the 7 document modules that call `MediaLinkService`/`MediaQueryService`
 * never edit this module's `imports`. `RbacService` is already global via
 * `RbacModule` (`modules/rbac/rbac.module.ts`), so it needs no import here.
 *
 * `ObjectStorageService` is intentionally not exported: business modules must
 * go through MediaLinkService / MediaQueryService, which enforce organization
 * scoping, instead of signing URLs for arbitrary object keys themselves.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([MediaObjectEntity])],
  controllers: [MediaUploadController, MediaDownloadController],
  providers: [
    ObjectStorageService,
    MediaUploadService,
    MediaLinkService,
    MediaQueryService,
    MediaOwnerReaderRegistry,
    MediaDownloadService,
    MediaCleanupJob,
  ],
  exports: [MediaLinkService, MediaQueryService, MediaOwnerReaderRegistry],
})
export class MediaModule {}
