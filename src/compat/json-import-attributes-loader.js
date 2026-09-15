module.exports = (source) => source.replace(
  / with \{ type: ['"]json['"] \}/g,
  ''
);
