import { Module } from '@nestjs/common';
import { RecordModule } from './api/record.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig } from './app.config';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        // If REDIS_URL is provided, attempt to use a Redis cache store.
        if (AppConfig.redisUrl) {
          try {
            // dynamic require so dev envs without the package won't fail
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const redisStore = require('cache-manager-redis-store');
            return {
              store: redisStore,
              url: AppConfig.redisUrl,
              ttl: AppConfig.cacheTtl,
            };
          } catch (err) {
            // Fall back to in-memory cache if redis store not installed
            return { ttl: AppConfig.cacheTtl };
          }
        }

        // Default to in-memory cache
        return { ttl: AppConfig.cacheTtl };
      },
    }),
    MongooseModule.forRoot(AppConfig.mongoUrl),
    RecordModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
