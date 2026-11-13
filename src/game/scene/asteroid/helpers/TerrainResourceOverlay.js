// Resource changes update only emissive maps, never terrain geometry.
// Display a resource switch as one batch instead of a nearest-first crawl.
export default class TerrainResourceOverlay {
  constructor(generate, reportError) {
    this.generate = generate;
    this.reportError = reportError;
    this.chunks = new Set();
    this.params = undefined;
    this.revision = 0;
    this.disposed = false;
  }

  add(chunk) {
    this.chunks.add(chunk);
    if (this.params !== undefined) this.refresh([chunk], this.params, this.revision);
  }

  remove(chunk) {
    this.chunks.delete(chunk);
  }

  set(params) {
    this.params = params || null;
    this.revision++;
    return this.refresh([...this.chunks], this.params, this.revision);
  }

  async refresh(chunks, params, revision) {
    const results = await Promise.all(chunks.map(async (chunk) => {
      const stamp = chunk._params;
      // Off and same-resource toggles are immediate and reuse the GPU texture.
      if (!params || chunk.hasResourceOverlay(params)) {
        chunk.setResourceOverlay(params);
        return { chunk, stamp };
      }
      chunk.setResourceOverlay(null);
      try {
        return { chunk, stamp, bitmap: await this.generate(chunk, params) };
      } catch (error) { return { chunk, stamp, error }; }
    }));
    for (const { chunk, stamp, bitmap, error } of results) {
      if (this.disposed || revision !== this.revision || !this.chunks.has(chunk) || chunk._params !== stamp) {
        bitmap?.close?.();
        bitmap?.dispose?.();
        continue;
      }
      if (error) this.reportError(error);
      else if (bitmap) chunk.setResourceOverlay(params, bitmap);
    }
  }

  dispose() {
    this.disposed = true;
    this.revision++;
    this.chunks.clear();
  }
}
