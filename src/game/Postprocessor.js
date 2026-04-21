import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshBasicMaterial, ShaderMaterial, Vector2, WebGLRenderTarget, FloatType, RGBAFormat, SRGBColorSpace, ACESFilmicToneMapping } from 'three';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import useStore from '~/hooks/useStore';

export const BLOOM_LAYER = 11;

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0 );
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D baseTexture;
  uniform sampler2D bloomTexture;

  varying vec2 vUv;

  // vec4 gammaCorrection (vec4 color, float gamma) {
  //   return vec4(pow(color.rgb, vec3(1. / gamma)).rgb, color.a);
  // }

  void main() {
    // vec4 preGamma = vec4(1.5) * texture2D(baseTexture, vUv) + vec4(0.75) * texture2D(bloomTexture, vUv);
    // gl_FragColor = preGamma;
    // gl_FragColor = gammaCorrection(preGamma, 1.5);
    gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
  }
`;

const darkMaterial = new MeshBasicMaterial({ color: 'black' });

const defaultBloomParams = {
  threshold: 0,
  strength: 0.8,
  radius: 0.5,
}

const Postprocessor = ({ enabled, bloomParams = defaultBloomParams }) => {
  const { gl: renderer, camera, scene, size } = useThree();

  const pixelRatio = useStore(s => s.graphics.pixelRatio || 1);

  const bloomPass = useRef();
  const bloomComposer = useRef();
  const finalComposer = useRef();
  const backgrounds = useRef({});
  const colors = useRef({});
  const materials = useRef({});

  function darkenNonBloomed(obj) {
    if (obj.isScene && obj.background) {
      backgrounds.current[obj.uuid] = obj.background;
      obj.background = null;
    }
    if (obj.isLensflare) {
      obj.visible = false;
    } else if (obj.material && obj.material.opacity === 0) {
      obj.visible = false;
      // TODO (enhancement): support translucent materials by dynamically
      //  generating darkMaterial as needed for each opacity (i.e. darkMaterials[opacity])
      //  ... will only need to generate on first pass
    } else if (obj.material) {
      if (!obj.layers.isEnabled(BLOOM_LAYER)) {
        // TODO: is double-traversing some nodes, that's why these if's are here
        //  why is this happening?
        if (obj.material.displacementMap) {
          if (!colors.current[obj.uuid]) {
            colors.current[obj.uuid] = obj.material.color.clone();
            obj.material.color.set(0x000000);
          }
        } else if (obj.material.uuid !== darkMaterial.uuid) {
          materials.current[obj.uuid] = obj.material;
          obj.material = darkMaterial;
        }
      }
    }
  }

  function restoreMaterial( obj ) {
    if (obj.isScene && backgrounds.current[obj.uuid]) {
      obj.background = backgrounds.current[obj.uuid];
      delete backgrounds.current[obj.uuid];
    }
    if (obj.isLensflare) {
      obj.visible = true;
    } else if (obj.material && obj.material.opacity === 0) {
      obj.visible = true;
    } else if (obj.material) {
      if (obj.material.displacementMap && colors.current[obj.uuid]) {
        obj.material.color.copy(colors.current[obj.uuid]);
        delete colors.current[ obj.uuid ];
      } else if (!obj.material.displacementMap && materials.current[ obj.uuid ]) {
        obj.material = materials.current[ obj.uuid ];
        delete materials.current[ obj.uuid ];
      }
    }
  }

  useEffect(() => {
    renderer.toneMapping = bloomParams?.toneMapping === undefined ? ACESFilmicToneMapping : bloomParams?.toneMapping;
  }, [renderer, bloomParams?.toneMapping]);

  useEffect(() => {
    renderer.toneMappingExposure = bloomParams?.toneMappingExposure || 1;
  }, [renderer, bloomParams?.toneMappingExposure]);

  useEffect(() => {
    renderer.setPixelRatio(pixelRatio);
    const renderScene = new RenderPass(scene, camera);

    bloomPass.current = new UnrealBloomPass(new Vector2(size.width * pixelRatio, size.height * pixelRatio));
    Object.keys(defaultBloomParams).forEach((k) => {
      bloomPass.current[k] = Object.keys(bloomParams).includes(k) ? bloomParams[k] : defaultBloomParams[k];
    });

    const target = new WebGLRenderTarget(size.width * pixelRatio, size.height * pixelRatio, {
      format: RGBAFormat,
      colorSpace: SRGBColorSpace,
      type: FloatType
    });

    bloomComposer.current = new EffectComposer(renderer, target);
    bloomComposer.current.renderToScreen = false;
    bloomComposer.current.addPass(renderScene);
    bloomComposer.current.addPass(bloomPass.current);

    const selectiveBloomPass = new ShaderPass(
      new ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: bloomComposer.current.renderTarget2.texture }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        defines: {}
      }),
      'baseTexture'
    );

    selectiveBloomPass.needsSwap = true;
    
    const outputPass = new OutputPass();

    finalComposer.current = new EffectComposer(renderer, target);
    finalComposer.current.addPass(renderScene);
    finalComposer.current.addPass(selectiveBloomPass);
    finalComposer.current.addPass(outputPass);

    return () => {
      bloomPass.current?.dispose?.();
      bloomComposer.current?.dispose?.();
      finalComposer.current?.dispose?.();
      selectiveBloomPass?.material?.dispose?.();
      target?.dispose?.();
      backgrounds.current = {};
      colors.current = {};
      materials.current = {};
    };
  }, [bloomParams, size.width, size.height, pixelRatio]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ camera, gl, scene }) => {
    try {
      if (!enabled) return gl.render(scene, camera);
      if (!(bloomComposer.current && finalComposer.current)) return;

      // render scene with bloom
      let darkened = false;
      try {
        scene.traverse(darkenNonBloomed);
        darkened = true;
        bloomComposer.current.render();
      } finally {
        if (darkened) scene.traverse(restoreMaterial);
      }

      // render the entire scene, then render bloom scene on top
      finalComposer.current.render();
    } catch(e) {
      console.warn('Caught rendering error', e);
    }
  }, 2);

  return null;
};

export default Postprocessor;
