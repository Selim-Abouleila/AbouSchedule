// src/helpers/mediaHelper.ts
import * as FileSystem from 'expo-file-system'
import { endpoints }        from './api'
import { getToken }         from './auth'
import { jwtDecode }        from 'jwt-decode'
import * as Crypto          from 'expo-crypto'

// Base path inside the app’s sandbox:
const MEDIA_BASE = FileSystem.documentDirectory + 'media'

interface JwtPayload { sub: string }

async function makeFileName(url: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    url
  )
  const ext = url.split('.').pop()!.split('?')[0]
  return `${hash}.${ext}`
}

// right under makeFileName(...)
function getDocFileName(url: string): string {
  // grab “foo.pdf” (or whatever) out of “https://…/foo.pdf?token=…”
  // Handle both regular S3 URLs and pre-signed URLs
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    // If filename is empty or doesn't have an extension, fall back to old method
    if (!filename || !filename.includes('.')) {
      const fallback = url.split('/').pop()!.split('?')[0];
      return decodeURIComponent(fallback);
    }
    
    // Decode URL-encoded characters (like %20 for spaces, %CC%81 for accents)
    return decodeURIComponent(filename);
  } catch (error) {
    // Fallback to old method if URL parsing fails
    const fallback = url.split('/').pop()!.split('?')[0];
    return decodeURIComponent(fallback);
  }
}


async function getUserId(): Promise<string> {
  const token = await getToken()
  if (!token) throw new Error('No authentication token found')
  const { sub: userId } = jwtDecode<JwtPayload>(token)
  return userId
}

/**
 * Ensure the folder exists and return its URI
 */
async function ensureFolder(path: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true })
  }
  return path
}

/**
 * Creates user-specific folders for images and documents
 */
export async function initUserMediaFolder(): Promise<string> {
  const userId = await getUserId()
  const imgDir = `${MEDIA_BASE}/${userId}/images`
  return ensureFolder(imgDir)
}

export async function initUserDocsFolder(): Promise<string> {
  const userId = await getUserId()
  const docDir = `${MEDIA_BASE}/${userId}/documents`
  return ensureFolder(docDir)
}

/**
 * Sync down images AND documents from the backend
 */
export async function syncMedia(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  try {
    // 1. Fetch the media manifest from your backend
    const res = await fetch(endpoints.media, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch media: ${res.status}`);
    }

    // 2. Parse out the two arrays
    const { images, documents } = (await res.json()) as {
      images: Array<{ url: string }>;
      documents: Array<{ url: string }>;
    };

    // 3. Download images (only if missing)
    const imgDir = await initUserMediaFolder();
    for (const { url } of images) {
      const name = await makeFileName(url);
      const fileUri = `${imgDir}/${name}`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        await FileSystem.downloadAsync(url, fileUri);
      }
    }

    // 4. Download documents (only if missing)
    const docDir = await initUserDocsFolder();
    for (const { url } of documents) {
      const name = getDocFileName(url);
      const fileUri = `${docDir}/${name}`;
      const info = await FileSystem.getInfoAsync(fileUri);
      
      // Only download if file doesn't exist
      if (!info.exists) {
        console.log('Downloading document:', url, 'to:', fileUri);
        try {
          await FileSystem.downloadAsync(url, fileUri);
          // Verify the download
          const newInfo = await FileSystem.getInfoAsync(fileUri);
          console.log('Downloaded file size:', 'size' in newInfo ? newInfo.size : 'unknown');
          if ('size' in newInfo && newInfo.size && newInfo.size < 1000) {
            console.warn('Downloaded file is suspiciously small:', newInfo.size);
            console.error('Server is serving corrupted documents. File size:', newInfo.size);
          }
        } catch (error) {
          console.error('Failed to download document:', error);
        }
      } else {
        // File exists, check if it's corrupted
        if ('size' in info && info.size && info.size < 1000) {
          console.warn('Existing file is corrupted (small size):', info.size, 'bytes');
        }
      }
    }

  } catch (e) {
    // If offline or any step fails, we swallow the error
    // so the UI can still read whatever is already cached on disk.
    console.warn('syncMedia failed (possibly offline); loading cache only:', e);
  }
}


/**
 * List local image URIs
 */
export async function getLocalMediaUris(): Promise<string[]> {
  const imgDir = await initUserMediaFolder()
  const files = await FileSystem.readDirectoryAsync(imgDir)
  return files.map(name => `${imgDir}/${name}`)
}

/**
 * List local document URIs
 */
export async function getLocalDocumentUris(): Promise<string[]> {
  const docDir = await initUserDocsFolder()
  const files = await FileSystem.readDirectoryAsync(docDir)
  return files.map(name => `${docDir}/${name}`)
}

/**
 * Clear all cached media and force re-download
 */
export async function clearMediaCache(): Promise<void> {
  try {
    const userId = await getUserId()
    const mediaDir = `${MEDIA_BASE}/${userId}`
    
    // Check if the directory exists
    const info = await FileSystem.getInfoAsync(mediaDir)
    if (info.exists) {
      // Delete the entire user media directory
      await FileSystem.deleteAsync(mediaDir, { idempotent: true })
      console.log('Cleared media cache for user:', userId)
    }
  } catch (error) {
    console.error('Error clearing media cache:', error)
  }
}