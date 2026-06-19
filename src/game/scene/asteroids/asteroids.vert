attribute vec3 highlightColor;
attribute float pointOpacity;
varying vec3 vColor;
varying float vOpacity;

void main() {
  vColor = highlightColor;
  vOpacity = pointOpacity;
  gl_PointSize = 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
