import {
  IsString,
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
 * DTO for updating an existing record
 * Validates and documents the fields that can be updated
 */
export class UpdateRecordRequestDTO {
  @ApiProperty({
    description: 'Artist of the record',
    type: String,
    example: 'Sisters of Mercy',
    required: false,
  })
  @IsString()
  @IsOptional()
  artist?: string;

  @ApiProperty({
    description: 'Album name',
    type: String,
    example: 'First and Last and Always',
    required: false,
  })
  @IsString()
  @IsOptional()
  album?: string;

  @ApiProperty({
    description: 'Price of the record',
    type: Number,
    example: 30,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  price?: number;

  @ApiProperty({
    description: 'Quantity of the record in stock',
    type: Number,
    example: 1000,
    required: false,
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  qty?: number;

  @ApiProperty({
    description: 'Format of the record (Vinyl, CD, etc.)',
    enum: RecordFormat,
    example: RecordFormat.VINYL,
    required: false,
  })
  @IsEnum(RecordFormat)
  @IsOptional()
  format?: RecordFormat;

  @ApiProperty({
    description: 'Category or genre of the record (e.g., Rock, Jazz)',
    enum: RecordCategory,
    example: RecordCategory.ALTERNATIVE,
    required: false,
  })
  @IsEnum(RecordCategory)
  @IsOptional()
  category?: RecordCategory;

  @ApiProperty({
    description: 'Musicbrainz identifier',
    type: String,
    example: '63823c15-6abc-473e-9fad-d0d0fa983b34',
    required: false,
  })
  @IsOptional()
  mbid?: string;
}
