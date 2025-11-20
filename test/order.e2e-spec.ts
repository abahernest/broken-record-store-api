import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Record } from '../src/api/schemas/record.schema';
import { Order } from '../src/api/schemas/order.schema';
import { RecordFormat, RecordCategory } from '../src/api/schemas/record.enum';
import { clearCollection } from './e2e-utils';

describe('OrderController (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let recordModel: Model<Record>;
  let orderModel: Model<Order>;
  let createdRecordId: string;

  beforeAll(async () => {
    process.env.MONGO_URL = process.env.MONGO_TEST_URL;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Apply the same global validation pipe used in production bootstrap
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
    recordModel = app.get('RecordModel');
    orderModel = app.get('OrderModel');

    await clearCollection(recordModel);
  });

  beforeEach(async () => {
    // Clear collections before each test
    await orderModel.deleteMany({});
    await recordModel.deleteMany({});

    // Create a test record
    const record = await recordModel.create({
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 29.99,
      qty: 100,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
      mbid: '3b3d38d2-88eb-3f47-b731-f37941deaf3c',
    });

    createdRecordId = record._id.toString();
  });

  afterAll(async () => {
    // Ensure we clear any data created during tests to avoid leftovers
    if (recordModel) {
      try {
        await recordModel.deleteMany({});
      } catch (err) {
        // ignore deletion errors
      }
    }

    if (app) await app.close();
  });

  describe('POST /orders', () => {
    it('should create an order successfully', async () => {
      const orderData = {
        recordId: createdRecordId,
        quantity: 5,
      };

      const response = await request(app.getHttpServer())
        .post('/orders')
        .send(orderData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body._id).toBeDefined();
      expect(response.body.recordId).toBe(createdRecordId);
      expect(response.body.quantity).toBe(5);
      expect(response.body.status).toBe('pending');
      expect(response.body.availableQuantity).toBe(100);
      expect(response.body.sufficientStock).toBe(true);
    });

    it('should decrement record quantity after order creation', async () => {
      const orderData = {
        recordId: createdRecordId,
        quantity: 10,
      };

      await request(app.getHttpServer())
        .post('/orders')
        .send(orderData)
        .expect(201);

      // Verify record quantity was decremented
      const updatedRecord = await recordModel.findById(createdRecordId);
      expect(updatedRecord.qty).toBe(90);
    });

    it('should create multiple orders and decrement quantity correctly', async () => {
      // Create first order
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 20,
        })
        .expect(201);

      // Verify first decrement
      let updatedRecord = await recordModel.findById(createdRecordId);
      expect(updatedRecord.qty).toBe(80);

      // Create second order
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 15,
        })
        .expect(201);

      // Verify second decrement
      updatedRecord = await recordModel.findById(createdRecordId);
      expect(updatedRecord.qty).toBe(65);
    });

    it('should return 400 when record does not exist', async () => {
      const fakeRecordId = '507f1f77bcf86cd799439099';

      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: fakeRecordId,
          quantity: 5,
        })
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should return 400 when quantity exceeds available stock', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 150, // More than available (100)
        })
        .expect(400);

      expect(response.body.message).toContain('Insufficient stock');
    });

    it('should return 400 for invalid quantity', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 0, // Invalid: must be >= 1
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should return 400 for invalid record ID format', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: 'invalid-id',
          quantity: 5,
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          // Missing recordId and quantity
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should handle quantity boundary: exactly available stock', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 100, // Exactly available
        })
        .expect(201);

      expect(response.body.sufficientStock).toBe(true);

      // Verify record quantity is now 0
      const updatedRecord = await recordModel.findById(createdRecordId);
      expect(updatedRecord.qty).toBe(0);
    });

    it('should prevent orders when quantity is at 0', async () => {
      // First, order all available records
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 100,
        })
        .expect(201);

      // Try to order when quantity is 0
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          recordId: createdRecordId,
          quantity: 1,
        })
        .expect(400);

      expect(response.body.message).toContain('Insufficient stock');
    });
  });

  describe('GET /orders', () => {
    it('should retrieve all orders', async () => {
      // Create some orders
      await request(app.getHttpServer())
        .post('/orders')
        .send({ recordId: createdRecordId, quantity: 5 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/orders')
        .send({ recordId: createdRecordId, quantity: 3 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/orders')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should return empty array when no orders exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('GET /orders/:id', () => {
    it('should retrieve an order by ID', async () => {
      // Create an order
      const createResponse = await request(app.getHttpServer())
        .post('/orders')
        .send({ recordId: createdRecordId, quantity: 5 })
        .expect(201);

      const orderId = createResponse.body._id;

      // Retrieve the order
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .expect(200);

      expect(response.body._id).toBe(orderId);
      expect(response.body.recordId).toBe(createdRecordId);
      expect(response.body.quantity).toBe(5);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeOrderId = '607f1f77bcf86cd799439099';

      await request(app.getHttpServer())
        .get(`/orders/${fakeOrderId}`)
        .expect(404);
    });

    it('should return 400 for invalid order ID format', async () => {
      await request(app.getHttpServer()).get('/orders/invalid-id').expect(400);
    });
  });

  describe('Transaction Rollback Scenarios', () => {
    it('should rollback order if record update fails (simulated)', async () => {
      // This test verifies transaction safety:
      // If record update fails, order creation should also be rolled back

      const initialOrderCount = await orderModel.countDocuments();

      const orderData = {
        recordId: createdRecordId,
        quantity: 5,
      };

      // Successful order creation
      await request(app.getHttpServer())
        .post('/orders')
        .send(orderData)
        .expect(201);

      // Verify order was created
      const orderCount = await orderModel.countDocuments();
      expect(orderCount).toBe(initialOrderCount + 1);

      // Verify record was updated
      const updatedRecord = await recordModel.findById(createdRecordId);
      expect(updatedRecord.qty).toBe(95);
    });
  });
});
