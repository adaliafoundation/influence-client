class TerrainCameraMotion {
  update(position, up, animating, now) {
    // Sample in asteroid-local coordinates so surface tracking does not count
    // as user movement. Allow a short settling period for control damping.
    const tolerance = Math.max(0.01, position.length() * 1e-7);
    if (!this.position) {
      this.position = position.clone();
      this.up = up.clone();
      this.lastMovedAt = now;
    }
    if (animating || this.position.distanceToSquared(position) > tolerance * tolerance
      || this.up.distanceToSquared(up) > 1e-12) {
      this.lastMovedAt = now;
    }
    this.position.copy(position);
    this.up.copy(up);
    return now - this.lastMovedAt < 150;
  }
}

export default TerrainCameraMotion;
