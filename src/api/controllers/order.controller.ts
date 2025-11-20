import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OrderService } from '../services/order.service';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { OrderResponseDTO } from '../dtos/order-response.dto';

/**
 * Order Controller
 * Handles HTTP requests for order management
 */
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * Create a new order for a record
   * Processes the order within a transaction to ensure data consistency
   * Decrements record quantity atomically
   */
  @Post()
  @ApiOperation({
    summary: 'Create a new order for a record',
    description:
      'Creates an order within a transaction. Validates record existence and stock availability. ' +
      'Automatically decrements record quantity. Rolls back all changes if any step fails.',
  })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
    type: OrderResponseDTO,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid data' })
  @ApiResponse({
    status: 404,
    description: 'Record not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Transaction failed',
  })
  async createOrder(
    @Body() createOrderDto: CreateOrderRequestDTO,
  ): Promise<OrderResponseDTO> {
    return this.orderService.createOrder(createOrderDto);
  }

  /**
   * Retrieve all orders
   */
  @Get()
  @ApiOperation({
    summary: 'Retrieve all orders',
    description: 'Fetches a list of all orders in the system',
  })
  @ApiResponse({
    status: 200,
    description: 'List of orders',
    type: [OrderResponseDTO],
  })
  async getAllOrders(): Promise<OrderResponseDTO[]> {
    return this.orderService.getAllOrders();
  }

  /**
   * Retrieve order by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve an order by ID',
    description: 'Fetches details of a specific order',
  })
  @ApiResponse({
    status: 200,
    description: 'Order details',
    type: OrderResponseDTO,
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrderById(@Param('id') id: string): Promise<OrderResponseDTO> {
    return this.orderService.getOrderById(id);
  }
}
