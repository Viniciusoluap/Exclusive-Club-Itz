import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { google } from 'googleapis';

// Mock do módulo googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(),
    },
    drive: vi.fn(),
  },
}));

// Mock do módulo fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    createReadStream: vi.fn(),
  },
}));

describe('googleDriveUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar null quando credentials.json não existe', async () => {
    // Arrange
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Act
    const { uploadToGoogleDrive } = await import('./googleDriveUpload');
    const result = await uploadToGoogleDrive('/fake/path/backup.zip');

    // Assert
    expect(result).toBeNull();
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('credentials.json'));
  });

  it('deve retornar null quando token.json não existe', async () => {
    // Arrange
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('credentials.json')) return true;
      if (path.includes('token.json')) return false;
      return false;
    });

    // Act
    const { uploadToGoogleDrive } = await import('./googleDriveUpload');
    const result = await uploadToGoogleDrive('/fake/path/backup.zip');

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar null quando ocorre erro no upload', async () => {
    // Arrange
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('credentials.json')) {
        return JSON.stringify({
          installed: {
            client_id: 'test-client-id',
            client_secret: 'test-secret',
            redirect_uris: ['http://localhost'],
          },
        });
      }
      if (path.includes('token.json')) {
        return JSON.stringify({ access_token: 'test-token' });
      }
      return '';
    });

    const mockOAuth2Client = {
      setCredentials: vi.fn(),
    };

    vi.mocked(google.auth.OAuth2).mockImplementation(() => mockOAuth2Client as any);

    const mockDrive = {
      files: {
        list: vi.fn().mockRejectedValue(new Error('Drive API error')),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };

    vi.mocked(google.drive).mockReturnValue(mockDrive as any);

    // Act
    const { uploadToGoogleDrive } = await import('./googleDriveUpload');
    const result = await uploadToGoogleDrive('/fake/path/backup.zip');

    // Assert
    expect(result).toBeNull();
  });
});
