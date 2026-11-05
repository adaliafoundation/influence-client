# In-scene prospecting playtest

First client implementation slice: asteroid-integrated interaction and rendering. Enabled only when `App.enableDevTools` is true. No SDK, server or contract changes.

## Try it

1. Run the normal client development environment (`npm run docker-up`).
2. Select a scanned asteroid and zoom to a lot. A direct example is `/lot/1073741829394` (Elyon, lot 250); close the launcher if it is covering the scene.
3. Open the Prospecting tab in the right-hand sidebar (beside Resources), choose a material, and enter prospecting. Closing or switching the sidebar pane exits the view and preserves the in-memory campaign.
4. Select sections directly on the asteroid. Move the depth cut to remove upper layers. Mouse rotation and zoom stay anchored to the starting lot; panning is disabled until exit. Selecting another section or changing depth does not move the pivot.
5. Follow discovers a section, Cross-cut measures quantity, and Characterize measures rate. Select an earlier section in “Drill from” to branch from it. One to ten samples; one selected claim.
6. Exit restores normal terrain rendering. Reopening the same origin/material resumes the in-memory playtest. Reloading loses it. “New playtest” explicitly resets the local campaign.

## Implementation

- `geometry.js`: true spherical Voronoi boundaries from SDK lot directions and existing terrain-adjusted lot positions. Neighbor candidates provide an undisplayed outer ring. Shared radial interpolation keeps adjacent polygons aligned. The mesh is a visualization, not a production lot-boundary authority.
- `ProspectingScene.js`: five radial 100 m bands at actual scene scale (no depth exaggeration), selectable prisms, revealed-grade colors, processed-section edges, upper-layer cutaway, and an opaque excavation floor/perimeter to occlude far-side terrain. Existing asteroid transforms and camera are reused.
- `ProspectingCamera.js` / `cameraAnchor.js`: fixed starting-lot orbit limited to 60° from overhead, local zoom distances, and restoration of the previous camera on exit.
- `terrainPresentation.js`: opaque, normally lit terrain with a cutaway matching the visible Voronoi lots, including chunks activated by terrain LOD updates. Chunk-local cube-face coordinates are transformed into lot space before clipping.
- `rules.js`: deterministic rules version 7 ported from the sandbox proof engine; its existing verified fixture is replayed in tests. This is the future SDK extraction boundary.
- `store.js`: local sampling adapter with fresh browser randomness and recorded actions/entropy. Quantity is boosted 50% after the reference calculation; rate is unchanged. No old proof is represented as verifying the boosted quantity.
- `ProspectingHUD.js`: existing ButtonAlt, Dropdown, SliderInput and HUD typography; hosted by the standard right-hand HUD menu, with no modal or second canvas. The N/S axis, pole markers, trajectory line, lot markers, captain location marker, hoppers, and crew movement arcs are hidden while prospecting.

## Deliberate first-slice limits

This is not completion of all client-stage work. Samples resolve instantly, there is no real permission/inventory/extraction-conflict enforcement, and claim selection does not generate a proof or start extraction. Future-block randomness is not available here. The SDK computes actual lot abundance; unscanned resources are not fabricated.

The 1.5 km approach and 3.5 km origin limits use a spherical surface-distance approximation in the rendering adapter. Production fixed-point geometry and proof metadata need reconciliation against canonical SDK positions, particularly for stretched terrain. Do not submit this adapter's metadata to contracts.

Private campaign records currently live only in memory. Encrypted persistence, recovery and libp2p replication still need implementation before campaign data can be treated as durable. Browser proving needs the +50% public claim quantity wired into updated circuits and keys; it is not connected in this slice. No production transactions are issued by this mode.

## Checks

Focused Jest tests cover small/large spherical cells, finite prism geometry, depth spacing, replay of a verified sandbox campaign, and restoration of terrain after late LOD additions. Run:

```sh
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/game/prospecting/geometry.spec.js src/game/prospecting/rules.spec.js src/game/prospecting/terrainPresentation.spec.js src/game/scene/asteroid/helpers/TerrainChunk.spec.js
```

The excavation samples the active terrain displacement geometry on entry, with contour points at most 100 m apart. Survey layers begin below 25 m of overburden and retain 100 m thickness (displayed depths are relative to that survey roof). The opaque floor is 2 m below the lowest layer; wall depth bias separates it from survey highlights. Terrain LOD changes can still introduce small differences from the entry-time surface snapshot.
