import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
  size: number; // in bytes
}

/**
 * Compresses an image to approximately 1MB or less
 * @param imageUri - The URI of the image to compress
 * @returns Promise<CompressedImage> - The compressed image info
 */
export const compressImage = async (imageUri: string): Promise<CompressedImage> => {
  try {
    // First, get the original file info
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    const originalSize = fileInfo.size || 0;
    
    console.log(`Original image size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // If already under 1MB, return as is
    if (originalSize <= 1024 * 1024) {
      console.log('Image already under 1MB, no compression needed');
      return {
        uri: imageUri,
        width: 0, // We'll get this from the compressed result
        height: 0,
        size: originalSize
      };
    }

    // Calculate compression quality based on original size
    // Target: 1MB = 1024 * 1024 bytes
    let quality = 0.8; // Start with 80% quality
    if (originalSize > 5 * 1024 * 1024) { // > 5MB
      quality = 0.6;
    } else if (originalSize > 3 * 1024 * 1024) { // > 3MB
      quality = 0.7;
    }

    // Compress the image
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [], // No transformations, just compression
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // Get the compressed file info
    const compressedInfo = await FileSystem.getInfoAsync(result.uri);
    const compressedSize = compressedInfo.size || 0;
    
    console.log(`Compressed image size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB (${(compressedSize / originalSize * 100).toFixed(1)}% of original)`);

    // If still too large, compress more aggressively
    if (compressedSize > 1024 * 1024 && quality > 0.3) {
      console.log('Still too large, compressing more aggressively...');
      const aggressiveResult = await ImageManipulator.manipulateAsync(
        result.uri,
        [],
        {
          compress: quality * 0.7, // Reduce quality further
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      
      const aggressiveInfo = await FileSystem.getInfoAsync(aggressiveResult.uri);
      const aggressiveSize = aggressiveInfo.size || 0;
      
      console.log(`Final compressed size: ${(aggressiveSize / 1024 / 1024).toFixed(2)} MB`);
      
      return {
        uri: aggressiveResult.uri,
        width: aggressiveResult.width,
        height: aggressiveResult.height,
        size: aggressiveSize
      };
    }

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      size: compressedSize
    };
  } catch (error) {
    console.error('Error compressing image:', error);
    // Return original if compression fails
    return {
      uri: imageUri,
      width: 0,
      height: 0,
      size: 0
    };
  }
};

/**
 * Compresses multiple images
 * @param imageUris - Array of image URIs to compress
 * @returns Promise<CompressedImage[]> - Array of compressed image info
 */
export const compressImages = async (imageUris: string[]): Promise<CompressedImage[]> => {
  const compressedImages: CompressedImage[] = [];
  
  for (const uri of imageUris) {
    try {
      const compressed = await compressImage(uri);
      compressedImages.push(compressed);
    } catch (error) {
      console.error(`Error compressing image ${uri}:`, error);
      // Add original if compression fails
      compressedImages.push({
        uri,
        width: 0,
        height: 0,
        size: 0
      });
    }
  }
  
  return compressedImages;
};
