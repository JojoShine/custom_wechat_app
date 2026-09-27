import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { loadConfig } from '../config/app-config.js'

export const PRISMA = Symbol('PRISMA')

export const prismaProvider = {
  provide: PRISMA,
  useFactory: () => new PrismaClient({ adapter: new PrismaPg({ connectionString: loadConfig(process.env).databaseUrl }) })
}
