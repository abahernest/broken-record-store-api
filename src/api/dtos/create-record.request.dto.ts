import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RecordFormat, RecordCategory } from '../schemas/record.enum';

/**
 * DTO for creating a new record
 * Validates and documents the required fields for record creation
 */
export class CreateRecordRequestDTO {
  @ApiProperty({
    description: 'Artist of the record',
    type: String,
    example: 'Sisters of Mercy',
  })
  @IsString()
  @IsNotEmpty()
  artist: string;

  @ApiProperty({
    description: 'Album name',
    type: String,
    example: 'First and Last and Always',
  })
  @IsString()
  @IsNotEmpty()
  album: string;

  @ApiProperty({
    description: 'Price of the record',
    type: Number,
    example: 30,
  })
  @IsNumber()
  @Min(0)
  @Max(10000)
  price: number;

  @ApiProperty({
    description: 'Quantity of the record in stock',
    type: Number,
    example: 1000,
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  qty: number;

  @ApiProperty({
    description: 'Format of the record (Vinyl, CD, etc.)',
    enum: RecordFormat,
    example: RecordFormat.VINYL,
  })
  @IsEnum(RecordFormat)
  @IsNotEmpty()
  format: RecordFormat;

  @ApiProperty({
    description: 'Category or genre of the record (e.g., Rock, Jazz)',
    enum: RecordCategory,
    example: RecordCategory.ALTERNATIVE,
  })
  @IsEnum(RecordCategory)
  @IsNotEmpty()
  category: RecordCategory;

  @ApiProperty({
    description: 'Musicbrainz identifier',
    type: String,
    example: '63823c15-6abc-473e-9fad-d0d0fa983b34',
  })
  @IsOptional()
  mbid?: string;
}
