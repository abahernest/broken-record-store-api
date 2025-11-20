import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for filtering records in the findAll operation
 * Encapsulates all search/filter parameters to reduce method signature complexity
 */
export class FilterRecordDTO {
  @IsOptional()
  @IsString({ message: 'q must be a string' })
  q?: string;

  @IsOptional()
  @IsString({ message: 'artist must be a string' })
  artist?: string;

  @IsOptional()
  @IsString({ message: 'album must be a string' })
  album?: string;

  @IsOptional()
  @IsString({ message: 'format must be a string' })
  format?: string;

  @IsOptional()
  @IsString({ message: 'category must be a string' })
  category?: string;
}
