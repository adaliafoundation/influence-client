const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

// This cycle fails during module initialization, before rendered-component mocks
// can detect it: transaction provider -> funding UI -> button -> provider.
test('the transaction provider cannot import the funding UI, even indirectly', () => {
  const sourceRoot = path.resolve(__dirname, '..');
  const target = path.join(sourceRoot, 'game/launcher/store/FundingFlow.js');
  const pending = [path.join(sourceRoot, 'contexts/ChainTransactionContext.js')];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    expect(file).not.toBe(target);
    const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    for (const node of ast.program.body) {
      const reference = node.source?.value;
      if (!reference || (!reference.startsWith('.') && !reference.startsWith('~/'))) continue;
      const base = reference.startsWith('~/')
        ? path.join(sourceRoot, reference.slice(2)) : path.resolve(path.dirname(file), reference);
      const dependency = [base, `${base}.js`, path.join(base, 'index.js')]
        .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (dependency?.endsWith('.js')) pending.push(dependency);
    }
  }
});
