import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { FileReadUrl, ReadyFile, UploadAuthorization } from '@template/contracts'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'
import { FilesService } from './files.service.js'

@Controller('files')
@UseGuards(AccessGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('uploads')
  async authorize(@Req() request: AuthenticatedRequest, @Body() input: { contentType: string; size: number }): Promise<UploadAuthorization> {
    return this.files.authorize(request.userId, input)
  }

  @Post('uploads/:id/confirm')
  @HttpCode(200)
  async confirm(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<ReadyFile> {
    return this.files.confirm(request.userId, id)
  }

  @Get(':id/read-url')
  async readUrl(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<FileReadUrl> {
    return this.files.readUrl(request.userId, id)
  }
}
