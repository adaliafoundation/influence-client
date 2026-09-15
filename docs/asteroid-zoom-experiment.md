# Scale-aware asteroid zoom

Entry and exit now animate one shared progress value. The far portion interpolates
log distance; the visible portion interpolates inverse distance (an apparent-size
proxy at fixed FOV). The join matches velocity. Entry spends 35% of its duration
on distant travel and 65% on visible growth; exit reverses this distribution.
The visible threshold is approximately 3% of viewport height using the asteroid's
maximum stretched radius. Duration remains three seconds in and two seconds out.

Scene translation is interpolated relative to camera distance, so astronomical
coordinates do not dominate the final framing. View direction and up direction
interpolate on arcs; the endpoints restore the saved camera and scene positions.
Entry follows the live orbital center throughout the flight, uses zero local
offset at arrival, and hands off to normal tracking with the same centering rule.
It does not reuse the scene translation cached before terrain loading.
The point marker fades according to apparent size rather than an independent
clock. The completed fade is held until React commits the destination zoom state,
preventing the point marker from reappearing during a one-frame handoff. Controls are temporarily disabled during the transition, with the prior
state restored on completion or cancellation. Destination control limits are applied
synchronously before controls resume, so the belt minimum distance cannot push
the camera away for a frame at asteroid arrival. Existing camera tweens are stopped
when the new transition takes over.

Terrain readiness and terrain preparation retain their existing behavior.
Lot travel uses a separate eased spherical arc, with lift proportional to angular
distance and a cap for long trips. Normal trips take 0.6–2.5 seconds; dramatic
trips take 1.8–7.5 seconds. Visual tuning still requires checking large and small asteroids, entry
from different system viewpoints, exit from low altitude, and interrupted travel.

