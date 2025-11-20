import { IsOptional, IsUUID, IsString } from 'class-validator';

/**
 * DTO for finding records by identifiers
 * Encapsulates all identifier-based search parameters to reduce method signature complexity
 */
export class FindByIdentifiersDTO {
  @IsOptional()
  @IsUUID('4', { message: 'mbid must be a valid UUID v4' })
  mbid?: string;

  @IsOptional()
  @IsString({ message: 'artist must be a string' })
  artist?: string;

  @IsOptional()
  @IsString({ message: 'album must be a string' })
  album?: string;

  @IsOptional()
  @IsString({ message: 'format must be a string' })
  format?: string;
}
