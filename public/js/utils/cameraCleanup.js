export function stopStream(stream) {
  if (stream?.getTracks) {
    stream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (e) {
        // Ignore errors when stopping tracks
      }
    });
  }
}