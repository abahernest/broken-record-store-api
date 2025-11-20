import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Inject,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Record, RecordDocument } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { MusicBrainzService } from '../utils/music_brainz.service';
import {
  PaginatedResponse,
  PaginationQueryDTO,
} from '../dtos/pagination.query.dto';
import { FilterRecordDTO } from '../dtos/filter-record.dto';
import { FindByIdentifiersDTO } from '../dtos/find-by-identifiers.dto';
import { RecordFormat, RecordCategory } from '../schemas/record.enum';
import * as crypto from 'crypto';
import { AppConfig } from '../../app.config';
import { Connection } from 'mongoose';

@Injectable()
export class RecordService {
  private readonly logger = new Logger(RecordService.name);

  constructor(
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    private readonly musicBrainzService: MusicBrainzService,
    @Inject('CACHE_MANAGER') private readonly cacheManager: any,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private buildCacheKey(
    filtersDto: FilterRecordDTO,
    paginationDto: PaginationQueryDTO,
  ) {
    const parts: string[] = [];
    const keys = ['q', 'artist', 'album', 'format', 'category'];
    for (const k of keys) {
      parts.push(`${k}=${String((filtersDto as any)[k] ?? '')}`);
    }
    parts.push(`page=${paginationDto.page || 1}`);
    parts.push(`limit=${paginationDto.limit || 10}`);
    const raw = `records:${parts.join('|')}`;
    return 'records:' + crypto.createHash('sha1').update(raw).digest('hex');
  }

  private async invalidateRecordsCache(): Promise<void> {
    try {
      const store: any = (this.cacheManager as any).store;
      const client = store && store.getClient ? store.getClient() : null;
      if (client) {
        // Prefer keys() if available (works with ioredis and node-redis)
        if (typeof client.keys === 'function') {
          const keys = await client.keys('records:*');
          if (keys && keys.length > 0) {
            await client.del(...keys);
          }
          return;
        }

        // Fallback: try SCAN
        if (typeof client.scan === 'function') {
          let cursor = '0';
          do {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const res = await client.scan(
              cursor,
              'MATCH',
              'records:*',
              'COUNT',
              100,
            );
            cursor = res[0];
            const keys = res[1];
            if (keys && keys.length) await client.del(...keys);
          } while (cursor !== '0');
          return;
        }
      }

      // If no client available, reset the entire cache (in-memory store)
      if (
        this.cacheManager &&
        typeof (this.cacheManager as any).reset === 'function'
      ) {
        await (this.cacheManager as any).reset();
      }
    } catch (err) {
      // ignore cache invalidation errors
    }
  }

  /**
   * Find a record by identifiers (mbid, artist, album, format)
   * Returns the first matching record or null if not found
   */
  async findByIdentifiers(
    identifiersDto: FindByIdentifiersDTO,
  ): Promise<RecordDocument | null> {
    // Prefer exact MBID match when provided
    if (identifiersDto.mbid) {
      return this.recordModel.findOne({ mbid: identifiersDto.mbid }).exec();
    }

    // Only search by artist+album+format when all three are provided.
    // This avoids partial-key matches (e.g. only artist) which can produce
    // false positives when format or album is missing.
    if (
      identifiersDto.artist &&
      identifiersDto.album &&
      typeof identifiersDto.format !== 'undefined'
    ) {
      return this.recordModel
        .findOne({
          artist: identifiersDto.artist,
          album: identifiersDto.album,
          format: identifiersDto.format,
        })
        .exec();
    }

    // Not enough identifiers to search safely
    return null;
  }

  /**
   * Create a new record. If an MBID is provided, fetch tracklist from MusicBrainz
   * Provider data (format, category, album) overrides user input when MBID is provided
   */
  async create(createDto: CreateRecordRequestDTO): Promise<Record> {
    const session = await this.connection.startSession();

    try {
      // Check if a record with the same identifiers already exists
      const identifiersDto: FindByIdentifiersDTO = {
        mbid: createDto.mbid,
        artist: createDto.artist,
        album: createDto.album,
        format: createDto.format,
      };

      session.startTransaction();

      const existingRecord = await this.findByIdentifiers(identifiersDto);

      if (existingRecord) {
        await session.abortTransaction();
        throw new ConflictException({
          message: 'Record with these identifiers already exists',
          existing: {
            id: existingRecord._id,
            artist: existingRecord.artist,
            album: existingRecord.album,
            format: existingRecord.format,
            mbid: existingRecord.mbid,
          },
        });
      }

      const base = {
        artist: createDto.artist,
        album: createDto.album,
        price: createDto.price,
        qty: createDto.qty,
        format: createDto.format,
        category: createDto.category,
        mbid: createDto.mbid,
        tracklist: [],
      } as any;

      if (createDto.mbid) {
        await this.attachProviderDataToRecord(createDto.mbid, base);
      }

      const created = await this.recordModel.create(base);
      await session.commitTransaction();

      // Invalidate list caches
      try {
        await this.invalidateRecordsCache();
      } catch (err) {
        // ignore
      }

      return created;
    } catch (error) {
      // Ensure transaction is aborted on any error
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (err) {
          this.logger.error('Failed to abort transaction', err);
        }
      }

      this.logger.error(
        `Record creation failed: ${error.message}`,
        error.stack,
      );

      // Re-throw known exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Wrap unknown errors
      throw new InternalServerErrorException(
        `Failed to create record: ${error.message}`,
      );
    } finally {
      // Always end session
      await session.endSession();
    }
  }

  private async attachProviderDataToRecord(
    mbid: string,
    record: Record,
  ): Promise<any> {
    try {
      const release = await this.musicBrainzService.getReleaseById(mbid);

      // Use provider data as source of truth for these fields
      record.album = release.title;
      record.category = release.genre as RecordCategory;
      if (release.media?.format) {
        record.format = release.media.format as RecordFormat;
      }
      record.tracklist = release.media?.tracks || [];
    } catch (err) {
      // Handle provider error
      if (err instanceof HttpException) {
        const status = err.getStatus
          ? err.getStatus()
          : HttpStatus.SERVICE_UNAVAILABLE;
        const resp = err.getResponse
          ? err.getResponse()
          : { message: String(err.message || 'Provider error') };
        throw new HttpException(
          {
            message: 'Failed to fetch data from MusicBrainz. Try again later.',
            provider: 'MusicBrainz',
            providerResponse: resp,
          },
          status,
        );
      }

      throw new InternalServerErrorException('Failed to fetch MBID data');
    }
  }

  /**
   * Get a single record by ID
   */
  async findById(id: string): Promise<Record | null> {
    return this.recordModel.findById(id).exec();
  }

  /**
   * Find all records with optional filters, full-text search, and pagination
   * Uses MongoDB aggregation pipeline with $facet to combine count and paginated results in a single query
   * Supports filtering by artist, album, format, category
   * Supports full-text search via the 'q' parameter using MongoDB text search
   * Supports pagination via page and limit parameters
   */
  async findAll(
    filtersDto: FilterRecordDTO,
    paginationDto: PaginationQueryDTO,
  ): Promise<PaginatedResponse<Record>> {
    // Build cache key and try to return cached result first
    try {
      const cacheKey = this.buildCacheKey(filtersDto, paginationDto);
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        return cached as PaginatedResponse<Record>;
      }
    } catch (err) {
      // ignore cache read errors
    }

    // Build match query from filters
    const query: any = {};

    // Add exact match filters
    if (filtersDto.artist) {
      query.artist = filtersDto.artist;
    }

    if (filtersDto.album) {
      query.album = filtersDto.album;
    }

    if (filtersDto.format) {
      query.format = filtersDto.format;
    }

    if (filtersDto.category) {
      query.category = filtersDto.category;
    }

    // Add full-text search if query string provided
    if (filtersDto.q) {
      query.$text = { $search: filtersDto.q };
    }

    // Extract pagination parameters
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const skip = (page - 1) * limit;

    // Build aggregation pipeline using $facet to get both count and paginated data in one round-trip
    const pipeline: any[] = [];

    // Add match stage if filters exist
    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query });
    }

    // Build data pipeline for pagination
    const dataPipeline: any[] = [];
    // If text search was performed, sort by relevance score
    if (filtersDto.q) {
      dataPipeline.push({ $sort: { score: { $meta: 'textScore' } } });
    }
    dataPipeline.push(
      {
        $project: {
          id: 1,
          artist: 1,
          album: 1,
          price: 1,
          quantity: 1,
          format: 1,
          category: 1,
          createdAt: 1,
          tracks: { $size: '$tracklist' },
        },
      },
      { $skip: skip },
      { $limit: limit },
    );

    // Add facet stage to split into metadata (count) and data (paginated results)
    const facetStage = {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: dataPipeline,
      },
    };

    pipeline.push(facetStage);

    // Execute aggregation pipeline
    const aggResult = await this.recordModel.aggregate(pipeline).exec();

    // Extract metadata and data from facet result
    const facetResult = aggResult[0] || {};
    const metadata = facetResult.metadata?.[0] || { total: 0 };
    const total = metadata.total;
    const data = facetResult.data || [];

    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    const result: PaginatedResponse<Record> = {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore,
      },
    };

    // Store in cache
    try {
      const cacheKey = this.buildCacheKey(filtersDto, paginationDto);
      // cache-manager supports (key, value, ttl) or options depending on store
      await (this.cacheManager as any).set(cacheKey, result, {
        ttl: AppConfig.cacheTtl,
      });
    } catch (err) {
      console.warn('Failed to write records cache:', err);
    }
    return result;
  }

  /**
   * Update an existing record. If MBID changed, re-fetch tracklist and override format/category/album from provider.
   */
  async update(id: string, updateDto: UpdateRecordRequestDTO): Promise<Record> {
    const record = await this.recordModel.findById(id);
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    // If MBID provided and different from current, fetch new tracklist and override provider fields
    if (updateDto.mbid && updateDto.mbid !== record.mbid) {
      try {
        const release = await this.musicBrainzService.getReleaseById(
          updateDto.mbid,
        );

        // Use provider data as source of truth for these fields
        record.album = release.title;
        record.category = release.genre as RecordCategory;
        if (release.media?.format) {
          record.format = release.media.format as RecordFormat;
        }
        record.tracklist = release.media?.tracks || [];
        record.mbid = updateDto.mbid;
      } catch (err) {
        if (err instanceof HttpException) {
          const status = err.getStatus
            ? err.getStatus()
            : HttpStatus.SERVICE_UNAVAILABLE;
          const resp = err.getResponse
            ? err.getResponse()
            : { message: String(err.message || 'Provider error') };
          throw new HttpException(
            {
              message: 'Failed to fetch data from MusicBrainz',
              provider: 'MusicBrainz',
              providerResponse: resp,
            },
            status,
          );
        }

        throw new InternalServerErrorException('Failed to fetch MBID data');
      }
    }

    // Apply other updates (excluding format/category/album if MBID is present, as those come from provider)
    const updatableFields: Array<keyof UpdateRecordRequestDTO> = [
      'artist',
      'album',
      'price',
      'qty',
      'format',
      'category',
    ];

    updatableFields.forEach((field) => {
      // Skip these fields if MBID was updated (they come from provider)
      if (
        updateDto.mbid &&
        (field === 'album' || field === 'category' || field === 'format')
      ) {
        return;
      }

      if (typeof updateDto[field] !== 'undefined') {
        // @ts-expect-error: dynamic assignment of update fields
        record[field] = updateDto[field] as any;
      }
    });

    await record.save();

    // Invalidate list caches
    try {
      await this.invalidateRecordsCache();
    } catch (err) {
      console.warn('Failed to invalidate records cache:', err);
    }

    return record;
  }
}
