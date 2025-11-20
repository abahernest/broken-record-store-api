import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { OrderService } from './order.service';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('OrderService', () => {
  let service: OrderService;
  let mockOrderModel: any;
  let mockRecordModel: any;
  let mockConnection: any;
  let mockSession: any;

  beforeEach(async () => {
    // Mock session
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
    };

    // Mock connection
    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    // Mock Order model - needs to be a constructor and have methods
    mockOrderModel = jest.fn().mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue(data),
    }));
    mockOrderModel.findById = jest.fn();
    mockOrderModel.find = jest.fn();

    // Mock Record model
    mockRecordModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getModelToken('Order'),
          useValue: mockOrderModel,
        },
        {
          provide: getModelToken('Record'),
          useValue: mockRecordModel,
        },
        {
          provide: 'DatabaseConnection',
          useValue: mockConnection,
        },
      ],
    })
      .useMocker((token) => {
        if (token === Connection) {
          return mockConnection;
        }
      })
      .compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('createOrder', () => {
    const createOrderDto = {
      recordId: '507f1f77bcf86cd799439011',
      quantity: 5,
    };

    const mockRecord = {
      _id: '507f1f77bcf86cd799439011',
      artist: 'The Beatles',
      album: 'Abbey Road',
      qty: 10,
      format: 'Vinyl',
      category: 'Rock',
    };

    it('should create an order successfully and decrement record quantity', async () => {
      // Mock the query chain for record lookup
      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockRecord),
      };

      mockRecordModel.findById.mockReturnValue(recordQueryChain);

      // Mock record update query chain
      const updateQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ ...mockRecord, qty: 5 }),
      };

      mockRecordModel.findByIdAndUpdate.mockReturnValue(updateQueryChain);

      // Reset mock implementation for this test
      mockOrderModel.mockImplementation((data) => ({
        ...data,
        save: jest.fn().mockResolvedValue({
          _id: '607f1f77bcf86cd799439010',
          ...data,
        }),
      }));

      const result = await service.createOrder(createOrderDto);

      expect(result).toBeDefined();
      expect(result.recordId).toBe(createOrderDto.recordId);
      expect(result.quantity).toBe(createOrderDto.quantity);
      expect(result.status).toBe('pending');
      expect(result.availableQuantity).toBe(10);
      expect(result.sufficientStock).toBe(true);
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid record ID format', async () => {
      await expect(
        service.createOrder({
          recordId: 'invalid-id',
          quantity: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if record does not exist', async () => {
      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };

      mockRecordModel.findById.mockReturnValue(recordQueryChain);
      mockSession.inTransaction.mockReturnValue(true);

      await expect(service.createOrder(createOrderDto)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if insufficient stock', async () => {
      const insufficientRecord = {
        ...mockRecord,
        qty: 2, // Less than requested quantity
      };

      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(insufficientRecord),
      };

      mockRecordModel.findById.mockReturnValue(recordQueryChain);
      mockSession.inTransaction.mockReturnValue(true);

      await expect(service.createOrder(createOrderDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle transaction errors gracefully', async () => {
      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      mockRecordModel.findById.mockReturnValue(recordQueryChain);
      mockSession.inTransaction.mockReturnValue(true);

      await expect(service.createOrder(createOrderDto)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should allow zero quantity and not change stock', async () => {
      const dto = { ...createOrderDto, quantity: 0 };

      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockRecord),
      };
      mockRecordModel.findById.mockReturnValue(recordQueryChain);

      const updateQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue({ ...mockRecord, qty: mockRecord.qty }),
      };
      mockRecordModel.findByIdAndUpdate.mockReturnValue(updateQueryChain);

      mockOrderModel.mockImplementation((data) => ({
        ...data,
        save: jest.fn().mockResolvedValue({ _id: 'save-zero', ...data }),
      }));

      const result = await service.createOrder(dto);

      expect(result.quantity).toBe(0);
      // verify update called with zero decrement
      const callArgs = mockRecordModel.findByIdAndUpdate.mock.calls[0];
      expect(callArgs[1].$inc.qty).toBeCloseTo(0);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should increment stock when negative quantity provided (edge case)', async () => {
      const dto = { ...createOrderDto, quantity: -1 };

      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockRecord),
      };
      mockRecordModel.findById.mockReturnValue(recordQueryChain);

      const updateQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue({ ...mockRecord, qty: mockRecord.qty + 1 }),
      };
      mockRecordModel.findByIdAndUpdate.mockReturnValue(updateQueryChain);

      mockOrderModel.mockImplementation((data) => ({
        ...data,
        save: jest.fn().mockResolvedValue({ _id: 'save-neg', ...data }),
      }));

      const result = await service.createOrder(dto);

      expect(result.quantity).toBe(-1);
      const callArgs = mockRecordModel.findByIdAndUpdate.mock.calls[0];
      // negative requested quantity results in positive increment to stock
      expect(callArgs[1]).toEqual(
        expect.objectContaining({ $inc: { qty: 1 } }),
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should accept fractional quantity and decrement fractional amount', async () => {
      const dto = { ...createOrderDto, quantity: 1.5 };

      const recordWithFloat = { ...mockRecord, qty: 10 };
      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(recordWithFloat),
      };
      mockRecordModel.findById.mockReturnValue(recordQueryChain);

      const updateQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ ...recordWithFloat, qty: 8.5 }),
      };
      mockRecordModel.findByIdAndUpdate.mockReturnValue(updateQueryChain);

      mockOrderModel.mockImplementation((data) => ({
        ...data,
        save: jest.fn().mockResolvedValue({ _id: 'save-float', ...data }),
      }));

      const result = await service.createOrder(dto);

      expect(result.quantity).toBe(1.5);
      const callArgs = mockRecordModel.findByIdAndUpdate.mock.calls[0];
      expect(callArgs[1]).toEqual(
        expect.objectContaining({ $inc: { qty: -1.5 } }),
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should abort transaction and throw InternalServerError when order.save fails', async () => {
      const recordQueryChain = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockRecord),
      };
      mockRecordModel.findById.mockReturnValue(recordQueryChain);

      // Order save will fail
      mockOrderModel.mockImplementation((data) => ({
        ...data,
        save: jest.fn().mockRejectedValue(new Error('save failed')),
      }));

      // ensure abortTransaction is attempted
      mockSession.inTransaction.mockReturnValue(true);

      await expect(service.createOrder(createOrderDto)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe('getOrderById', () => {
    it('should retrieve an order by ID', async () => {
      const mockOrder = {
        _id: '607f1f77bcf86cd799439012',
        recordId: '507f1f77bcf86cd799439011',
        quantity: 5,
        status: 'pending',
        createdAt: new Date(),
        lastModified: new Date(),
      };

      mockOrderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockOrder),
      });

      const result = await service.getOrderById('607f1f77bcf86cd799439012');

      expect(result).toBeDefined();
      expect(result._id).toBe('607f1f77bcf86cd799439012');
      expect(result.recordId).toBe('507f1f77bcf86cd799439011');
    });

    it('should throw NotFoundException for non-existent order', async () => {
      mockOrderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getOrderById('607f1f77bcf86cd799439012'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid order ID', async () => {
      await expect(service.getOrderById('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getAllOrders', () => {
    it('should retrieve all orders', async () => {
      const mockOrders = [
        {
          _id: '607f1f77bcf86cd799439012',
          recordId: '507f1f77bcf86cd799439011',
          quantity: 5,
          status: 'pending',
          createdAt: new Date(),
          lastModified: new Date(),
        },
        {
          _id: '607f1f77bcf86cd799439013',
          recordId: '507f1f77bcf86cd799439012',
          quantity: 3,
          status: 'confirmed',
          createdAt: new Date(),
          lastModified: new Date(),
        },
      ];

      mockOrderModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockOrders),
      });

      const result = await service.getAllOrders();

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0]._id).toBe('607f1f77bcf86cd799439012');
      expect(result[1]._id).toBe('607f1f77bcf86cd799439013');
    });

    it('should return empty array when no orders exist', async () => {
      mockOrderModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getAllOrders();

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });
});
