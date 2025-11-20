import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RecordFormat, RecordCategory } from './record.enum';

/**
 * Track subdocument schema
 * Represents a single track in a record's tracklist
 */
@Schema()
export class Track {
  @Prop()
  id?: string;

  @Prop()
  title?: string;

  @Prop()
  position?: string;

  @Prop()
  number?: string;

  @Prop()
  length?: string;
}

export const TrackSchema = SchemaFactory.createForClass(Track);

@Schema({ timestamps: true })
export class Record {
  @Prop({ required: true })
  artist: string;

  @Prop({ required: true })
  album: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  qty: number;

  @Prop({ enum: RecordFormat, required: true })
  format: RecordFormat;

  @Prop({ required: true })
  category: RecordCategory;

  @Prop({ required: false })
  mbid?: string;

  @Prop({ type: [TrackSchema], default: [] })
  tracklist?: Track[];
}

export const RecordSchema = SchemaFactory.createForClass(Record);

export type RecordDocument = HydratedDocument<Record>;

// Compound index for unique record identification (artist + album + format)
// This optimizes queries filtering by any combination of these fields
RecordSchema.index({ artist: 1, album: 1, format: 1 }, { unique: true });

// Ensure MBID uniqueness only for documents that actually have an MBID.
// Use a sparse unique index so multiple documents with null/undefined MBID
// don't collide on the unique constraint.
RecordSchema.index({ mbid: 1 }, { unique: true, sparse: true });

// Text index for full-text search across artist, album, format, and category
// Enables fast keyword search with MongoDB text search capabilities
RecordSchema.index({
  artist: 'text',
  album: 'text',
  category: 'text',
  format: 'text',
});
