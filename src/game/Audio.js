import { useCallback, useEffect, useRef, useState } from 'react';
import { Howler, Howl } from 'howler';

import useStore from '~/hooks/useStore';
import { getLicensedAssetUrl } from '~/lib/assetUtils';

class Sound extends Howl {
  constructor(args) {
    super(args);
    const { volume } = args;
    this._baseVolume = volume || 1.0;
  }

  get baseVolume() {
    return this._baseVolume;
  }
}

const sounds = {
  ambient: [
    new Sound({ src: [ getLicensedAssetUrl('music/ambient1.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient2.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient3.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient4.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient5.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient6.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient7.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient8.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient9.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient10.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient11.mp3') ], html5: true, preload: false, volume: 1.0 }),
    new Sound({ src: [ getLicensedAssetUrl('music/ambient12.mp3') ], html5: true, preload: false, volume: 0.5 })
  ],
  click: new Sound({ src: [ getLicensedAssetUrl('sounds/click.mp3') ], html5: true, preload: false, volume: 0.25 }),
  failure: new Sound({ src: [ getLicensedAssetUrl('sounds/failure.mp3') ], html5: true, preload: false, volume: 1.0 }),
  success: new Sound({ src: [ getLicensedAssetUrl('sounds/success.mp3') ], html5: true, preload: false, volume: 1.0 }),
  ship: new Sound({ src: [ getLicensedAssetUrl('sounds/ship-flight-loop.m4a') ], html5: true, preload: false, volume: 1.0 }),

  // Buildings
  bioreactor: new Sound({ src: [ getLicensedAssetUrl('sounds/bioreactor-short.m4a') ], html5: true, preload: false, volume: 0.5 }),
  extractor: new Sound({ src: [ getLicensedAssetUrl('sounds/extractor-short.m4a') ], html5: true, preload: false, volume: 0.2 }),
  factory: new Sound({ src: [ getLicensedAssetUrl('sounds/factory-short.m4a') ], html5: true, preload: false, volume: 0.5 }),
  habitat: new Sound({ src: [ getLicensedAssetUrl('sounds/habitat-short.m4a') ], html5: true, preload: false, volume: 0.5 }),
  marketplace: new Sound({ src: [ getLicensedAssetUrl('sounds/marketplace-short.m4a') ], html5: true, preload: false, volume: 0.4 }),
  refinery: new Sound({ src: [ getLicensedAssetUrl('sounds/refinery-short.m4a') ], html5: true, preload: false, volume: 0.7 }),
  shipyard: new Sound({ src: [ getLicensedAssetUrl('sounds/shipyard-short.m4a') ], html5: true, preload: false, volume: 0.9 }),
  spaceport: new Sound({ src: [ getLicensedAssetUrl('sounds/spaceport-short.m4a') ], html5: true, preload: false, volume: 0.4 }),
  warehouse: new Sound({ src: [ getLicensedAssetUrl('sounds/warehouse-short.m4a') ], html5: true, preload: false, volume: 0.7 }),
  'buildingChatter.1': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_6.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/warehouse_7.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.2': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_6.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/extractor_7.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.3': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_6.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/refinery_7.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.4': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_6.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/bioreactor_7.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.5': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/factory_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/factory_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/factory_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/factory_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/factory_5.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.6': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/shipyard_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/shipyard_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/shipyard_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/shipyard_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/shipyard_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/shipyard_6.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.7': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/spaceport_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/spaceport_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/spaceport_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/spaceport_4.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.8': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_6.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/marketplace_7.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
  'buildingChatter.9': [
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_1.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_2.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_3.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_4.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_5.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_6.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_7.mp3') ], html5: true, preload: false, volume: 0.8 }),
    new Sound({ src: [ getLicensedAssetUrl('sounds/chatter/habitat_8.mp3') ], html5: true, preload: false, volume: 0.8 })
  ],
};

// If array return a random sound otherwise return the sound
const getSound = (name, { index, excludeIndex } = {}) => {
  const sound = sounds[name];
  if (!sound) throw new Error(`Sound ${name} not found`);
  if (!sound.length) return { sound, index: 0 };
  if (index) return { sound: sound[index], index };

  let indexes = Object.keys(sound);
  if (excludeIndex) indexes.splice(excludeIndex, 1);

  index = indexes[Math.floor(Math.random() * indexes.length)];
  return { sound: sound[index], index };
};

const Audio = () => {
  const currentEffects = useStore(s => s.effects);
  const musicVolume = useStore(s => s.sounds.music);
  const effectsVolume = useStore(s => s.sounds.effects);
  const cutscenePlaying = !!useStore(s => s.cutscene);

  const effectStarted = useStore(s => s.dispatchEffectStarted);
  const effectEnded = useStore(s => s.dispatchEffectStopped);

  const [ soundEnabled, setSoundEnabled ] = useState(null);
  const [ currentTrack, setCurrentTrack ] = useState(null);

  const cutsceneWasPlaying = useRef();

  // sound enabler (don't enable any sounds until use has interacted with page b/c audiocontext will fail)
  useEffect(() => {
    const onClick = () => {
      setSoundEnabled(true);
      document.body.removeEventListener('click', onClick);
    };

    document.body.addEventListener('click', onClick);

    return () => {
      Howler.unload();
      document.body.removeEventListener('click', onClick);
    };
  }, []);

  //
  // SOUND EFFECTS
  const stopEffect = useCallback((toStop, { fadeOut }) => {
    if (!toStop) return;

    try {
      const { sound } = getSound(toStop);
      if (sound.state() !== 'loaded' || !sound.playing()) return;
      sound.off();
      const volume = sound.volume();

      if (fadeOut) {
        sound.fade(volume, 0, fadeOut);
        sound.once('fade', (e) => sound.stop());
      } else {
        sound.stop();
      }
    } catch (e) {
      console.error(e);
    }
  }, [effectsVolume, effectEnded]);

  const playEffect = useCallback((toPlay, { loop, duration }) => {
    if (!toPlay || !soundEnabled) return;

    try {
      const { sound } = getSound(toPlay);
      if (sound.state() !== 'loaded') sound.load();
      sound.off();
      sound.stop();
      sound.volume(sound.baseVolume * effectsVolume / 100);

      sound.loop(loop);
      sound.play();

      if (duration) setTimeout(() => stopEffect(toPlay, { fadeOut: 1000 }), duration);

      sound.once('end', () => {
        sound.stop();
        effectEnded(toPlay);
      });
    } catch (e) {
      console.error(e);
    }
  }, [effectsVolume, effectEnded, stopEffect, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) return;

    Object.entries(currentEffects).forEach(([ sound, settings ]) => {
      if (settings.status === 'play') {
        playEffect(sound, settings);
        effectStarted(sound);
      }

      if (settings.status === 'stop') {
        stopEffect(sound, settings);
        effectEnded(sound);
      }
    });
  }, [currentEffects, effectStarted, effectEnded, playEffect, soundEnabled, stopEffect]);


  //
  // AMBIENT MUSIC EFFECTS
  const ambientVolume = useRef(0);

  useEffect(() => {
    ambientVolume.current = musicVolume;
    if (currentTrack?.playing()) {
      currentTrack.volume(currentTrack.baseVolume * musicVolume / 100);
    }
  }, [musicVolume]);

  const fadeInAmbientTrack = useCallback(() => {
    if (!currentTrack) return;

    currentTrack.fade(0, currentTrack.baseVolume * ambientVolume.current / 100, 10000);
    currentTrack.play();
  }, [currentTrack]);

  // select current ambient track (whenever there is none)
  const lastTrack = useRef();
  const disableMusic = musicVolume === 0;
  useEffect(() => {
    if (!soundEnabled) return;
    if (!!currentTrack) return;
    if (disableMusic) return;

    const excludeIndex = parseInt(lastTrack.current);
    const { sound: track, index } = getSound('ambient', { excludeIndex: isNaN(excludeIndex) ? null : excludeIndex });
    track.load();
    track.once('end', () => {
      track.stop();
      track.unload();
      setTimeout(() => {
        setCurrentTrack(null);
      }, Math.random() * 2500)
    });

    setCurrentTrack(track);
    lastTrack.current = index;
  }, [currentTrack, disableMusic, soundEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // manage volume of current ambient track
  useEffect(() => {
    if (!soundEnabled) return;
    if (!currentTrack) return;

    // if music disabled, pause the track... (if re-enabled, will fade back in)
    let to;
    if (disableMusic) {
      currentTrack.pause();
    }

    // pause track if cutscene playing
    else if (cutscenePlaying) {
      currentTrack.pause();
      cutsceneWasPlaying.current = true;
    }

    // fade track back in after cutscene played
    else if (cutsceneWasPlaying.current) {
      to = setTimeout(fadeInAmbientTrack, 10000);
      cutsceneWasPlaying.current = false;
    }

    // else (normal situation), fade in track
    else {
      to = setTimeout(fadeInAmbientTrack, 5000);
    }

    return () => clearTimeout(to);
  }, [currentTrack, cutscenePlaying, disableMusic, soundEnabled]);

  return null;
};

export default Audio;
