import * as assert from 'assert';
assert.strictEqual('paper.tex'.replace(/\.tex$/i, '.pdf'), 'paper.pdf');
assert.ok('a\\section{Intro}'.indexOf('Intro') >= 0);
console.log('smoke tests passed');
