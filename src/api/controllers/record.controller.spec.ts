import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { RecordService } from '../services/record.service';
import { getModelToken } from '@nestjs/mongoose';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RecordController', () => {
  let recordController: RecordController;
  let recordService: RecordService;

  const mockRecordService = {
    create: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
  };

  const mockRecordModel = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordController],
      providers: [
        { provide: RecordService, useValue: mockRecordService },
        {
          provide: getModelToken('Record'),
          useValue: mockRecordModel,
        },
      ],
    }).compile();

    recordController = module.get<RecordController>(RecordController);
    recordService = module.get<RecordService>(RecordService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new record without MBID', async () => {
      const createRecordDto: CreateRecordRequestDTO = {
        artist: 'Test Artist',
        album: 'Test Album',
        price: 100,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const savedRecord = {
        _id: '1',
        artist: 'Test Artist',
        album: 'Test Album',
        price: 100,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        tracklist: [],
      } as any;

      mockRecordService.create.mockResolvedValue(savedRecord);

      const result = await recordController.create(createRecordDto);

      expect(recordService.create).toHaveBeenCalledWith(createRecordDto);
      expect(result).toEqual(savedRecord);
    });

    it('should create a new record with MBID and populate tracklist', async () => {
      const createRecordDto: CreateRecordRequestDTO = {
        artist: 'Beatles',
        album: 'Abbey Road',
        price: 150,
        qty: 5,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      };

      const savedRecord = {
        _id: '2',
        artist: 'Beatles',
        album: 'Abbey Road',
        price: 150,
        qty: 5,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
        tracklist: [
          { id: 't1', title: 'Come Together', position: '1', length: '259333' },
          { id: 't2', title: 'Something', position: '2', length: '183226' },
        ],
      } as any;

      mockRecordService.create.mockResolvedValue(savedRecord);

      const result = await recordController.create(createRecordDto);

      expect(recordService.create).toHaveBeenCalledWith(createRecordDto);
      expect(result.tracklist).toHaveLength(2);
      expect(result).toEqual(savedRecord);
    });

    it('should reject duplicate records with CONFLICT status', async () => {
      const createRecordDto: CreateRecordRequestDTO = {
        artist: 'Beatles',
        album: 'Abbey Road',
        price: 150,
        qty: 5,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const conflictError = new HttpException(
        'Record with this identifier already exists',
        HttpStatus.CONFLICT,
      );

      mockRecordService.create.mockRejectedValue(conflictError);

      await expect(recordController.create(createRecordDto)).rejects.toThrow(
        conflictError,
      );

      expect(recordService.create).toHaveBeenCalledWith(createRecordDto);
    });
  });

  describe('update', () => {
    it('should update a record', async () => {
      const recordId = '1';
      const updateRecordDto: UpdateRecordRequestDTO = {
        artist: 'Updated Artist',
        price: 200,
      };

      const updatedRecord = {
        _id: recordId,
        artist: 'Updated Artist',
        album: 'Test Album',
        price: 200,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        tracklist: [],
      } as any;

      mockRecordService.update.mockResolvedValue(updatedRecord);

      const result = await recordController.update(recordId, updateRecordDto);

      expect(recordService.update).toHaveBeenCalledWith(
        recordId,
        updateRecordDto,
      );
      expect(result).toEqual(updatedRecord);
    });

    it('should update MBID and refresh tracklist', async () => {
      const recordId = '1';
      const updateRecordDto: UpdateRecordRequestDTO = {
        mbid: 'new-mbid-123',
      };

      const updatedRecord = {
        _id: recordId,
        artist: 'Beatles',
        album: 'Abbey Road',
        price: 150,
        qty: 5,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        mbid: 'new-mbid-123',
        tracklist: [
          { id: 't1', title: 'Track 1', position: '1', length: '200000' },
        ],
      } as any;

      mockRecordService.update.mockResolvedValue(updatedRecord);

      const result = await recordController.update(recordId, updateRecordDto);

      expect(recordService.update).toHaveBeenCalledWith(
        recordId,
        updateRecordDto,
      );
      expect(result.mbid).toBe('new-mbid-123');
      expect(result.tracklist).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('should return paginated records with default pagination', async () => {
      const records = [
        {
          _id: '1',
          artist: 'Artist 1',
          album: 'Album 1',
          price: 100,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
          tracklist: [],
        },
        {
          _id: '2',
          artist: 'Artist 2',
          album: 'Album 2',
          price: 200,
          qty: 20,
          format: RecordFormat.CD,
          category: RecordCategory.JAZZ,
          tracklist: [],
        },
      ] as any;

      const paginatedResponse = {
        data: records,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasMore: false,
        },
      };

      mockRecordService.findAll = jest
        .fn()
        .mockResolvedValue(paginatedResponse);

      const result = await recordController.findAll();

      expect(result.data).toEqual(records);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(mockRecordService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          q: undefined,
          artist: undefined,
          album: undefined,
          format: undefined,
          category: undefined,
        }),
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });

    it('should filter records by artist with pagination', async () => {
      const filteredRecords = [
        {
          _id: '1',
          artist: 'Beatles',
          album: 'Abbey Road',
          price: 100,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
          tracklist: [],
        },
      ] as any;

      const paginatedResponse = {
        data: filteredRecords,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
      };

      mockRecordService.findAll = jest
        .fn()
        .mockResolvedValue(paginatedResponse);

      const result = await recordController.findAll(undefined, 'Beatles');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].artist).toBe('Beatles');
      expect(mockRecordService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: 'Beatles',
        }),
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });

    it('should filter records by category with pagination', async () => {
      const filteredRecords = [
        {
          _id: '2',
          artist: 'Miles Davis',
          album: 'Kind of Blue',
          price: 200,
          qty: 20,
          format: RecordFormat.VINYL,
          category: RecordCategory.JAZZ,
          tracklist: [],
        },
      ] as any;

      const paginatedResponse = {
        data: filteredRecords,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
      };

      mockRecordService.findAll = jest
        .fn()
        .mockResolvedValue(paginatedResponse);

      const result = await recordController.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        RecordCategory.JAZZ,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].category).toBe(RecordCategory.JAZZ);
      expect(mockRecordService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: RecordCategory.JAZZ,
        }),
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });

    it('should apply custom page and limit parameters', async () => {
      const records = [
        {
          _id: '11',
          artist: 'Artist 11',
          album: 'Album 11',
          price: 100,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
          tracklist: [],
        },
      ] as any;

      const paginatedResponse = {
        data: records,
        pagination: {
          page: 2,
          limit: 5,
          total: 25,
          totalPages: 5,
          hasMore: true,
        },
      };

      mockRecordService.findAll = jest
        .fn()
        .mockResolvedValue(paginatedResponse);

      const result = await recordController.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        2,
        5,
      );

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.hasMore).toBe(true);
      expect(mockRecordService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          q: undefined,
          artist: undefined,
          album: undefined,
          format: undefined,
          category: undefined,
        }),
        expect.objectContaining({
          page: 2,
          limit: 5,
        }),
      );
    });

    describe('findOne', () => {
      it('should return a record by id', async () => {
        const recordId = 'abc123';
        const savedRecord = {
          _id: recordId,
          artist: 'Test Artist',
          album: 'Test Album',
        } as any;

        mockRecordService.findById = jest.fn().mockResolvedValue(savedRecord);

        const result = await recordController.findOne(recordId);

        expect(recordService.findById).toHaveBeenCalledWith(recordId);
        expect(result).toEqual(savedRecord);
      });

      it('should throw NotFoundException when record is not found', async () => {
        const recordId = 'nonexistent';
        mockRecordService.findById = jest.fn().mockResolvedValue(null);

        await expect(recordController.findOne(recordId)).rejects.toThrow();
        expect(recordService.findById).toHaveBeenCalledWith(recordId);
      });
    });
  });
});
