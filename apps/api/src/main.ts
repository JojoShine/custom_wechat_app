import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { loadConfig } from './common/config/app-config.js'
import { loadWebviewApps } from './modules/webview/webview.config.js'
import { webviewCorsOptions } from './modules/webview/webview-cors.js'

async function bootstrap(): Promise<void> {
  loadConfig(process.env)
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.enableCors(webviewCorsOptions(loadWebviewApps(process.env)))
  await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
