import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { RecordController } from './controllers/record.controller';
import { OrderController } from './controllers/order.controller';
import { RecordService } from './services/record.service';
import { OrderService } from './services/order.service';
import { RecordSchema } from './schemas/record.schema';
import { OrderSchema } from './schemas/order.schema';
import { MusicBrainzService } from './utils/music_brainz.service';
import { RetryService } from './utils/retry.service';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: 'Record', schema: RecordSchema },
      { name: 'Order', schema: OrderSchema },
    ]),
  ],
  controllers: [RecordController, OrderController],
  providers: [RecordService, OrderService, MusicBrainzService, RetryService],
})
export class RecordModule {}
