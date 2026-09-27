import 'reflect-metadata'
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

const args = process.argv.slice(2).filter((value) => value !== '--')
const date = args[0]
const parsed = date ? new Date(`${date}T00:00:00.000Z`) : null
if (args.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
  console.error('Usage: pnpm --filter @template/api reconcile -- YYYY-MM-DD')
  process.exitCode = 2
} else {
  const [{ PrismaClient }, { loadConfig, loadWechatPayConfig }, { WechatPayGateway }, { ReconciliationService }] = await Promise.all([
    import('../dist/generated/prisma/client.js'),
    import('../dist/common/config/app-config.js'),
    import('../dist/modules/payments/wechat-pay.gateway.js'),
    import('../dist/modules/payments/reconciliation.service.js')
  ])
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: loadConfig(process.env).databaseUrl }) })
  try {
    const config = loadWechatPayConfig(process.env)
    const summary = await new ReconciliationService(prisma, new WechatPayGateway(config), config).run(date)
    console.log(JSON.stringify(summary))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Reconciliation failed')
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
