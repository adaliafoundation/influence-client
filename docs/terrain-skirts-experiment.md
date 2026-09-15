# Terrain skirts

The live asteroid uses skirts while thumbnails/exports retain the previous path.
Skirts duplicate the perimeter vertices and extrude them inward after shader
height displacement, before asteroid stretch. Initial depth is 10% of chunk
width, capped at 25% of asteroid radius. Both surface and shadow shaders apply it.
The depth is a practical coverage margin; grazing-angle and shadow checks remain
useful when changing terrain displacement or LOD settings.

Connected changes no longer merge into one global swap. Edge-only rebuilds swap
individually. A parent is still replaced atomically by all its own required
children; a collapse likewise replaces its descendants together. Large individual
parent replacements can therefore still take time. Existing budgets, warmup,
backpressure, and animation swap guards remain in effect.

Test a distant lot jump, nearby navigation, low grazing views, the silhouette,
cube-face boundaries, and shadows/resource overlays. Look for exposed vertical
walls, stretched textures, seams, and changes in pop-in duration. Reset profiling
before comparing batch sizes and allocation-to-visible timing.

## Roll back

The accepted implementation no longer has a runtime A/B switch or the global
connected-region merge. The rollback patch retains the pre-skirt implementation.

For an exact rollback of the skirts and their cleanup, from the repository root:

```sh
git apply --reverse --check docs/terrain-skirts-experiment.patch
git apply --reverse docs/terrain-skirts-experiment.patch
```

The patch is relative to the working tree immediately before this experiment,
including the earlier performance improvements. It does not revert to HEAD.
If subsequent edits conflict, the check will fail; do not force it.
The patch file itself remains after rollback as a record of the experiment.
