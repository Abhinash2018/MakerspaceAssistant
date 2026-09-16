// React mounts the preview after the camera is requested. Wait for an actual
// decoded video frame before starting recognition; never scan a 0×0 element.
export async function waitForCamera(getVideo: () => HTMLVideoElement | null, current: () => boolean, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (current()) {
    const video = getVideo();
    if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return video;
    if (Date.now() >= deadline) throw new Error("The camera could not start. Check camera permission and try again.");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new DOMException("Cancelled", "AbortError");
}
