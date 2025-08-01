// src/helpers/mediaHelper.ts
import * as FileSystem from 'expo-file-system'
import { endpoints, API_BASE }        from './api'
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
export async function initUserMediaFolder(targetUserId?: number): Promise<string> {
  const userId = targetUserId ? targetUserId.toString() : await getUserId()
  const imgDir = `${MEDIA_BASE}/${userId}/images`
  return ensureFolder(imgDir)
}

export async function initUserDocsFolder(targetUserId?: number): Promise<string> {
  const userId = targetUserId ? targetUserId.toString() : await getUserId()
  const docDir = `${MEDIA_BASE}/${userId}/documents`
  return ensureFolder(docDir)
}

/**
 * Sync down images AND documents from the backend
 */
export async function syncMedia(targetUserId?: number): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  try {
    // 1. Fetch the media manifest from your backend
    const endpoint = targetUserId ? `${API_BASE}/admin/media/${targetUserId}` : endpoints.media;
    console.log('Fetching media from endpoint:', endpoint);
    console.log('Target user ID:', targetUserId);
    console.log('Token exists:', !!token);
    
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Error response:', errorText);
      throw new Error(`Failed to fetch media: ${res.status} - ${errorText}`);
    }

    // 2. Parse out the two arrays
    const { images, documents } = (await res.json()) as {
      images: Array<{ url: string }>;
      documents: Array<{ url: string; fileName?: string }>;
    };

    // 3. Download images (only if missing)
    const imgDir = await initUserMediaFolder(targetUserId);
    for (const { url } of images) {
      const name = await makeFileName(url);
      const fileUri = `${imgDir}/${name}`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        await FileSystem.downloadAsync(url, fileUri);
      }
    }

    // 4. Download documents (only if missing)
    const docDir = await initUserDocsFolder(targetUserId);
    for (const doc of documents) {
      // Use fileName if available, otherwise extract from URL
      const name = doc.fileName || getDocFileName(doc.url);
      const fileUri = `${docDir}/${name}`;
      const info = await FileSystem.getInfoAsync(fileUri);
      
      // Only download if file doesn't exist
      if (!info.exists) {
        console.log('Downloading document:', doc.url, 'to:', fileUri);
        try {
          await FileSystem.downloadAsync(doc.url, fileUri);
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
 * List local image URIs sorted by modification time (newest first)
 */
export async function getLocalMediaUris(targetUserId?: number): Promise<string[]> {
  try {
    const imgDir = await initUserMediaFolder(targetUserId)
    const files = await FileSystem.readDirectoryAsync(imgDir)
    
    // Get file info for each file to sort by modification time
    const fileInfos = await Promise.all(
      files.map(async (name) => {
        const fileUri = `${imgDir}/${name}`;
        const info = await FileSystem.getInfoAsync(fileUri);
        return { uri: fileUri, modificationTime: info.modificationTime || 0 };
      })
    );
    
    // Sort by modification time (newest first)
    fileInfos.sort((a, b) => b.modificationTime - a.modificationTime);
    
    return fileInfos.map(info => info.uri);
  } catch (error) {
    console.warn('Failed to read local media URIs:', error)
    return []
  }
}

/**
 * List local document URIs sorted by modification time (newest first)
 */
export async function getLocalDocumentUris(targetUserId?: number): Promise<string[]> {
  try {
    const docDir = await initUserDocsFolder(targetUserId)
    const files = await FileSystem.readDirectoryAsync(docDir)
    
    // Get file info for each file to sort by modification time
    const fileInfos = await Promise.all(
      files.map(async (name) => {
        const fileUri = `${docDir}/${name}`;
        const info = await FileSystem.getInfoAsync(fileUri);
        return { uri: fileUri, modificationTime: info.modificationTime || 0 };
      })
    );
    
    // Sort by modification time (newest first)
    fileInfos.sort((a, b) => b.modificationTime - a.modificationTime);
    
    return fileInfos.map(info => info.uri);
  } catch (error) {
    console.warn('Failed to read local document URIs:', error)
    return []
  }
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

/**
 * Sync down ALL media from all users (admin only)
 */
export async function syncAllMedia(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  try {
    // 1. Fetch all media from the backend
    const res = await fetch(`${API_BASE}/media/all`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to fetch all media:', res.status, errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const { images, documents } = await res.json();
    console.log(`Fetched ${images.length} images and ${documents.length} documents from all users`);

    // 2. Download images
    for (const img of images) {
      const fileName = await makeFileName(img.url);
      const imgDir = `${MEDIA_BASE}/all/images`;
      await ensureFolder(imgDir);
      const fileUri = `${imgDir}/${fileName}`;
      
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        console.log('Downloading image:', img.url);
        await FileSystem.downloadAsync(img.url, fileUri);
      }
    }

    // 3. Download documents
    for (const doc of documents) {
      const fileName = getDocFileName(doc.url);
      const docDir = `${MEDIA_BASE}/all/documents`;
      await ensureFolder(docDir);
      const fileUri = `${docDir}/${fileName}`;
      
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        console.log('Downloading document:', doc.url);
        await FileSystem.downloadAsync(doc.url, fileUri);
      }
    }

  } catch (e) {
    console.warn('syncAllMedia failed (possibly offline); loading cache only:', e);
  }
}

/**
 * List all local image URIs (admin only)
 */
export async function getAllLocalMediaUris(): Promise<string[]> {
  try {
    const imgDir = `${MEDIA_BASE}/all/images`;
    const info = await FileSystem.getInfoAsync(imgDir);
    if (!info.exists) return [];
    
    const files = await FileSystem.readDirectoryAsync(imgDir);
    
    // Get file info for each file to sort by modification time
    const fileInfos = await Promise.all(
      files.map(async (name) => {
        const fileUri = `${imgDir}/${name}`;
        const info = await FileSystem.getInfoAsync(fileUri);
        return { uri: fileUri, modificationTime: info.modificationTime || 0 };
      })
    );
    
    // Sort by modification time (newest first)
    fileInfos.sort((a, b) => b.modificationTime - a.modificationTime);
    
    return fileInfos.map(info => info.uri);
  } catch (error) {
    console.warn('Failed to read all local media URIs:', error);
    return [];
  }
}

/**
 * List all local document URIs (admin only)
 */
export async function getAllLocalDocumentUris(): Promise<string[]> {
  try {
    const docDir = `${MEDIA_BASE}/all/documents`;
    const info = await FileSystem.getInfoAsync(docDir);
    if (!info.exists) return [];
    
    const files = await FileSystem.readDirectoryAsync(docDir);
    
    // Get file info for each file to sort by modification time
    const fileInfos = await Promise.all(
      files.map(async (name) => {
        const fileUri = `${docDir}/${name}`;
        const info = await FileSystem.getInfoAsync(fileUri);
        return { uri: fileUri, modificationTime: info.modificationTime || 0 };
      })
    );
    
    // Sort by modification time (newest first)
    fileInfos.sort((a, b) => b.modificationTime - a.modificationTime);
    
    return fileInfos.map(info => info.uri);
  } catch (error) {
    console.warn('Failed to read all local document URIs:', error);
    return [];
  }
}