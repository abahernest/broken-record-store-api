import * as dotenv from 'dotenv';

dotenv.config();

export const AppConfig = {
  mongoUrl: process.env.MONGO_URL,
  mongoTestUrl: process.env.MONGO_TEST_URL,
  port: process.env.PORT || 3000,
  musicBrainzUrl: process.env.MUSIC_BRAINZ_BASE_URL,
  redisUrl: process.env.REDIS_URL,
  cacheTtl: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL, 10) : 60,
};
