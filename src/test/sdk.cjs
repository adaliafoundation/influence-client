// Jest 27 cannot resolve module-sync exports. Use Node's native loader for the
// published SDK, including its ESM crypto dependencies, rather than mocking them.
module.exports = process.getBuiltinModule('module').createRequire(__filename)('@influenceth/sdk');
