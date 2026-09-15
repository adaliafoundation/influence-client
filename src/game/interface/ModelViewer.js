import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimationMixer, Box3, Color, DirectionalLight, EquirectangularReflectionMapping, LoopRepeat, Raycaster, Vector2, Vector3 } from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { useFrame, useThree, Canvas } from '@react-three/fiber';
import { useCubeTexture } from '@react-three/drei';
import { PropagateLoader } from 'react-spinners';
import styled from 'styled-components';

import Details from '~/components/DetailsFullsize';
import Postprocessor, { BLOOM_LAYER } from '~/game/Postprocessor';
import useStore from '~/hooks/useStore';
import { formatFixed } from '~/lib/utils';
import visualConfigs from '~/lib/visuals';

// TODO: connect to gpu-graphics settings?
const ENABLE_SHADOWS = true;
const MAX_LIGHTS = 10;
const DOWN = new Vector3(0, -1, 0);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderConfig({ type: 'js' });
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const CanvasContainer = styled.div`
  height: 100%;
  opacity: ${p => p.ready ? 1 : 0};
  transition: opacity 250ms ease;
  width: 100%;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    height: 100%;
    max-height: none;
    max-width: none;
    width: 100%;
  }
`;

const IconContainer = styled.div`
  background: black;
  border: 1px solid rgba(255, 255, 255, 0.25);
  bottom: 105px;
  left: 32px;
  height: 115px;
  position: absolute;
  width: 115px;
  z-index: 2;
  & > img {
    max-height: 100%;
    width: 100%;
  }

  @media (max-width: 600px) {
    display: none;
  }
`;

const CameraInfo = styled.div`
  background: rgba(128, 128, 128, 0.25);
  color: white;
  padding: 5px 10px;
  position: absolute;
  left: 15px;
  bottom: 140px;
  z-index: 1000;
`;

const LoadingContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100vh;
  justify-content: center;
  left: 0;
  top: 0;
  width: 100vw;
  position: absolute;
  z-index: 10;
  & > div:last-child {
    font-weight: bold;
    margin-top: 8px;
  }
`;

const loadTexture = (file, filename = '') => {
  return new Promise((resolve) => {
    if (/\.hdr$/i.test(filename || file || '')) {
      new RGBELoader().load(file, resolve);
    } else {
      new THREE.TextureLoader().load(file, resolve);
    }
  })
};

let currentModelLoadId;

const Model = ({ url, onLoaded, onProgress, onCameraUpdate, ...settings }) => {
  const { camera, clock, gl, scene } = useThree();
  const pixelRatio = useStore(s => s.graphics.pixelRatio);

  useEffect(() => {
    gl.setPixelRatio(pixelRatio || 1);
  }, [pixelRatio]);

  // if three is started with frameloop == 'never', clock is not set to autoStart, so we need to set it
  useEffect(() => {
    if (clock && !clock.autoStart) clock.autoStart = true;
  }, []);

  const animationMixer = useRef();
  const maxCameraDistance = useRef();
  const controls = useRef();
  const model = useRef();

  const cameraReportTime = useRef();
  const cameraCenterOffset = useRef();
  const scaleValue = useRef();

  const collisionFloor = useRef();
  const raycaster = useRef(new Raycaster());

  // init the camera (reset when url changes)
  useEffect(() => {
    // TODO (enhancement): on mobile, aspect ratio is such that zoomed out to 1 may not have
    //  view of full width of 1.0 at 0,0,0... so on mobile, should probably set this to 1.5+
    const zoom = settings.initialZoom || 1;
    camera.position.set(0, 0.75 * zoom, 1.5 * zoom);
    camera.up.set(0, 1, 0);
    camera.fov = 50;
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.update();
    }
  }, [settings.initialZoom, url]); // eslint-disable-line react-hooks/exhaustive-deps

  // init orbitcontrols
  useEffect(() => {
    controls.current = new OrbitControls(camera, gl.domElement);
    controls.current.target.set(0, 0, 0);
    controls.current.zoomSpeed = 0.33;

    controls.current.object.near = settings.enablePostprocessing ? 0.0018 : 0.01;  // postprocessing introduces acne if near is too low
    controls.current.object.far = 10;
    controls.current.object.updateProjectionMatrix();

    return () => {
      controls.current.dispose();
    };
  }, [camera, gl, settings.enablePostprocessing, url]);

  useEffect(() => {
    if (settings.enableZoomLimits && settings.simpleZoomConstraints) {
      controls.current.minDistance = settings.simpleZoomConstraints[0];
      controls.current.maxDistance = settings.simpleZoomConstraints[1];
    } else {
      controls.current.minDistance = 0;
      controls.current.maxDistance = Infinity;
    }
  }, [settings.simpleZoomConstraints, settings.enableZoomLimits]);

  // // init axeshelper
  // useEffect(() => {
  //   const axesHelper = new THREE.AxesHelper(5);
  //   scene.add(axesHelper);
  //   return () => {
  //     scene.remove(axesHelper);
  //   };
  // }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // load the model on url change
  useEffect(() => {
    if (model.current) {
      console.log('previous model not unloaded', model.current);
      return;
    }

    const helpers = [];

    // load the model
    const loadId = Date.now();
    currentModelLoadId = loadId + 0;
    loader.load(
      url,

      // onload
      function (gltf) {
        // if a new load has started, abandon the previous run
        if (currentModelLoadId !== loadId) {
          console.log('double load, abandoning older', loadId);
          return;
        }

        let predefinedCenter;
        let predefinedCamera;
        let totalLights = 0;

        const removeNodes = [];
        model.current = gltf.scene || gltf.scenes[0];
        model.current.traverse(function (node) {
          if (node.name === 'Center') {
            predefinedCenter = node.position.clone();
          } else if (node.name === 'Camera') {
            predefinedCamera = node.position.clone();
          } else if (node.isMesh) {
            // self-shadowing
            if (ENABLE_SHADOWS) {
              node.castShadow = true;
              node.receiveShadow = true;
            }

            if (node.name === settings.floorNodeName) {
              node.castShadow = false;
              collisionFloor.current = node;
            }

            // env-map intensity
            if (node.material?.envMapIntensity) {
              node.material.envMapIntensity = settings.envmapStrength || 1;
            }

            // rewrite emissive map to lightmap
            if (settings.emissiveMapAsLightMap) {
              if (node.material?.emissiveMap) {
                if (node.material.lightMap) console.warn('LIGHTMAP overwritten by emissiveMap', node);

                node.material.lightMap = node.material.emissiveMap;
                node.material.lightMapIntensity = settings.lightmapStrength;

                node.material.emissive = new Color(0x0);
                node.material.emissiveMap = null;
              }
            } else if (node.material.lightMap) {
              node.material.lightMapIntensity = settings.lightmapStrength;
            }

            // use no-map emissive color as indication mesh should be bloomed
            // NOTE: this only does something if bloom postprocessing is also enabled
            if (settings.emissiveAsBloom) {
              if (node.material.emissive && node.material.emissive.getHex() > 0) {
                if (node.material.emissiveIntensity > 1) {
                  console.warn(`emissiveIntensity > 1 on material "${node.material.name}" @ node "${node.name}"`);
                  node.material.emissiveIntensity = Math.min(node.material.emissiveIntensity, 1);
                }
                node.layers.enable(BLOOM_LAYER);
              }
            }

            // no depth evaluation on transparent materials (NOTE: this may happen automatically in gltfloader now)
            // (from https://github.com/donmccurdy/three-gltf-viewer/blob/main/src/viewer.js)
            node.material.depthWrite = !node.material.transparent;

          // allow embedded spotlights per settings (up to MAX_LIGHTS)
          } else if (node.isLight) {
            if (settings.enableModelLights && node.isSpotLight) {
              if (totalLights < MAX_LIGHTS) {
                node.castShadow = true;
                node.shadow.bias = -0.0001;
                node.userData.initIntensity = node.intensity;
                node.intensity /= (settings.spotlightReduction || 1);
              } else {
                console.warn(`excessive light (#${totalLights}) removed: `, node.name);
              }
              totalLights++;

            } else {
              console.warn(`unexpected light (${node.type}) removed: `, node.name);
              removeNodes.push(node);
            }
          }

          // disable frustum culling because several of the models have some issues with the
          // animated parts getting culled even when still visible
          // TODO (enhancement): could potentially try applying this just to animated objects?
          node.frustumCulled = false;
        });
        removeNodes.forEach((node) => node.removeFromParent());

        // resize
        //  (assuming rotating around y, then make sure max x-z dimensions
        //   fit inside 1 and y-height fit inside 1)
        const bbox = new Box3().setFromObject(model.current);
        // const crossVector = new Vector3();
        // crossVector.subVectors(
        //   new Vector3(bbox.max.x, 0, bbox.max.z),
        //   new Vector3(bbox.min.x, 0, bbox.min.z),
        // );
        // const height = bbox.max.y - bbox.min.y;
        // const scaleValue = 1.0 / Math.max(height, crossVector.length());
        scaleValue.current = 1.0 / Math.max(
          bbox.max.x - bbox.min.x,
          bbox.max.y - bbox.min.y,
          bbox.max.z - bbox.min.z
        );
        model.current.scale.set(scaleValue.current, scaleValue.current, scaleValue.current);

        // resize shadow cameras (these don't automatically resize with the rest of the model)
        model.current.traverse(function (node) {
          if (node.isSpotLight) {
            node.decay = 1;

            // NOTE: if near and far are able to be set by blender / exported into the glb (it seems they are not)
            //  we would *= the near and far by scaleValue here instead
            node.shadow.camera.near = 0.00001;
            node.shadow.camera.far = 1;
            node.shadow.camera.fov = 180 * (2 * node.angle / Math.PI);
            node.shadow.mapSize = new Vector2(1024, 1024);
            node.shadow.camera.updateProjectionMatrix();

            // const cameraHelper = new THREE.CameraHelper(node.shadow.camera);
            // helpers.push(cameraHelper);
          }
        });

        // reposition (to put center at origin or predefined point)
        let center;
        if (predefinedCenter) {
          center = predefinedCenter.clone().setLength(predefinedCenter.length() * scaleValue.current);
        } else {
          bbox.setFromObject(model.current);
          center = bbox.getCenter(new Vector3());
        }
        model.current.position.x += model.current.position.x - center.x;
        model.current.position.y += model.current.position.y - center.y;
        model.current.position.z += model.current.position.z - center.z;
        cameraCenterOffset.current = center;

        // if camera is predefined, position camera accordingly
        if (predefinedCamera) {
          const cam = predefinedCamera.clone().setLength(predefinedCamera.length() * scaleValue.current);
          controls.current.object.position.set(
            cam.x + model.current.position.x,
            cam.y + model.current.position.y,
            cam.z + model.current.position.z
          );
          controls.current.update();
        }

        if (settings.maxCameraDistance) {
          // maxCameraDistance.current = 2 * controls.current.object.position.length();
          maxCameraDistance.current = settings.maxCameraDistance;
        }

        // bbox.setFromObject(model.current);
        // helpers.push(new THREE.Box3Helper(bbox));

        // initial rotation simulates initial camera position in blender
        // (halfway between the x and z axis)
        // model.current.rotation.y = -Math.PI / 4;

        // add to scene and report as loaded
        scene.add(model.current);
        helpers.forEach((helper) => scene.add(helper));

        // init animation mixer
        if (gltf.animations?.length > 0) {
          animationMixer.current = new AnimationMixer(model.current);
          gltf.animations.forEach((action) => {
            const clip = animationMixer.current.clipAction(action);
            clip.setLoop(LoopRepeat);
            clip.play();
          });
        }

        onLoaded(true);
      },

      // onprogress
      // TODO (enhancement): share the below with user
      (xhr) => {
        onProgress(xhr.loaded / xhr.total);
      },

      // onerror
      (error) => {
        console.error(error);
        onLoaded(false);
      }
    );

    // (clean-up)
    return () => {
      if (model.current) {
        model.current.children.forEach((n) => {
          if (n.parent) n.removeFromParent();
          else scene.remove(n);
        });
        scene.remove(model.current);
        model.current = null;
      }
      (helpers || []).forEach((helper) => scene.remove(helper));
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLoaded, url]); // (do not include settings here, update in their own hooks)

  useEffect(() => {
    scene.environmentIntensity = settings.envmapStrength;

    if (!model.current) return;
    model.current.traverse(function (node) {
      if (node.isMesh) {
        if (node.material?.envMapIntensity) {
          node.material.envMapIntensity = settings.envmapStrength;
        }
      }
    });
  }, [settings.envmapStrength]);

  useEffect(() => {
    if (!model.current) return;
    model.current.traverse(function (node) {
      if (node.isMesh) {
        if (node.material?.lightMap) {
          node.material.lightMapIntensity = settings.lightmapStrength;
        }
      }
    });
  }, [settings.lightmapStrength]);

  useEffect(() => {
    if (!model.current) return;
    model.current.traverse(function (node) {
      if (node.isSpotLight) {
        node.intensity = node.userData.initIntensity / (settings.spotlightReduction || 1);
      }
    });
  }, [settings.spotlightReduction]);

  useEffect(() => {
    scene.backgroundIntensity = settings.backgroundStrength;
  }, [settings.backgroundStrength]);

  useEffect(() => {
    if (!!controls?.current) {
      controls.current.autoRotate = !!settings.enableRevolution;
      controls.current.autoRotateSpeed = -0.15;
    }
  }, [!!controls?.current, settings.enableRevolution]);

  useFrame((state, delta) => {
    if (model.current && settings.enableRotation) {
      model.current.rotation.y += 0.0025;
    }
    if (animationMixer.current) {
      animationMixer.current.update(delta);
    }

    // apply camera constraints to building scene
    if (controls.current && controls.current.object && controls.current.target) {
      let updateControls = false;
      if (maxCameraDistance.current || collisionFloor.current) {

        // collision detection on asteroid terrain
        if (collisionFloor.current) {
          raycaster.current.set(
            new Vector3(
              controls.current.object.position.x,
              1,
              controls.current.object.position.z,
            ),
            DOWN
          );
          const intercepts = raycaster.current.intersectObject(collisionFloor.current, false);
          if (intercepts.length > 0) {
            const buffer = controls.current.object.near;
            if (intercepts[0].point.y + buffer > controls.current.object.position.y) {
              controls.current.object.position.set(
                controls.current.object.position.x,
                intercepts[0].point.y + buffer * 1.001,
                controls.current.object.position.z,
              );
              updateControls = true;
            }
          }
        }

        // max camera distance (enforcing on zoom and on pan)
        if (settings.enableZoomLimits && maxCameraDistance.current) {
          // don't let camera beyond distance (if defined)
          if (controls.current.object.position.length() > maxCameraDistance.current) {
            controls.current.object.position.setLength(maxCameraDistance.current);
            updateControls = true;
          }
          // don't let target beyond third of distance (to make sure generally stay facing model)
          if (controls.current.target.length() > maxCameraDistance.current * 0.33) {
            controls.current.target.setLength(maxCameraDistance.current * 0.33);
            updateControls = true;
          }
        }
      }

      if (updateControls || settings.enableRevolution) {
        controls.current.update();
      }
    }

    if (onCameraUpdate && controls.current.object && controls.current.target) {
      if ((cameraReportTime.current || 0) < Date.now() - 250) {
        const adjustedObject = cameraCenterOffset.current.clone().add(controls.current.object.position);
        const adjustedTarget = cameraCenterOffset.current.clone().add(controls.current.target);
        onCameraUpdate({
          object: Object.values(adjustedObject).map((x) => formatFixed(x / scaleValue.current, 1)).join(', '),
          target: Object.values(adjustedTarget).map((x) => formatFixed(x / scaleValue.current, 1)).join(', '),
        });
      }
    }
  });

  return null;
  // return (
  //   <mesh>
  //     <boxGeometry args={[1, 1, 1]} />
  //     <meshStandardMaterial color="orange" opacity={0.2} transparent />
  //   </mesh>
  // );
}

// only overrides will have names
const Skybox = ({ background, envmap, onLoaded, backgroundOverrideName = '', envmapOverrideName = '' }) => {
  const { scene } = useThree();

  const defaultBackground = useCubeTexture(
    ['sky_pos_x.jpg', 'sky_neg_x.jpg', 'sky_pos_y.jpg', 'sky_neg_y.jpg', 'sky_pos_z.jpg', 'sky_neg_z.jpg'],
    { path: `${process.env.PUBLIC_URL}/textures/skybox/`}
  );

  useEffect(() => {
    let cleanupTextures = [];

    let waitingOn = 0;
    if (background) {
      waitingOn++;
      loadTexture(background, backgroundOverrideName).then(function (texture) {
        cleanupTextures.push(texture);
        texture.mapping = EquirectangularReflectionMapping;
        scene.background = texture;

        if (background === envmap) {
          scene.environment = texture;
        }

        waitingOn--;
        if (waitingOn === 0) onLoaded();
      });
    } else {
      scene.background = defaultBackground;
    }

    if (envmap) {
      if (background !== envmap) {
        waitingOn++;
        loadTexture(envmap, envmapOverrideName).then(function (texture) {
          cleanupTextures.push(texture);
          texture.mapping = EquirectangularReflectionMapping;
          scene.environment = texture;
          // console.log('env is set to', texture)

          waitingOn--;
          if (waitingOn === 0) onLoaded();
        });
      }
    } else {
      scene.environment = defaultBackground;
    }

    if (waitingOn === 0) onLoaded();

    return () => {
      scene.background = null;
      scene.environment = null;
      cleanupTextures.forEach((t) => t.dispose());
    };
  }, [background, envmap]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

const Lighting = ({ keylightIntensity = 1.0, rimlightIntensity = 0.25 }) => {
  const { gl, scene } = useThree();

  useEffect(() => {
    let keyLight;
    if (keylightIntensity > 0) {
      keyLight = new DirectionalLight(0xFFFFFF);
      keyLight.intensity = keylightIntensity;
      keyLight.position.set(-2, 2, -1);
      scene.add(keyLight);

      if (ENABLE_SHADOWS) {
        gl.shadowMap.enabled = true;
        keyLight.castShadow = true;
        keyLight.shadow.camera.near = 3.40;
        keyLight.shadow.camera.far = 3.525;
        keyLight.shadow.camera.bottom = keyLight.shadow.camera.left = -0.05;
        keyLight.shadow.camera.right = keyLight.shadow.camera.top = 0.05;
        keyLight.shadow.camera.updateProjectionMatrix();
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.mapSize.width = 1024;
      }
    }

    let rimLight;
    if (rimlightIntensity > 0) {
      rimLight = new DirectionalLight(0x9ECFFF);
      rimLight.intensity = rimlightIntensity;
      rimLight.position.set(4, 2, -2);
      scene.add(rimLight);
    }

    // const spotlightFOV = Math.PI / 2.3;
    // const spotlightTilt = 0.006;
    // const spotlights = [
    //   new THREE.SpotLight(0xffffff, 0, 1, spotlightFOV, 1.0),
    //   new THREE.SpotLight(0xffffff, 1, 1, spotlightFOV, 1.0)
    // ];
    // if (spotlights[0]) {
    //   spotlights[0].position.set(-0.0095, 0.0535, 0.005);
    //   spotlights[0].target.position.set(spotlights[0].position.x, spotlights[0].position.y - 0.01, spotlights[0].position.z);

    //   // spotlights[0].position.set(-0.007, 0.055, 0.005);
    //   // spotlights[0].target.position.set(spotlights[0].position.x - spotlightTilt, spotlights[0].position.y - 0.01, spotlights[0].position.z);

    //   // spotlights[0].position.set(-0.0095, 0.055, 0.0075);
    //   // spotlights[0].target.position.set(spotlights[0].position.x, spotlights[0].position.y - 0.01, spotlights[0].position.z - spotlightTilt);
    // }
    // if (spotlights[1]) {
    //   spotlights[1].position.set(-0.012, 0.055, 0.005);
    //   spotlights[1].target.position.set(spotlights[1].position.x + spotlightTilt, spotlights[1].position.y - 0.01, spotlights[1].position.z);

    //   // spotlights[1].position.set(-0.0095, 0.055, 0.0025);
    //   // spotlights[1].target.position.set(spotlights[1].position.x, spotlights[1].position.y - 0.01, spotlights[1].position.z + spotlightTilt);

    //   spotlights[1].position.set(-0.0012, 0.045, 0.005);
    //   spotlights[1].target.position.set(-0.01, 0.040, 0.005);
    // }

    // const helpers = [];

    // spotlights.forEach((spotlight, i) => {
    //   spotlight.castShadow = true;

    //   scene.add(spotlight);
    //   scene.add(spotlight.target);

    //   spotlight.shadow.bias = -0.01;
    //   spotlight.shadow.mapSize.height = 1024;
    //   spotlight.shadow.mapSize.width = 1024;

    //   spotlight.shadow.camera.near = 0.0025;
    //   spotlight.shadow.camera.far = 0.01;
    //   spotlight.shadow.camera.fov = 180 * (2 * spotlightFOV);
    //   spotlight.shadow.camera.updateProjectionMatrix();

    //   if (i === 1) {
    //     // helpers.push(new THREE.SpotLightHelper(spotlight));
    //     helpers.push(new THREE.CameraHelper(spotlight.shadow.camera));
    //   }
    // })
    // helpers.forEach((helper) => {
    //   scene.add(helper);
    // });

    // const helper1 = new THREE.CameraHelper( keyLight.shadow.camera );
    // scene.add(helper1);
    // const helper2 = new THREE.DirectionalLightHelper(keyLight);
    // scene.add(helper2);
    // const helper3 = new THREE.CameraHelper(keyLight.shadow.camera);
    // scene.add(helper3);
    // const helper4 = new THREE.Mesh(
    //   new THREE.BoxGeometry(0.005, 0.005, 0.005),
    //   new THREE.MeshPhysicalMaterial({ color: 0xff0000 })
    // )
    // helper4.position.set(0, 0.1, 0);
    // helper4.castShadow = true;
    // scene.add(helper4);
    // const helper5 = new THREE.Mesh(
    //   new THREE.PlaneGeometry(0.02, 0.02),
    //   new THREE.MeshPhysicalMaterial({ color: 0x00ff00 })
    // )
    // helper5.position.set(0, 0.08, 0);
    // helper4.receiveShadow = true;
    // helper5.lookAt(new Vector3(0, 2, 0));
    // scene.add(helper5);

    return () => {
      if (keyLight) scene.remove(keyLight);
      if (rimLight) scene.remove(rimLight);
      // if (spotlights) spotlights.forEach((spotlight) => { scene.remove(spotlight.target); scene.remove(spotlight); });
      // if (helpers) helpers.forEach((helper) => scene.remove(helper));
      // if (helper1) scene.remove(helper1);
      // if (helper2) scene.remove(helper2);
      // if (helper3) scene.remove(helper3);
      // if (helper4) scene.remove(helper4);
      // if (helper5) scene.remove(helper5);
    };
  }, [keylightIntensity, rimlightIntensity]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

const Loader = () => {
  return (
    <LoadingContainer>
      <PropagateLoader color="#aaa" />
    </LoadingContainer>
  );
};

const ModelViewer = ({ assetType, modelUrl, ...overrides }) => {
  const canvasStack = useStore(s => s.canvasStack);
  const dispatchCanvasStacked = useStore(s => s.dispatchCanvasStacked);
  const dispatchCanvasUnstacked = useStore(s => s.dispatchCanvasUnstacked);

  const [cameraInfo, setCameraInfo] = useState();
  const [loadingSkybox, setLoadingSkybox] = useState(true);
  const [loadingModel, setLoadingModel] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const settings = useMemo(() => {
    const overridden = { ...visualConfigs.modelViewer[assetType] };
    Object.keys(overrides).forEach((k) => {
      if (overrides[k] !== null && overrides[k] !== undefined) {
        overridden[k] = overrides[k];
      }
    });
    return overridden;
  }, [assetType, overrides]);

  useEffect(() => {
    dispatchCanvasStacked(assetType);
    return () => dispatchCanvasUnstacked(assetType);
  }, []);

  useEffect(() => {
    if (modelUrl) setLoadingModel(true);
  }, [modelUrl]);

  useEffect(() => {
    setLoadingSkybox(true);
  }, [settings.background, settings.envmap]);

  const onModelLoaded = useCallback(() => setLoadingModel(false), []);
  const onSkyboxLoaded = useCallback(() => setLoadingSkybox(false), []);

  useEffect(() => {
    setIsLoading(loadingModel || loadingSkybox);
  }, [ loadingModel, loadingSkybox ]);

  const [progress, setProgress] = useState(0);

  const bloomParams = useMemo(() => ({
    radius: settings?.bloomRadius,
    strength: settings?.bloomStrength,
    threshold: settings?.bloomThreshold,
    toneMapping: settings?.toneMapping,
    toneMappingExposure: settings?.toneMappingExposure,
  }), [settings]);

  // TODO: is Details best component to wrap this in?
  // TODO: is canvasStack assetType causing a problem since it might change?
  return (
    <Details
      edgeToEdge
      hideClose
      lowerZIndex>
      {isLoading && (
        <Loader progress={progress} />
      )}

      <CanvasContainer ready={!isLoading}>
        {/* TODO: was antialias={false} */}
        <Canvas
          frameloop={canvasStack[0] === assetType ? 'always' : 'never'}
          linear={settings.enablePostprocessing/* postprocessing will handle gamma autocorrection */}
          resize={{ debounce: 5, scroll: false }}
          shadows
          style={{ height: '100%', width: '100%' }}>

          <Postprocessor enabled={settings.enablePostprocessing} bloomParams={bloomParams} />
          <Skybox
            background={settings.background}
            envmap={settings.envmap}
            backgroundOverrideName={settings.backgroundOverrideName}
            envmapOverrideName={settings.envmapOverrideName}
            onLoaded={onSkyboxLoaded}
          />

          {!loadingSkybox && modelUrl && (
            <Model
              onCameraUpdate={settings.trackCamera ? setCameraInfo : null}
              onLoaded={onModelLoaded}
              onProgress={setProgress}
              url={modelUrl}
              {...settings} />
          )}

          <Lighting
            keylightIntensity={settings.keylightIntensity}
            rimlightIntensity={settings.rimlightIntensity} />
        </Canvas>
      </CanvasContainer>

      {settings.trackCamera && cameraInfo && (
        <CameraInfo>
          <div><b>Center:</b> {cameraInfo.target}</div>
          <div><b>Camera:</b> {cameraInfo.object}</div>
        </CameraInfo>
      )}
    </Details>
  );
};

export default ModelViewer;
