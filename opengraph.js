const axios = require('axios');
const probe = require('probe-image-size');

const { appConfig } = require('./src/appConfig');

const instance = axios.create({ baseURL: `${appConfig.get('Api.influence')}/og/data?t=1` });

const getOpengraphTags = async (originalUrl, origin) => {
  const urlParts = originalUrl.split('/').slice(1);

  // "play" is landing page prefix (i.e. this was a url generated for sharing)...
  // strip the "play" prefix, then can determine tags normally
  if (urlParts[0] === 'play') urlParts.shift();

  const tags = {
    'twitter:card': 'summary_large_image',
    'twitter:site': '@influenceth',
    'og:title': 'Influence | Space Strategy MMO',
    'og:description': 'Space strategy MMO built on Ethereum',
    'og:image': `${origin}/og/influence.jpg`,
    'og:image:width': '1200',
    'og:image:height': '630',
  };

  try {
    switch(urlParts[0]) {
      // TODO: asteroid, crew sheet
      // TODO: crew assignments in this form are deprecated -- see character recruitment and random events

      case 'crew-assignments': {
        if (urlParts[1]) {
          const response = await instance.get(`/crew-assignments/${urlParts[1]}`);
          const book = response.data;
          if (book) {
            tags['twitter:card'] = 'summary';
            tags['og:title'] = `Influence ▸ ${book.title}`;
            tags['og:description'] = 'Every choice can change the balance.'
              + ' Choose your own path, earn rewards, and expand your influence across the belt.';
            // TODO: should rasterize image because SVGs don't seem to work on twitter card
            //tags['og:image'] = book.image;
            // TODO: if book icons are consistent dimensions, provide og:image:* here
            //delete tags['og:image:height'];
            //delete tags['og:image:width'];
          }
        }
        break;
      }

      case 'crew-assignment': {
        if (urlParts[1]) {
          // TODO: if we aren't going to use anything user-specific, we should probably just
          //  use the story id from the front-end instead (b/c card will show up immediately
          //  if someone has already shared)
          const response = await instance.get(`/crew-assignment/${urlParts[1]}`);
          const story = response.data;
          if (story) {
            // TODO: could add crew name, could generate composite image with crew, etc
            tags['twitter:card'] = 'summary_large_image';
            tags['og:title'] = `Influence ▸ ${story.title}`;
            tags['og:description'] = 'Every choice can change the balance.'
              + ' Choose your own path, earn rewards, and expand your influence across the belt.';
            tags['og:image'] = story.image;
            // TODO: if crewAssignment images are consistent dimensions, provide og:image:* here
            delete tags['og:image:height'];
            delete tags['og:image:width'];
          }
        }
        break;
      }
      default: {
        /* no-op, will use defaults */
      }
    }
  } catch (e) {
    console.warn((e || {}).message);
  }

  if (tags['og:image'] && !(tags['og:image:height'] && tags['og:image:width'])) {
    const imageDetails = await probe(tags['og:image']);
    if (imageDetails && imageDetails.height && imageDetails.width) {
      tags['og:image:height'] = imageDetails.height;
      tags['og:image:width'] = imageDetails.width;
    }
  }

  return tags;
};

module.exports = getOpengraphTags;
