import { IsNotEmpty, IsInt, Min, Max, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating a new order
 * Validates and documents the required fields for order creation
 */
export class CreateOrderRequestDTO {
  @ApiProperty({
    description: 'MongoDB ObjectId of the record being ordered',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsNotEmpty()
  recordId: string;

  @ApiProperty({
    description: 'Quantity of records to order (1-1000)',
    type: Number,
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}
