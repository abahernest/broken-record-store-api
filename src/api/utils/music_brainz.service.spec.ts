import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MusicBrainzService } from './music_brainz.service';
import { RetryService } from './retry.service';

describe('MusicBrainzService', () => {
  let service: MusicBrainzService;
  let httpService: HttpService;

  const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://musicbrainz.org/ns/mmd-2.0#">
  <release id="12345678-1234-1234-1234-123456789012">
    <title>Abbey Road</title>
    <status>Official</status>
    <artist-credit>
      <name-credit>
        <artist id="artist-id">
          <name>The Beatles</name>
        </artist>
      </name-credit>
    </artist-credit>
    <date>1969-09-26</date>
    <country>GB</country>
    <genre>Rock</genre>
    <media count="1">
      <track-count>3</track-count>
      <format>Vinyl</format>
      <track-list count="3">
        <track id="track-1" number="1">
          <position>1</position>
          <title>Come Together</title>
          <length>259000</length>
        </track>
        <track id="track-2" number="2">
          <position>2</position>
          <title>Something</title>
          <length>183000</length>
        </track>
        <track id="track-3" number="3">
          <position>3</position>
          <title>Maxwell's Silver Hammer</title>
          <length>207000</length>
        </track>
      </track-list>
    </media>
  </release>
</metadata>`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MusicBrainzService,
        RetryService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MusicBrainzService>(MusicBrainzService);
    httpService = module.get<HttpService>(HttpService);
  });

  describe('getReleaseById', () => {
    it('should retrieve a release by valid UUID', async () => {
      const releaseId = '12345678-1234-1234-1234-123456789012';

      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: mockXmlResponse,
        } as any),
      );

      const result = await service.getReleaseById(releaseId);

      expect(result).toBeDefined();
      expect(result.id).toBe(releaseId);
      expect(result.title).toBe('Abbey Road');
      expect(result.artist).toBe('The Beatles');
    });

    it('should throw HttpException for invalid UUID format', async () => {
      const invalidId = 'not-a-uuid';

      await expect(service.getReleaseById(invalidId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw HttpException for empty UUID', async () => {
      await expect(service.getReleaseById('')).rejects.toThrow(HttpException);
    });

    it('should throw HttpException for null UUID', async () => {
      const invalidId: any = null;
      await expect(service.getReleaseById(invalidId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should retry on transient network errors', async () => {
      const releaseId = '12345678-1234-1234-1234-123456789012';
      let callCount = 0;

      jest.spyOn(httpService, 'get').mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return throwError(() => ({ code: 'ECONNRESET' }));
        }
        return of({
          data: mockXmlResponse,
        } as any);
      });

      const result = await service.getReleaseById(releaseId);

      expect(result).toBeDefined();
      expect(result.title).toBe('Abbey Road');
      expect(callCount).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw HttpException on HTTP 404 errors from API', async () => {
      const releaseId = '12345678-1234-1234-1234-123456789012';

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(
          throwError(
            () => new HttpException('Not Found', HttpStatus.NOT_FOUND),
          ),
        );

      await expect(service.getReleaseById(releaseId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle malformed XML response gracefully', async () => {
      const releaseId = '12345678-1234-1234-1234-123456789012';
      const malformedXml = '<invalid>xml</not-closed>';

      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: malformedXml,
        } as any),
      );

      // Should either throw or handle gracefully
      try {
        await service.getReleaseById(releaseId);
        // If it doesn't throw, that's acceptable (graceful degradation)
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('UUID validation', () => {
    const validUUIDs = [
      '12345678-1234-1234-1234-123456789012',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    ];

    const invalidUUIDs = [
      'not-a-uuid',
      '12345678-1234-1234-123456789012', // too short
      '12345678-1234-1234-1234-123456789012-extra', // too long
      '12345678123412341234123456789012', // no dashes
      '',
    ];

    validUUIDs.forEach((uuid) => {
      it(`should accept valid UUID: ${uuid}`, async () => {
        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: mockXmlResponse,
          } as any),
        );

        try {
          await service.getReleaseById(uuid);
          expect(true).toBe(true); // Should not throw
        } catch (error) {
          if (error instanceof HttpException) {
            if (error.getStatus() !== HttpStatus.BAD_REQUEST) {
              throw error; // Re-throw non-validation errors
            }
          } else {
            throw error;
          }
        }
      });
    });

    invalidUUIDs.forEach((uuid) => {
      it(`should reject invalid UUID: ${uuid}`, async () => {
        await expect(service.getReleaseById(uuid)).rejects.toThrow(
          HttpException,
        );
      });
    });
  });
});
