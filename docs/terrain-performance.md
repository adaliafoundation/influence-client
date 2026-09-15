# Terrain performance experiment

Timing collection is off by default. To enable it, run this in the browser's
DevTools console, then reload:

```js
localStorage.setItem('terrainPerformance', '1');
location.reload();
```

After the scene settles, clear the initial measurements:

```js
window.terrainPerformance.reset();
```

Try a nearby lot jump, a distant lot jump on Adalia Prime, continuous mouse
rotation/zoom, or switching asteroids. Run each scenario separately, then inspect
or copy the results:

```js
console.table(window.terrainPerformance.report());
JSON.stringify(window.terrainPerformance.report(), null, 2);
```

Keep terrain quality and the route consistent between runs. Record perceived
stutter and arrival-to-detail delay alongside the numbers. To measure cold entry,
reload and enter the asteroid without resetting after arrival.

## Allocation experiment

Manual navigation and automated flights now allocate up to four chunks per frame,
with a 2 ms deadline clamped to the remaining frame budget. Allocation pauses
when eight chunks are awaiting preparation (running jobs, ready results, or
partially prepared chunks). While the camera is moving, preparation completes at most two chunks per frame
within 5 ms, clamped to the remaining frame budget. After 150 ms without movement,
preparation has no chunk-count cap and uses the remaining frame budget. Both paths
apply a chunk's geometry/maps and submit its textures together. Motion is sampled
in asteroid-local coordinates (position and up), including zoom, roll, and control
damping; automated flights always count as moving. Ready results are processed
oldest-first, completing the active chunk before starting another. Before a chunk is
marked prepared, its geometry buffers are uploaded with a zero-count draw into a
1×1 offscreen target, and its material is precompiled against the scene lighting.
The live mesh remains hidden and attached to its original parent. The warmup
restores the render target, draw range, XR flag, and renderer statistics policy.
The preparation deadline is checked before each step; one chunk can overrun it.
Shadow depth programs and GPU completion are not explicitly warmed/measured. The deadline is checked before each allocation; a single
allocation cannot be interrupted and may exceed the budget. Initial coarse
coverage and export preparation retain their existing allocation paths.

Compare the same route after resetting the report, watching both detail delay and
mouse smoothness. Batch allocation span should shrink if allocation pacing was
the bottleneck; worker queue time may increase as jobs are supplied faster.

## Interpreting the stages

- **geometry buffer warmup CPU:** offscreen zero-count rendering used to upload
  vertex and index buffers before the visible swap.
- **material warmup CPU:** material precompilation against the live scene lighting,
  for postprocessing and the current output target. Compare these with swap-frame
  render time to see whether first-render work has shifted out of the reveal.

- **quadtree recalculation CPU:** time in terrain camera-position updates,
  including destination calculations during lot jumps and normal navigation.
- **render CPU: swap frame / normal frame:** elapsed time around the existing
  render/postprocessing pass on frames with and without a terrain swap. This
  includes first-render setup and CPU-side submission, but does not isolate
  asteroid draw calls or GPU completion. It excludes earlier frame callbacks,
  including terrain preparation. These samples help narrow a long animation-frame
  warning; they are not a complete animation-frame profile.

- **batch size:** chunks in each replacement batch. This row uses `averageChunks`,
  `maxChunks`, and `recentP95Chunks`, not milliseconds.
- **batch allocation span:** wall time from starting a replacement batch until
  its final chunk has been allocated and its jobs submitted, including frame gaps.
- **chunk allocation CPU:** CPU time allocating/reconfiguring a chunk and
  submitting its geometry/map jobs; excludes batch planning and worker execution.
- **swap wait: incomplete batch:** per-chunk time from preparation until the last
  chunk in the batch is prepared.
- **swap wait: animation:** per-chunk wait after the entire batch is prepared
  while automated camera movement blocks swapping.
- **swap wait: frame scheduling:** per-chunk wait after the batch is prepared
  and outside animation, before the swap starts.

The three swap-wait categories are exclusive: time when a batch is both incomplete
and animating counts as incomplete-batch waiting. Animation transitions are
observed each frame. They approximately decompose prepared-to-visible-swap wait;
that total also includes CPU work during the swap itself.

- **geometry/maps queue:** time waiting for an available worker, including priority
  and concurrency limits.
- **geometry/maps worker round trip:** dispatch to response, including worker
  initialization, generation, message transport, and main-thread response delivery.
  This is not isolated generation time or GPU execution time.
- **ready to application wait:** both worker results are ready, but the frame loop
  has not started applying them yet.
- **geometry and map application:** CPU time applying geometry and map objects;
  includes main-thread procedural generation if the existing worker fallback runs.
- **texture upload submission:** CPU time in the renderer's texture initialization
  call. GPU completion and subsequent shader compilation are not measured.
- **prepared to visible swap wait:** textures have been submitted, but the chunk
  still waits for the complete batch and permission to swap after animation.
- **chunk allocation to visible swap:** overall per-chunk latency, ending when the
  mesh becomes visible in the scene graph, not when its pixels reach the screen.
- **visible swap CPU:** CPU time recycling the old batch and showing the new one.

Counts, averages, and maxima cover the interval since reset. Recent P95 uses at
most the last 120 samples per stage. Uploads are per texture, swaps per batch, and
other preparation stages per chunk; worker timings are per job. Stages overlap,
so do not add their averages. Reports combine active terrain managers, including
thumbnails; close unrelated asteroid previews for a cleaner comparison.

No rendering thresholds, concurrency limits, or stitching rules change when
profiling is enabled. For exact GPU/frame-stutter investigation, also capture a
browser Performance trace.

Disable collection and reload when finished:

```js
localStorage.removeItem('terrainPerformance');
location.reload();
```

## Cancellation

Disposing a terrain manager removes its queued geometry and map jobs from the
shared worker pool. Jobs already running finish normally; late results are safely
discarded. A unique manager ID protects replacement terrain and thumbnail jobs,
even when they refer to the same asteroid. Camera retargeting within a live
manager does not cancel batches: those still preserve the existing stitching and
complete-surface guarantees.
