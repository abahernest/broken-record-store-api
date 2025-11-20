import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Order Schema
 * Represents an order for records with transactional support
 */
@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'Record', required: true })
  recordId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 1000 })
  quantity: number;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed', 'cancelled'] })
  status: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

export type OrderDocument = HydratedDocument<Order>;

// Index on recordId for efficient lookups
OrderSchema.index({ recordId: 1 });

// Index on status for filtering orders
OrderSchema.index({ status: 1 });

// Index on createdAt for sorting by date
OrderSchema.index({ createdAt: -1 });

// Compound index for efficient order retrieval by record and status
OrderSchema.index({ recordId: 1, status: 1 });
