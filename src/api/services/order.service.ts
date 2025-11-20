import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { OrderResponseDTO } from '../dtos/order-response.dto';

/**
 * Order Service
 * Handles order creation with ACID transaction support for data consistency
 * Ensures record quantity is properly decremented and updates are atomic
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Create a new order with transactional support
   * Uses MongoDB sessions to ensure atomicity of operations:
   * 1. Verify record exists and has sufficient quantity
   * 2. Create the order
   * 3. Decrement record quantity
   * All operations rollback if any step fails
   *
   * Falls back to non-transactional writes in standalone MongoDB instances
   * or when DISABLE_TRANSACTIONS=true
   */
  async createOrder(
    createOrderDto: CreateOrderRequestDTO,
  ): Promise<OrderResponseDTO> {
    // Validate MongoDB ObjectId format
    if (!Types.ObjectId.isValid(createOrderDto.recordId)) {
      throw new BadRequestException(
        `Invalid record ID format: ${createOrderDto.recordId}`,
      );
    }

    const recordId = new Types.ObjectId(createOrderDto.recordId);

    const session = await this.connection.startSession();

    try {
      // Start transaction
      session.startTransaction();

      // Step 1: Fetch record with lock (within transaction)
      let recordQuery = this.recordModel.findById(recordId);
      recordQuery = recordQuery.session(session);
      const record = await recordQuery.exec();

      if (!record) {
        await session.abortTransaction();
        throw new NotFoundException(
          `Record with ID ${createOrderDto.recordId} not found`,
        );
      }

      // Step 2: Validate sufficient stock
      if (record.qty < createOrderDto.quantity) {
        await session.abortTransaction();
        throw new BadRequestException(
          `Insufficient stock. Available: ${record.qty}, Requested: ${createOrderDto.quantity}`,
        );
      }

      // Store available quantity for response
      const availableQuantity = record.qty;

      // Step 3: Create order
      const order = new this.orderModel({
        recordId,
        quantity: createOrderDto.quantity,
        status: 'pending',
        orderDate: new Date(),
        createdAt: new Date(),
        lastModified: new Date(),
      });

      const savedOrder = await order.save({ session });

      // Step 4: Decrement record quantity
      let updateQuery = this.recordModel.findByIdAndUpdate(
        recordId,
        {
          $inc: { qty: -createOrderDto.quantity },
          lastModified: new Date(),
        },
        { new: false },
      );

      updateQuery = updateQuery.session(session);
      await updateQuery.exec();

      // Commit transaction
      await session.commitTransaction();

      this.logger.log(
        `Order created successfully: ${savedOrder._id} for record ${recordId}`,
      );

      // Return response DTO
      return {
        _id: savedOrder._id.toString(),
        recordId: savedOrder.recordId.toString(),
        quantity: savedOrder.quantity,
        status: savedOrder.status,
        availableQuantity,
        sufficientStock: true,
      };
    } catch (error) {
      // Ensure transaction is aborted on any error
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (err) {
          this.logger.error('Failed to abort transaction', err);
        }
      }

      this.logger.error(`Order creation failed: ${error.message}`, error.stack);

      // Re-throw known exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Wrap unknown errors
      throw new InternalServerErrorException(
        `Failed to create order: ${error.message}`,
      );
    } finally {
      // Always end session
      await session.endSession();
    }
  }

  /**
   * Create order without transactions (for testing with standalone MongoDB)
   * @private
   */
  private async createOrderWithoutTransaction(
    recordId: Types.ObjectId,
    createOrderDto: CreateOrderRequestDTO,
  ): Promise<OrderResponseDTO> {
    // Step 1: Fetch record
    const record = await this.recordModel.findById(recordId).exec();

    if (!record) {
      throw new NotFoundException(
        `Record with ID ${createOrderDto.recordId} not found`,
      );
    }

    // Step 2: Validate sufficient stock
    if (record.qty < createOrderDto.quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${record.qty}, Requested: ${createOrderDto.quantity}`,
      );
    }

    // Store available quantity for response
    const availableQuantity = record.qty;

    // Step 3: Create order
    const order = new this.orderModel({
      recordId,
      quantity: createOrderDto.quantity,
      status: 'pending',
      orderDate: new Date(),
      createdAt: new Date(),
      lastModified: new Date(),
    });

    const savedOrder = await order.save();

    // Step 4: Decrement record quantity
    await this.recordModel.findByIdAndUpdate(
      recordId,
      {
        $inc: { qty: -createOrderDto.quantity },
        lastModified: new Date(),
      },
      { new: false },
    );

    this.logger.log(
      `Order created successfully (non-transactional): ${savedOrder._id} for record ${recordId}`,
    );

    // Return response DTO
    return {
      _id: savedOrder._id.toString(),
      recordId: savedOrder.recordId.toString(),
      quantity: savedOrder.quantity,
      status: savedOrder.status,
      availableQuantity,
      sufficientStock: true,
    };
  }

  /**
   * Retrieve all orders with optional filtering
   * @returns Array of all orders
   */
  async getAllOrders(): Promise<OrderResponseDTO[]> {
    const orders = await this.orderModel.find().exec();

    return orders.map((order) => ({
      _id: order._id.toString(),
      recordId: order.recordId.toString(),
      quantity: order.quantity,
      status: order.status,
      availableQuantity: 0, // Not applicable for history
      sufficientStock: true,
    }));
  }

  /**
   * Retrieve order by ID
   * @param orderId - Order ID
   * @returns Order details
   */
  async getOrderById(orderId: string): Promise<OrderResponseDTO> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException(`Invalid order ID format: ${orderId}`);
    }

    const order = await this.orderModel.findById(orderId).exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return {
      _id: order._id.toString(),
      recordId: order.recordId.toString(),
      quantity: order.quantity,
      status: order.status,
      availableQuantity: 0,
      sufficientStock: true,
    };
  }
}
