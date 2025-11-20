import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for order response
 * Contains all order details including validation results
 */
export class OrderResponseDTO {
  @ApiProperty({
    description: 'Order ID',
    type: String,
    example: '507f1f77bcf86cd799439012',
  })
  _id: string;

  @ApiProperty({
    description: 'Record ID that was ordered',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  recordId: string;

  @ApiProperty({
    description: 'Quantity ordered',
    type: Number,
    example: 5,
  })
  quantity: number;

  @ApiProperty({
    description: 'Order status (pending, confirmed, cancelled)',
    enum: ['pending', 'confirmed', 'cancelled'],
    example: 'pending',
  })
  status: string;

  @ApiProperty({
    description: 'Available quantity at time of order',
    type: Number,
    example: 10,
  })
  availableQuantity: number;

  @ApiProperty({
    description: 'Whether there was sufficient stock at time of order',
    type: Boolean,
    example: true,
  })
  sufficientStock: boolean;
}
