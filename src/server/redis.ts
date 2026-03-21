import Redis from 'ioredis';
import { config } from './config';

/** Main Redis client for reads/writes. */
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/** Separate client for pub/sub (ioredis requirement). */
export const redisSub = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), redisSub.connect()]);
  console.log('[redis] connected');
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
  redisSub.disconnect();
}
