import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { loadConfig } from './common/config/app-config.js'

async function bootstrap(): Promise<void> {
  loadConfig(process.env)
  const app = await NestFactory.create(AppModule, { rawBody: true })
  await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
