import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as xml2js from 'xml2js';
import { RetryService } from './retry.service';
import { AppConfig } from '../../app.config';
import { isArray } from 'class-validator';

/**
 * DTO for parsed MusicBrainz release information
 */
export class MusicBrainzReleaseDTO {
  id: string;
  title: string;
  artist?: string;
  date?: string;
  country?: string;
  status?: string;
  packaging?: string;
  textRepresentation?: {
    language?: string;
    script?: string;
  };
  genre?: string;
  media?: {
    position?: string;
    format?: string;
    title?: string;
    tracks?: Array<{
      id: string;
      title: string;
      position: string;
      number?: string;
      length?: string;
    }>;
  };
}

// MusicBrainz API Service
// Handles communication with the MusicBrainz API and XML parsing
@Injectable()
export class MusicBrainzService {
  private readonly logger = new Logger(MusicBrainzService.name);
  private readonly baseUrl = AppConfig.musicBrainzUrl;
  private readonly xmlParser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
  });

  constructor(
    private readonly httpService: HttpService,
    private readonly retryService: RetryService,
  ) {}

  // Retrieves release information from MusicBrainz by ID
  async getReleaseById(releaseId: string): Promise<MusicBrainzReleaseDTO> {
    try {
      if (!releaseId || !this.isValidUUID(releaseId)) {
        throw new HttpException(
          'Invalid release ID format. Expected valid UUID.',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.debug(`Fetching MusicBrainz release: ${releaseId}`);

      // Use retry service to handle transient failures
      const release = await this.retryService.executeWithRetry(
        () => this.fetchReleaseFromApi(releaseId),
        'MusicBrainz',
        {
          maxAttempts: 3,
          maxDuration: 15000,
        },
      );

      this.logger.log(`Successfully retrieved release: ${releaseId}`);
      return release;
    } catch (error) {
      this.handleError(error, releaseId);
    }
  }

  // Fetches release data from MusicBrainz API
  // Extracted to a separate method to be used by retry service
  private async fetchReleaseFromApi(
    releaseId: string,
  ): Promise<MusicBrainzReleaseDTO> {
    const url = `${this.baseUrl}/release/${releaseId}?inc=recordings+genres+artist-credits`;
    const response = await firstValueFrom(
      this.httpService.get<string>(url, {
        headers: {
          Accept: 'application/xml',
          'User-Agent': 'HostelWorld-Challenge/1.0 (learning project)',
        },
        timeout: 5000,
      }),
    );

    const parsedData = await this.parseXmlResponse((response as any)?.data);
    return this.extractReleaseData(parsedData);
  }

  // Parses XML response from MusicBrainz API
  private async parseXmlResponse(xmlData: string): Promise<any> {
    try {
      const parsed = await this.xmlParser.parseStringPromise(xmlData);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse XML response', error);
      throw new HttpException(
        'Failed to parse MusicBrainz API response',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Extracts relevant release data from parsed XML
  private extractReleaseData(parsedXml: any): MusicBrainzReleaseDTO {
    try {
      const metadata = parsedXml['metadata'];
      if (!metadata || !metadata['release']) {
        throw new HttpException(
          'No release data found in API response',
          HttpStatus.NOT_FOUND,
        );
      }

      const releaseData = metadata['release'];
      const releaseId = releaseData['$']?.id || releaseData['id'];

      const release: MusicBrainzReleaseDTO = {
        id: releaseId,
        title: releaseData['title'] || 'Unknown',
        artist: this.extractArtist(releaseData),
        date: releaseData['date'],
        country: releaseData['country'],
        status: releaseData['status']?.['_'],
        packaging: releaseData['packaging']?.['_'],
        textRepresentation: this.extractTextRepresentation(releaseData),
        genre: this.extractGenre(releaseData),
        media: this.extractMedia(releaseData),
      };

      return release;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to extract release data', error);
      throw new HttpException(
        'Failed to process MusicBrainz release data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Extracts artist information from release data
  private extractArtist(releaseData: any): string | undefined {
    const creditList = releaseData['artist-credit'];
    if (!creditList) return undefined;

    return creditList['name-credit']?.['artist']?.['name'];
  }

  // Extracts release format information ( e.g., Vinyl, CD )
  private extractFormat(releaseData: any): string | undefined {
    const mediumList = releaseData['medium-list'];
    if (!mediumList) return undefined;

    return mediumList['medium']?.['format'];
  }

  // Extracts release genre information (e.g., Rock, Jazz)
  private extractGenre(releaseData: any): string | undefined {
    const mediumList = releaseData['artist-credit'];
    if (!mediumList) return undefined;

    let genreList =
      mediumList['name-credit']?.['artist']?.['genre-list']?.['genre'];
    if (isArray(genreList)) {
      genreList = genreList.sort((a, b) => a['_count'] - b['_count']);
      return this.toTitleCase(genreList[0]?.name.split(' ')[0]);
    }
  }

  private toTitleCase(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Extracts text representation (language/script) information
  private extractTextRepresentation(
    releaseData: any,
  ): { language?: string; script?: string } | undefined {
    const textRep = releaseData['text-representation'];
    if (!textRep) return undefined;

    return {
      language: textRep['language'],
      script: textRep['script'],
    };
  }

  // Extracts media (tracks) information from release data
  private extractMedia(releaseData: any): any {
    const medium = releaseData['medium-list']?.['medium'];
    if (!medium) return [];

    const formatArr = medium['format']?.['_']?.split(' ');
    return {
      format: formatArr[formatArr.length - 1],
      title: medium['title'],
      tracks: this.extractTracks(medium['track-list']),
    };
  }

  // Extracts track information from a track list
  private extractTracks(trackList: any): any[] {
    if (!trackList) return [];

    const tracks = Array.isArray(trackList['track'])
      ? trackList['track']
      : [trackList['track']];

    return (tracks || [])
      .filter((track: any) => track)
      .map((track: any) => ({
        id: track['id'],
        title: track['title'] || track['recording']?.['title'],
        position: track['position'],
        number: track['number'],
        length: track['length'],
      }));
  }

  // Validates if a string is a valid UUID
  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Handles errors from API calls and parsing
  private handleError(error: any, releaseId: string): void {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error.response?.status === 404) {
      this.logger.warn(`Release not found: ${releaseId}`);
      throw new HttpException(
        `Release with ID ${releaseId} not found in MusicBrainz`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      this.logger.error('Failed to connect to MusicBrainz API', error.message);
      throw new HttpException(
        'MusicBrainz API is currently unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.error(
      `Error fetching release ${releaseId}`,
      error.message || error,
    );
    throw new HttpException(
      'Failed to fetch release information from MusicBrainz',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
