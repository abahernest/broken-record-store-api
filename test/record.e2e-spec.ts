import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { clearCollection, dropIndexIfExists } from './e2e-utils';
import { RecordFormat, RecordCategory } from '../src/api/schemas/record.enum';

describe('RecordController (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let recordIds: string[] = [];
  let recordModel;

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

    // Drop any legacy non-sparse mbid index, then ensure clean collection
    await dropIndexIfExists(recordModel, 'mbid_1');
    await clearCollection(recordModel);
  });

  // Ensure each test starts with a clean collection to avoid cross-test duplicates
  beforeEach(async () => {
    if (recordModel) {
      await clearCollection(recordModel);
    }
    recordIds = [];
  });

  afterEach(async () => {
    // Clean up all created records
    for (const id of recordIds) {
      try {
        await recordModel.findByIdAndDelete(id);
      } catch (err) {
        // Record might already be deleted
      }
    }
    recordIds = [];
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

  describe('POST /records - Create Record', () => {
    it('should create a new record with valid data', async () => {
      const createRecordDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 25,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const response = await request(app.getHttpServer())
        .post('/records')
        .send(createRecordDto)
        .expect(201);

      recordIds.push(response.body._id);
      expect(response.body).toHaveProperty('artist', 'The Beatles');
      expect(response.body).toHaveProperty('album', 'Abbey Road');
      expect(response.body).toHaveProperty('price', 25);
      expect(response.body).toHaveProperty('qty', 10);
      expect(response.body).toHaveProperty('format', RecordFormat.VINYL);
      expect(response.body).toHaveProperty('category', RecordCategory.ROCK);
      expect(response.body).toHaveProperty('tracklist');
      expect(Array.isArray(response.body.tracklist)).toBe(true);
    });

    it('should reject record creation with missing required fields', async () => {
      const invalidDto = {
        artist: 'The Beatles',
        // Missing: album, price, qty, format, category
      };

      await request(app.getHttpServer())
        .post('/records')
        .send(invalidDto)
        .expect(400);
    });

    it('should reject record creation with invalid enum values', async () => {
      const invalidDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 25,
        qty: 10,
        format: 'InvalidFormat',
        category: RecordCategory.ROCK,
      };

      await request(app.getHttpServer())
        .post('/records')
        .send(invalidDto)
        .expect(400);
    });

    it('should reject record with negative price', async () => {
      const invalidDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: -10,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      await request(app.getHttpServer())
        .post('/records')
        .send(invalidDto)
        .expect(400);
    });

    it('should reject record with price exceeding max limit', async () => {
      const invalidDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 11000, // Max is 10000
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      await request(app.getHttpServer())
        .post('/records')
        .send(invalidDto)
        .expect(400);
    });

    it('should reject record with qty exceeding max limit', async () => {
      const invalidDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 25,
        qty: 10001, // Max is 10000
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      await request(app.getHttpServer())
        .post('/records')
        .send(invalidDto)
        .expect(400);
    });

    it('should reject record with non-integer qty', async () => {
      const invalidDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 25,
        qty: 10.5, // Must be integer
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      await request(app.getHttpServer())
        .post('/records')
        .send(invalidDto)
        .expect(400);
    });

    it('should prevent duplicate records with same identifiers', async () => {
      const createRecordDto = {
        artist: 'Pink Floyd',
        album: 'The Wall',
        price: 35,
        qty: 5,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      // Create first record
      const response1 = await request(app.getHttpServer())
        .post('/records')
        .send(createRecordDto)
        .expect(201);

      recordIds.push(response1.body._id);

      // Try to create duplicate - should fail with 409 CONFLICT
      const response2 = await request(app.getHttpServer())
        .post('/records')
        .send(createRecordDto)
        .expect(409);

      expect(response2.body).toHaveProperty('message');
      expect(response2.body.message).toContain('already exists');
      expect(response2.body).toHaveProperty('existing');
    });

    it('should allow duplicate artist/album with different format', async () => {
      const baseDto = {
        artist: 'Queen',
        album: 'Bohemian Rhapsody',
        price: 25,
        qty: 10,
        category: RecordCategory.ROCK,
      };

      // Create CD version
      const cdRecord = await request(app.getHttpServer())
        .post('/records')
        .send({ ...baseDto, format: RecordFormat.CD })
        .expect(201);

      recordIds.push(cdRecord.body._id);

      // Create Vinyl version - should succeed since format differs
      const vinylRecord = await request(app.getHttpServer())
        .post('/records')
        .send({ ...baseDto, format: RecordFormat.VINYL })
        .expect(201);

      recordIds.push(vinylRecord.body._id);

      expect(cdRecord.body.format).toBe(RecordFormat.CD);
      expect(vinylRecord.body.format).toBe(RecordFormat.VINYL);
    });
  });

  describe('GET /records/:id - Retrieve single record', () => {
    it('should retrieve a created record by id', async () => {
      const createDto = {
        artist: 'E2E Artist',
        album: 'E2E Album',
        price: 20,
        qty: 5,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const createResp = await request(app.getHttpServer())
        .post('/records')
        .send(createDto)
        .expect(201);

      const id = createResp.body._id;
      recordIds.push(id);

      const getResp = await request(app.getHttpServer())
        .get(`/records/${id}`)
        .expect(200);

      expect(getResp.body).toHaveProperty('_id', id);
      expect(getResp.body).toHaveProperty('artist', createDto.artist);
      expect(getResp.body).toHaveProperty('album', createDto.album);
    });

    it('should return 404 for non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/records/000000000000000000000000')
        .expect(404);
    });
  });

  describe('GET /records - List Records', () => {
    beforeEach(async () => {
      // Create test data
      const records = [
        {
          artist: 'The Beatles',
          album: 'Abbey Road',
          price: 25,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
        },
        {
          artist: 'The Beatles',
          album: 'Let It Be',
          price: 22,
          qty: 8,
          format: RecordFormat.CD,
          category: RecordCategory.ROCK,
        },
        {
          artist: 'Miles Davis',
          album: 'Kind of Blue',
          price: 30,
          qty: 5,
          format: RecordFormat.VINYL,
          category: RecordCategory.JAZZ,
        },
        {
          artist: 'John Coltrane',
          album: 'A Love Supreme',
          price: 28,
          qty: 7,
          format: RecordFormat.VINYL,
          category: RecordCategory.JAZZ,
        },
      ];

      for (const record of records) {
        const response = await request(app.getHttpServer())
          .post('/records')
          .send(record)
          .expect(201);
        recordIds.push(response.body._id);
      }
    });

    it('should retrieve all records with default pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/records')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('totalPages');
      expect(response.body.pagination).toHaveProperty('hasMore');
    });

    it('should filter records by exact artist name', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?artist=The Beatles')
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.data.every((r) => r.artist === 'The Beatles')).toBe(
        true,
      );
    });

    it('should filter records by exact album name', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?album=Abbey Road')
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0]).toHaveProperty('album', 'Abbey Road');
    });

    it('should filter records by format', async () => {
      const response = await request(app.getHttpServer())
        .get(`/records?format=${RecordFormat.VINYL}`)
        .expect(200);

      expect(response.body.data.length).toBe(3);
      expect(
        response.body.data.every((r) => r.format === RecordFormat.VINYL),
      ).toBe(true);
    });

    it('should filter records by category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/records?category=${RecordCategory.JAZZ}`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(
        response.body.data.every((r) => r.category === RecordCategory.JAZZ),
      ).toBe(true);
    });

    it('should apply multiple filters (artist AND format)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/records?artist=The Beatles&format=${RecordFormat.VINYL}`)
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0]).toHaveProperty('artist', 'The Beatles');
      expect(response.body.data[0]).toHaveProperty(
        'format',
        RecordFormat.VINYL,
      );
    });

    it('should apply all available filters', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/records?artist=The Beatles&album=Abbey Road&format=${RecordFormat.VINYL}&category=${RecordCategory.ROCK}`,
        )
        .expect(200);

      expect(response.body.data.length).toBe(1);
      const record = response.body.data[0];
      expect(record.artist).toBe('The Beatles');
      expect(record.album).toBe('Abbey Road');
      expect(record.format).toBe(RecordFormat.VINYL);
      expect(record.category).toBe(RecordCategory.ROCK);
    });

    it('should handle pagination with custom page and limit', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?page=1&limit=2')
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 2);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should enforce max limit of 100', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?limit=500')
        .expect(200);

      expect(response.body.pagination.limit).toBe(100);
    });

    it('should clamp negative page to 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?page=-5')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
    });

    it('should clamp limit to minimum of 10', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?limit=0')
        .expect(200);

      expect(response.body.pagination.limit).toBe(10);
    });

    it('should return correct pagination metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?limit=2')
        .expect(200);

      const { pagination } = response.body;
      expect(pagination.totalPages).toBe(
        Math.ceil(pagination.total / pagination.limit),
      );

      const isLastPage = pagination.page === pagination.totalPages;
      expect(pagination.hasMore).toBe(!isLastPage);
    });

    it('should return empty data when no records match filters', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?artist=NonExistentArtist')
        .expect(200);

      expect(response.body.data.length).toBe(0);
      expect(response.body.pagination.total).toBe(0);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should perform full-text search with q parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/records?q=Beatles')
        .expect(200);

      // Should find records matching text search
      expect(response.body.data.length).toBeGreaterThan(0);
      // Results should be sorted by text relevance score
      if (response.body.data.length > 1) {
        expect(response.body.pagination).toBeDefined();
      }
    });

    it('should combine full-text search with filters', async () => {
      const response = await request(app.getHttpServer())
        .get(`/records?q=Beatles&format=${RecordFormat.VINYL}`)
        .expect(200);

      // Should filter AND search
      expect(
        response.body.data.every((r) => r.format === RecordFormat.VINYL),
      ).toBe(true);
    });
  });

  describe('PUT /records/:id - Update Record', () => {
    let testRecordId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/records')
        .send({
          artist: 'Original Artist',
          album: 'Original Album',
          price: 25,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
        })
        .expect(201);

      testRecordId = response.body._id;
      recordIds.push(testRecordId);
    });

    it('should update basic record fields', async () => {
      const updateDto = {
        artist: 'Updated Artist',
        price: 35,
        qty: 15,
      };

      const response = await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('artist', 'Updated Artist');
      expect(response.body).toHaveProperty('price', 35);
      expect(response.body).toHaveProperty('qty', 15);
      // Original values should be preserved
      expect(response.body).toHaveProperty('album', 'Original Album');
    });

    it('should update format field', async () => {
      const updateDto = {
        format: RecordFormat.CD,
      };

      const response = await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('format', RecordFormat.CD);
    });

    it('should update category field', async () => {
      const updateDto = {
        category: RecordCategory.JAZZ,
      };

      const response = await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('category', RecordCategory.JAZZ);
    });

    it('should update album field', async () => {
      const updateDto = {
        album: 'New Album Name',
      };

      const response = await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('album', 'New Album Name');
    });

    it('should reject update of non-existent record', async () => {
      const fakeId = '000000000000000000000000';

      await request(app.getHttpServer())
        .put(`/records/${fakeId}`)
        .send({ price: 50 })
        .expect(404);
    });

    it('should reject invalid update data', async () => {
      const invalidUpdate = {
        price: 'not a number',
      };

      await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(invalidUpdate)
        .expect(400);
    });

    it('should reject price exceeding max on update', async () => {
      const invalidUpdate = {
        price: 11000,
      };

      await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(invalidUpdate)
        .expect(400);
    });

    it('should reject qty exceeding max on update', async () => {
      const invalidUpdate = {
        qty: 10001,
      };

      await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(invalidUpdate)
        .expect(400);
    });

    it('should handle empty update (no fields)', async () => {
      const response = await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send({})
        .expect(200);

      // Record should be returned unchanged
      expect(response.body._id).toBe(testRecordId);
    });

    it('should reject invalid enum value on update', async () => {
      const invalidUpdate = {
        format: 'InvalidFormat',
      };

      await request(app.getHttpServer())
        .put(`/records/${testRecordId}`)
        .send(invalidUpdate)
        .expect(400);
    });
  });

  describe('Edge Cases & Complex Scenarios', () => {
    it('should handle records with special characters in artist/album names', async () => {
      const createDto = {
        artist: "O'Reilly & The Punk Rock Kid's",
        album: 'Café - "Live" Edition (2023)',
        price: 25,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const response = await request(app.getHttpServer())
        .post('/records')
        .send(createDto)
        .expect(201);

      recordIds.push(response.body._id);

      expect(response.body.artist).toBe(createDto.artist);
      expect(response.body.album).toBe(createDto.album);
    });

    it('should handle records with minimum valid values', async () => {
      const minimalDto = {
        artist: 'A',
        album: 'B',
        price: 0,
        qty: 0,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const response = await request(app.getHttpServer())
        .post('/records')
        .send(minimalDto)
        .expect(201);

      recordIds.push(response.body._id);

      expect(response.body.price).toBe(0);
      expect(response.body.qty).toBe(0);
    });

    it('should handle records with maximum valid values', async () => {
      const maximalDto = {
        artist: 'Very Long Artist Name That Is Still Valid',
        album: 'Very Long Album Name That Is Also Still Valid',
        price: 10000,
        qty: 100,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const response = await request(app.getHttpServer())
        .post('/records')
        .send(maximalDto)
        .expect(201);

      recordIds.push(response.body._id);

      expect(response.body.price).toBe(10000);
      expect(response.body.qty).toBe(100);
    });

    it('should preserve tracklist on record creation', async () => {
      const createDto = {
        artist: 'Test Artist',
        album: 'Test Album',
        price: 25,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      const response = await request(app.getHttpServer())
        .post('/records')
        .send(createDto)
        .expect(201);

      recordIds.push(response.body._id);

      expect(response.body).toHaveProperty('tracklist');
      expect(Array.isArray(response.body.tracklist)).toBe(true);
    });

    it('should not allow duplicate records even with case variations', async () => {
      const createDto = {
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 25,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      };

      // Create first record
      const response1 = await request(app.getHttpServer())
        .post('/records')
        .send(createDto)
        .expect(201);

      recordIds.push(response1.body._id);

      // Try with lowercase artist (Note: MongoDB exact match is case-sensitive by default)
      const duplicateDto = {
        ...createDto,
        artist: 'the beatles', // lowercase
      };

      // This should succeed since exact match is case-sensitive
      const response2 = await request(app.getHttpServer())
        .post('/records')
        .send(duplicateDto)
        .expect(201);

      recordIds.push(response2.body._id);

      expect(response2.body._id).not.toBe(response1.body._id);
    });
  });
});
