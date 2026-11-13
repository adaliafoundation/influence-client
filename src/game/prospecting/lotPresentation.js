export function setProspectingLotVisibility(meshes, overlays, prospecting) {
  for (const [use, mesh] of Object.entries(meshes)) {
    mesh.visible = !prospecting || Number(use) !== 0;
  }
  for (const mesh of overlays) {
    if (mesh) mesh.visible = !prospecting;
  }
}
