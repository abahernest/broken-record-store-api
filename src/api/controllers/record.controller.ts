import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Record } from '../schemas/record.schema';
import { Model } from 'mongoose';
import { RecordService } from '../services/record.service';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import {
  PaginatedResponse,
  PaginationQueryDTO,
} from '../dtos/pagination.query.dto';
import { FilterRecordDTO } from '../dtos/filter-record.dto';

@Controller('records')
export class RecordController {
  constructor(
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    private readonly recordService: RecordService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new record' })
  @ApiResponse({ status: 201, description: 'Record successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(@Body() request: CreateRecordRequestDTO): Promise<Record> {
    return this.recordService.create(request);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing record' })
  @ApiResponse({ status: 200, description: 'Record updated successfully' })
  @ApiResponse({ status: 500, description: 'Cannot find record to update' })
  async update(
    @Param('id') id: string,
    @Body() updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<Record> {
    return this.recordService.update(id, updateRecordDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all records with optional filters and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of records with metadata',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Full-text search query (searches across artist, album, category using MongoDB text search)',
    type: String,
  })
  @ApiQuery({
    name: 'artist',
    required: false,
    description: 'Filter by exact artist name',
    type: String,
  })
  @ApiQuery({
    name: 'album',
    required: false,
    description: 'Filter by exact album name',
    type: String,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Filter by record format (Vinyl, CD, etc.)',
    enum: RecordFormat,
    type: String,
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by record category (e.g., Rock, Jazz)',
    enum: RecordCategory,
    type: String,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (starts at 1)',
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of records per page (max 100)',
    type: Number,
    example: 10,
  })
  async findAll(
    @Query('q') q?: string,
    @Query('artist') artist?: string,
    @Query('album') album?: string,
    @Query('format') format?: RecordFormat,
    @Query('category') category?: RecordCategory,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<PaginatedResponse<Record>> {
    // Ensure page and limit are positive integers
    const validPage = Math.max(1, parseInt(String(page)) || 1);
    const validLimit = Math.min(
      100,
      Math.max(1, parseInt(String(limit)) || 10),
    );

    const filtersDto: FilterRecordDTO = {
      q,
      artist,
      album,
      format,
      category,
    };

    const paginationDto: PaginationQueryDTO = {
      page: validPage,
      limit: validLimit,
    };

    return this.recordService.findAll(filtersDto, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single record by ID' })
  @ApiResponse({ status: 200, description: 'Record found' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async findOne(@Param('id') id: string): Promise<Record> {
    const record = await this.recordService.findById(id);
    if (!record) {
      throw new NotFoundException('Record not found');
    }
    return record;
  }
}
