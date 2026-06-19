const path = require('path');
const { addBabelPlugin, override, setWebpackTarget } = require('customize-cra');

// Custom loader for GLSL shaders
const addGlslifyLoader = () => config => {
  const loaders = config.module.rules.find(rule => Array.isArray(rule.oneOf)).oneOf;
  loaders.unshift({
    test: /\.(glsl|frag|vert)$/,
    exclude: /node_modules/,
    use: [
      'raw-loader',
      'glslify-loader'
    ]
  });

  return config;
};

// Adjust precache maximum to 30 MB
const adjustWorkbox = () => config => {
  config.plugins.forEach(p => {
    if (p.constructor.name === 'InjectManifest') {
      p.config.maximumFileSizeToCacheInBytes = 30 * 1024 * 1024;
    }
  });

  return config;
};

const suppressSourceMapWarnings = () => config => {
  config.ignoreWarnings = [
    ...(config.ignoreWarnings || []),
    warning => /Failed to parse source map/.test(warning?.message || '')
  ];

  return config;
};

const addDataUriFileLoader = () => config => {
  const loaders = config.module.rules.find(rule => Array.isArray(rule.oneOf)).oneOf;
  loaders.unshift({
    test: /\.datauri$/,
    exclude: /node_modules/,
    use: [
      'raw-loader',
    ]
  });

  return config;
};

const addSVGR = () => config => {
  const loaders = config.module.rules.find(rule => Array.isArray(rule.oneOf)).oneOf;
  loaders.unshift({
    test: /\.svg$/,
    exclude: /node_modules/,
    use: [{
      loader: '@svgr/webpack',
      options: {
        svgoConfig: {
          plugins: [
            {
              name: 'removeViewBox',
              active: false
            }
          ]
        }
      }
    }]
  });

  return config;
};

const addCompatibilityAliases = () => config => {
  config.resolve = config.resolve || {};
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    'react-popper': path.resolve(__dirname, 'src/compat/react-popper.js'),
    'react-notifications-component': path.resolve(__dirname, 'src/compat/react-notifications-component.js'),
    'react-notifications-component/dist/theme.css': path.resolve(__dirname, 'src/compat/react-notifications-component.css'),
    'react-ticker': path.resolve(__dirname, 'src/compat/react-ticker.js')
  };

  return config;
};

patchNpmModules = () => config => {
  const loaders = config.module.rules.find(rule => Array.isArray(rule.oneOf)).oneOf;

  // NOTE: this is entirely for three's GLTFExporter
  // loaders.unshift({
  //   test: /\.js$/,
  //   include: /node_modules\/three/,
  //   use: [{
  //     loader: 'babel-loader',
  //     options: {
  //       plugins: ['@babel/plugin-proposal-optional-chaining']
  //     }
  //   }]
  // });

  return config;
};


module.exports = override(
  setWebpackTarget('web'),
  adjustWorkbox(),
  addBabelPlugin([
    'babel-plugin-root-import',
    {
      'rootPathPrefix': '~',
      'rootPathSuffix': 'src'
    }
  ]),
  patchNpmModules(),
  suppressSourceMapWarnings(),
  addCompatibilityAliases(),
  addGlslifyLoader(),
  addDataUriFileLoader(),
  addSVGR()
);
