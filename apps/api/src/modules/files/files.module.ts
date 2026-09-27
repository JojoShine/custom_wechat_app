import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AccessGuard } from '../auth/access.guard.js'
import { FilesController } from './files.controller.js'
import { FilesService } from './files.service.js'
import { OssProvider } from './oss.provider.js'

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [AccessGuard, OssProvider, FilesService],
  exports: [FilesService]
})
export class FilesModule {}
