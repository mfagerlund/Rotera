// Image cache for viewpoint images in WorldView

const imageCache = new Map<string, HTMLImageElement>()
const loadingPromises = new Map<string, Promise<HTMLImageElement | null>>()

export function getCachedImage(url: string): HTMLImageElement | null {
  return imageCache.get(url) || null
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (imageCache.has(url)) {
    return Promise.resolve(imageCache.get(url)!)
  }

  if (loadingPromises.has(url)) {
    return loadingPromises.get(url)!
  }

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      imageCache.set(url, img)
      loadingPromises.delete(url)
      resolve(img)
    }

    img.onerror = () => {
      loadingPromises.delete(url)
      resolve(null)
    }

    img.src = url
  })

  loadingPromises.set(url, promise)
  return promise
}

export function preloadImages(urls: string[]): void {
  urls.forEach(url => loadImage(url))
}

export function clearImageCache(): void {
  imageCache.clear()
  loadingPromises.clear()
}
