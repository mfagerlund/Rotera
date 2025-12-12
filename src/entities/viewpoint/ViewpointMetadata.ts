/**
 * EXIF camera data that may be extracted from image metadata
 */
export interface ExifData {
  // Camera settings
  iso?: number
  fStop?: number
  exposureTime?: number  // in seconds
  focalLength?: number   // in mm (35mm equivalent)
  focalLengthActual?: number  // actual focal length in mm

  // Camera info
  make?: string
  model?: string
  lensModel?: string

  // Image info
  dateTime?: string
  orientation?: number

  // GPS data
  gpsLatitude?: number
  gpsLongitude?: number
  gpsAltitude?: number
}

/**
 * Metadata associated with a Viewpoint image.
 * Allows typed EXIF data plus arbitrary custom fields.
 */
export interface ViewpointMetadata {
  exif?: ExifData

  // Allow additional custom fields
  [key: string]: unknown
}
