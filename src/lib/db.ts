import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const isProduction = process.env.NODE_ENV === 'production'

  try {
    const client = new PrismaClient({
      log: isProduction ? ['error'] : ['error', 'warn'],
      // Increase timeout for Electron startup
      __internal: {
        engine: {
          connection_limit: 1,
          pool_timeout: 30,
        },
      },
    } as any)

    // Test the connection immediately in production/Electron mode
    if (process.env.ELECTRON_RUN_AS_NODE === '1') {
      client.$connect()
        .then(() => {
          console.log('[DB] Prisma client connected successfully')
        })
        .catch((err: Error) => {
          console.error('[DB] Prisma client connection failed:', err.message)
        })
    }

    return client
  } catch (err) {
    console.error('[DB] Failed to create Prisma client:', err)
    throw err
  }
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
