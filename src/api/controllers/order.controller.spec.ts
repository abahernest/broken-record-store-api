import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from '../services/order.service';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { OrderResponseDTO } from '../dtos/order-response.dto';

describe('OrderController', () => {
  let controller: OrderController;
  let mockOrderService: Partial<Record<keyof OrderService, jest.Mock>>;

  beforeEach(async () => {
    mockOrderService = {
      createOrder: jest.fn(),
      getAllOrders: jest.fn(),
      getOrderById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: mockOrderService,
        },
      ],
    }).compile();

    controller = module.get<OrderController>(OrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createOrder should call OrderService.createOrder and return result', async () => {
    const dto: CreateOrderRequestDTO = {
      recordId: '507f1f77bcf86cd799439011',
      quantity: 3,
    };

    const expected: OrderResponseDTO = {
      _id: '607f1f77bcf86cd799439012',
      recordId: dto.recordId,
      quantity: dto.quantity,
      status: 'pending',
      availableQuantity: 10,
      sufficientStock: true,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    } as unknown as OrderResponseDTO;

    (mockOrderService.createOrder as jest.Mock).mockResolvedValue(expected);

    const res = await controller.createOrder(dto);
    expect(res).toEqual(expected);
    expect(mockOrderService.createOrder).toHaveBeenCalledWith(dto);
  });

  it('createOrder should propagate BadRequestException from service', async () => {
    const dto: CreateOrderRequestDTO = {
      recordId: '507f1f77bcf86cd799439011',
      quantity: 99,
    };

    const err = new BadRequestException('Insufficient stock');
    (mockOrderService.createOrder as jest.Mock).mockRejectedValue(err);

    await expect(controller.createOrder(dto)).rejects.toBe(err);
    expect(mockOrderService.createOrder).toHaveBeenCalledWith(dto);
  });

  it('createOrder should propagate InternalServerErrorException from service', async () => {
    const dto: CreateOrderRequestDTO = {
      recordId: '507f1f77bcf86cd799439011',
      quantity: 1,
    };

    const err = new InternalServerErrorException('Transaction failed');
    (mockOrderService.createOrder as jest.Mock).mockRejectedValue(err);

    await expect(controller.createOrder(dto)).rejects.toBe(err);
    expect(mockOrderService.createOrder).toHaveBeenCalledWith(dto);
  });

  it('getAllOrders should return empty array when no orders exist', async () => {
    (mockOrderService.getAllOrders as jest.Mock).mockResolvedValue([]);

    const res = await controller.getAllOrders();
    expect(res).toEqual([]);
    expect(mockOrderService.getAllOrders).toHaveBeenCalled();
  });

  it('getAllOrders should return multiple orders', async () => {
    const expected: OrderResponseDTO[] = [
      { _id: '1', recordId: 'r1' } as unknown as OrderResponseDTO,
      { _id: '2', recordId: 'r2' } as unknown as OrderResponseDTO,
    ];
    (mockOrderService.getAllOrders as jest.Mock).mockResolvedValue(expected);

    const res = await controller.getAllOrders();
    expect(res).toBe(expected);
    expect(mockOrderService.getAllOrders).toHaveBeenCalled();
  });

  it('getOrderById should call OrderService.getOrderById with id', async () => {
    const expected = {
      _id: '1',
      recordId: 'r1',
    } as unknown as OrderResponseDTO;
    (mockOrderService.getOrderById as jest.Mock).mockResolvedValue(expected);

    const res = await controller.getOrderById('1');
    expect(res).toEqual(expected);
    expect(mockOrderService.getOrderById).toHaveBeenCalledWith('1');
  });

  it('getOrderById should propagate NotFoundException from service', async () => {
    const err = new NotFoundException('Order not found');
    (mockOrderService.getOrderById as jest.Mock).mockRejectedValue(err);

    await expect(controller.getOrderById('nope')).rejects.toBe(err);
    expect(mockOrderService.getOrderById).toHaveBeenCalledWith('nope');
  });
});
