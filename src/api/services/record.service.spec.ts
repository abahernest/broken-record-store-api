import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RecordService } from './record.service';
import { MusicBrainzService } from '../utils/music_brainz.service';
import { HttpException } from '@nestjs/common';
import { FindByIdentifiersDTO } from '../dtos/find-by-identifiers.dto';
import { FilterRecordDTO } from '../dtos/filter-record.dto';
import { PaginationQueryDTO } from '../dtos/pagination.query.dto';

describe('RecordService', () => {
  let service: RecordService;
  const mockModel = {
    create: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  } as any;

  const mockMusic = {
    getReleaseById: jest.fn(),
  } as any;

  beforeEach(async () => {
    const mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    } as any;
    const mockSession: any = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
    };

    const mockConnection: any = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordService,
        { provide: getModelToken('Record'), useValue: mockModel },
        { provide: MusicBrainzService, useValue: mockMusic },
        { provide: 'CACHE_MANAGER', useValue: mockCache },
        { provide: 'DatabaseConnection', useValue: mockConnection },
      ],
    }).compile();

    service = module.get<RecordService>(RecordService);
    mockModel.create.mockReset();
    mockModel.findById.mockReset();
    mockModel.findOne.mockReset();
    mockModel.find.mockReset();
    mockModel.countDocuments.mockReset();
    mockModel.aggregate.mockReset();
    mockMusic.getReleaseById.mockReset();

    // Setup findOne to return an object with exec method
    mockModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    // ensure any session.startSession calls resolve to our mockSession
    // attach mockConnection to service if present
    // (some tests will assert on transaction methods by toggling inTransaction)
    (service as any).connection = mockConnection;

    // Setup countDocuments to return 0 by default
    mockModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
  });

  it('creates a record and overrides fields from provider when mbid provided', async () => {
    const createDto: any = {
      artist: 'User-Provided Artist',
      album: 'User-Provided Album',
      price: 10,
      qty: 5,
      format: 'CD',
      category: 'Pop',
      mbid: '12345678-1234-1234-1234-123456789012',
    };

    // Provider returns different values - these should override user input
    const release = {
      id: '12345678-1234-1234-1234-123456789012',
      title: 'Abbey Road', // Should override album
      artist: 'The Beatles',
      genre: 'Rock', // Should override category
      media: {
        format: 'Vinyl', // Should override format
        tracks: [
          {
            id: 't1',
            title: 'Come Together',
            position: '1',
            length: '259000',
          },
        ],
      },
    };

    mockMusic.getReleaseById.mockResolvedValue(release);

    // Mock the returned created record to show overridden values
    mockModel.create.mockResolvedValue({
      ...createDto,
      album: 'Abbey Road', // Provider override
      category: 'Rock', // Provider override
      format: 'Vinyl', // Provider override
      tracklist: release.media.tracks,
    });

    // ensure session inTransaction false for normal create
    (service as any).connection.startSession.mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
    });

    await service.create(createDto);

    expect(mockMusic.getReleaseById).toHaveBeenCalledWith(
      '12345678-1234-1234-1234-123456789012',
    );
    expect(mockModel.create).toHaveBeenCalled();

    // Verify that create was called with provider-overridden values
    const createCallArgs = mockModel.create.mock.calls[0][0];
    expect(createCallArgs.album).toBe('Abbey Road'); // Provider value
    expect(createCallArgs.category).toBe('Rock'); // Provider value
    expect(createCallArgs.format).toBe('Vinyl'); // Provider value
    expect(createCallArgs.tracklist).toBe(release.media.tracks);
  });

  it('updates a record and overrides fields from provider when mbid changes', async () => {
    const id = 'rec1';
    const oldRecord: any = {
      _id: id,
      artist: 'Old Artist',
      album: 'Old Album',
      category: 'Jazz',
      format: 'CD',
      mbid: 'old-mbid',
      tracklist: [],
      save: jest.fn().mockResolvedValue(true),
    };

    const updateDto: any = {
      mbid: '12345678-1234-1234-1234-123456789012',
      artist: 'New Artist',
      album: 'User Album', // Will be overridden
      category: 'User Category', // Will be overridden
      format: 'User Format', // Will be overridden
    };

    const release = {
      id: '12345678-1234-1234-1234-123456789012',
      title: 'Abbey Road', // Should override album
      genre: 'Rock', // Should override category
      media: {
        format: 'Vinyl', // Should override format
        tracks: [{ id: 't2', title: 'Something', position: '2' }],
      },
    };

    mockModel.findById.mockResolvedValue(oldRecord);
    mockMusic.getReleaseById.mockResolvedValue(release);

    const updated = await service.update(id, updateDto);

    expect(mockModel.findById).toHaveBeenCalledWith(id);
    expect(mockMusic.getReleaseById).toHaveBeenCalledWith(
      '12345678-1234-1234-1234-123456789012',
    );

    // Provider values should override user values
    expect(updated.album).toBe('Abbey Road');
    expect(updated.category).toBe('Rock');
    expect(updated.format).toBe('Vinyl');
    expect(updated.tracklist).toBe(release.media.tracks);
    expect(updated.mbid).toBe('12345678-1234-1234-1234-123456789012');
    expect(updated.artist).toBe('New Artist'); // User value preserved
    expect(oldRecord.save).toHaveBeenCalled();
  });

  it('creates a record and populates tracklist when mbid provided', async () => {
    const createDto: any = {
      artist: 'Artist',
      album: 'Album',
      price: 10,
      qty: 5,
      format: 'CD',
      category: 'Rock',
      mbid: '12345678-1234-1234-1234-123456789012',
    };

    const release = {
      id: '12345678-1234-1234-1234-123456789012',
      title: 'Album Title',
      genre: 'Rock',
      media: {
        format: 'Vinyl',
        tracks: [
          {
            id: 't1',
            title: 'Track 1',
            position: '1',
            length: '200000',
          },
        ],
      },
    };

    mockMusic.getReleaseById.mockResolvedValue(release);
    mockModel.create.mockResolvedValue({
      ...createDto,
      tracklist: release.media.tracks,
    });

    (service as any).connection.startSession.mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
    });

    const res = await service.create(createDto);

    expect(mockMusic.getReleaseById).toHaveBeenCalledWith(
      '12345678-1234-1234-1234-123456789012',
    );
    expect(mockModel.create).toHaveBeenCalled();
    expect(res.tracklist).toBeDefined();
  });

  it('updates an existing record and refreshes tracklist when mbid changes', async () => {
    const id = 'rec1';
    const oldRecord: any = {
      _id: id,
      mbid: 'old-mbid',
      tracklist: [],
      save: jest.fn().mockResolvedValue(true),
    };

    const updateDto: any = {
      mbid: '12345678-1234-1234-1234-123456789012',
      artist: 'New Artist',
    };

    const release = {
      id: '12345678-1234-1234-1234-123456789012',
      title: 'New Title',
      genre: 'Rock',
      media: {
        format: 'Vinyl',
        tracks: [{ id: 't2', title: 'New Track' }],
      },
    };

    mockModel.findById.mockResolvedValue(oldRecord);
    mockMusic.getReleaseById.mockResolvedValue(release);

    const updated = await service.update(id, updateDto);

    expect(mockModel.findById).toHaveBeenCalledWith(id);
    expect(mockMusic.getReleaseById).toHaveBeenCalledWith(
      '12345678-1234-1234-1234-123456789012',
    );
    expect(oldRecord.save).toHaveBeenCalled();
    expect(updated.mbid).toBe('12345678-1234-1234-1234-123456789012');
  });

  it('throws provider-aware error when MBID fetch fails on create', async () => {
    const createDto: any = {
      artist: 'A',
      album: 'B',
      price: 1,
      qty: 1,
      format: 'VINYL',
      category: 'ROCK',
      mbid: 'bad-mbid',
    };

    mockMusic.getReleaseById.mockRejectedValue(
      new HttpException({ message: 'Not found' }, 404),
    );

    // The service wraps provider HttpException into an InternalServerErrorException
    // because create() catches non-NotFound/BadRequest errors and wraps them.
    await expect(service.create(createDto)).rejects.toMatchObject({
      status: 500,
    });
  });

  it('throws CONFLICT error when record already exists', async () => {
    const createDto: any = {
      artist: 'Beatles',
      album: 'Abbey Road',
      price: 100,
      qty: 5,
      format: 'VINYL',
      category: 'ROCK',
      mbid: 'mbid-1',
    };

    const existingRecord = {
      _id: 'existing-id',
      artist: 'Beatles',
      album: 'Abbey Road',
      format: 'VINYL',
      mbid: 'mbid-1',
    } as any;

    mockModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(existingRecord),
    });

    // ensure session reports inTransaction so abortTransaction path is hit
    const sess: any = await (service as any).connection.startSession();
    sess.inTransaction = jest.fn().mockReturnValue(true);

    await expect(service.create(createDto)).rejects.toMatchObject({
      status: 409,
    });

    expect(sess.abortTransaction).toHaveBeenCalled();
    expect(sess.endSession).toHaveBeenCalled();
  });

  describe('findByIdentifiers', () => {
    it('should find record by mbid using DTO', async () => {
      const record = {
        _id: '1',
        artist: 'Artist',
        album: 'Album',
        format: 'Vinyl',
        mbid: 'mbid-1',
      } as any;

      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(record),
      });

      const identifiersDto: FindByIdentifiersDTO = {
        mbid: 'mbid-1',
      };

      const result = await service.findByIdentifiers(identifiersDto);

      expect(mockModel.findOne).toHaveBeenCalledWith({ mbid: 'mbid-1' });
      expect(result).toEqual(record);
    });

    it('should find record by artist and album using DTO', async () => {
      const record = {
        _id: '1',
        artist: 'Beatles',
        album: 'Abbey Road',
        format: 'Vinyl',
      } as any;

      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(record),
      });

      const identifiersDto: FindByIdentifiersDTO = {
        artist: 'Beatles',
        album: 'Abbey Road',
        format: 'Vinyl',
      };

      const result = await service.findByIdentifiers(identifiersDto);

      expect(mockModel.findOne).toHaveBeenCalledWith({
        artist: 'Beatles',
        album: 'Abbey Road',
        format: 'Vinyl',
      });
      expect(result).toEqual(record);
    });

    it('should return null when no identifiers provided', async () => {
      const identifiersDto: FindByIdentifiersDTO = {};

      const result = await service.findByIdentifiers(identifiersDto);
      expect(result).toBeNull();
      expect(mockModel.findOne).not.toHaveBeenCalled();
    });

    it('should find record by all identifiers', async () => {
      const record = {
        _id: '1',
        artist: 'Beatles',
        album: 'Abbey Road',
        format: 'Vinyl',
        mbid: 'mbid-1',
      } as any;

      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(record),
      });

      const identifiersDto: FindByIdentifiersDTO = {
        mbid: 'mbid-1',
        artist: 'Beatles',
        album: 'Abbey Road',
        format: 'Vinyl',
      };

      const result = await service.findByIdentifiers(identifiersDto);

      // When MBID is provided, the service prefers an exact MBID match.
      expect(mockModel.findOne).toHaveBeenCalledWith({ mbid: 'mbid-1' });
      expect(result).toEqual(record);
    });
  });

  describe('findById', () => {
    it('should find record by id', async () => {
      const record = {
        _id: '1',
        artist: 'Artist',
        album: 'Album',
      } as any;

      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(record),
      });

      const result = await service.findById('1');

      expect(mockModel.findById).toHaveBeenCalledWith('1');
      expect(result).toEqual(record);
    });

    it('should return null when record not found', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findById('missing');

      expect(mockModel.findById).toHaveBeenCalledWith('missing');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated records with default pagination', async () => {
      const records = [
        { _id: '1', artist: 'Artist 1', album: 'Album 1' },
        { _id: '2', artist: 'Artist 2', album: 'Album 2' },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 2 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = {};
      const paginationDto: PaginationQueryDTO = { page: 1, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasMore: false,
      });
    });

    it('should apply skip and limit for pagination', async () => {
      mockModel.aggregate.mockClear();

      const records = [
        { _id: '3', artist: 'Artist 3', album: 'Album 3' },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 25 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = {};
      const paginationDto: PaginationQueryDTO = { page: 2, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(mockModel.aggregate).toHaveBeenCalled();
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      const facetStage = pipeline.find((stage: any) => stage.$facet);
      expect(facetStage).toBeDefined();
      const dataPipeline = facetStage.$facet.data;
      expect(dataPipeline).toContainEqual({ $skip: 10 });
      expect(dataPipeline).toContainEqual({ $limit: 10 });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('should filter by query string using text search', async () => {
      mockModel.aggregate.mockClear();

      const records = [
        { _id: '1', artist: 'Beatles', album: 'Abbey Road' },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 1 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = { q: 'Beatles' };
      const paginationDto: PaginationQueryDTO = { page: 1, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(mockModel.aggregate).toHaveBeenCalled();
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      const matchStage = pipeline.find((stage: any) => stage.$match);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match).toEqual({
        $text: { $search: 'Beatles' },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].artist).toBe('Beatles');
    });

    it('should filter by exact artist and format', async () => {
      mockModel.aggregate.mockClear();

      const records = [
        {
          _id: '1',
          artist: 'Beatles',
          format: 'Vinyl',
          album: 'Abbey Road',
        },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 1 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = {
        artist: 'Beatles',
        format: 'Vinyl',
      };
      const paginationDto: PaginationQueryDTO = { page: 1, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(mockModel.aggregate).toHaveBeenCalled();
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      const matchStage = pipeline.find((stage: any) => stage.$match);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match).toEqual({
        artist: 'Beatles',
        format: 'Vinyl',
      });

      expect(result.data).toEqual(records);
    });

    it('should combine text search with exact filters and pagination', async () => {
      mockModel.aggregate.mockClear();

      const records = [
        {
          _id: '1',
          artist: 'Beatles',
          album: 'Abbey Road',
          format: 'Vinyl',
        },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 1 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = {
        q: 'Beatles',
        album: 'Abbey Road',
        format: 'Vinyl',
      };
      const paginationDto: PaginationQueryDTO = { page: 1, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(mockModel.aggregate).toHaveBeenCalled();
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      const matchStage = pipeline.find((stage: any) => stage.$match);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match).toEqual({
        album: 'Abbey Road',
        format: 'Vinyl',
        $text: { $search: 'Beatles' },
      });

      expect(result.data).toEqual(records);
      expect(result.pagination.total).toBe(1);
    });

    it('should sort by text relevance score when text search is performed', async () => {
      mockModel.aggregate.mockClear();

      const records = [
        { _id: '1', artist: 'Beatles', album: 'Abbey Road' },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 1 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = { q: 'Beatles' };
      const paginationDto: PaginationQueryDTO = { page: 1, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(mockModel.aggregate).toHaveBeenCalled();
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      const facetStage = pipeline.find((stage: any) => stage.$facet);
      expect(facetStage).toBeDefined();
      const dataPipeline = facetStage.$facet.data;
      expect(dataPipeline[0]).toEqual({
        $sort: {
          score: { $meta: 'textScore' },
        },
      });

      expect(result.data).toEqual(records);
    });

    it('should not sort by relevance when no text search', async () => {
      mockModel.aggregate.mockClear();

      const records = [
        { _id: '1', artist: 'Beatles', album: 'Abbey Road' },
      ] as any;

      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            metadata: [{ total: 1 }],
            data: records,
          },
        ]),
      });

      const filtersDto: FilterRecordDTO = { artist: 'Beatles' };
      const paginationDto: PaginationQueryDTO = { page: 1, limit: 10 };

      const result = await service.findAll(filtersDto, paginationDto);

      expect(mockModel.aggregate).toHaveBeenCalled();
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      const facetStage = pipeline.find((stage: any) => stage.$facet);
      expect(facetStage).toBeDefined();
      const dataPipeline = facetStage.$facet.data;
      // Ensure no $sort stage is present when no text search is performed
      const sortStage = dataPipeline.find((s: any) => s.$sort !== undefined);
      expect(sortStage).toBeUndefined();
      expect(result.data).toEqual(records);
    });
  });
});
