const Mocha = require('mocha');
const fs = require('fs');
const path = require('path');

const mocha = new Mocha();

const testDir = 'test';

fs.readdirSync(testDir).filter(file => {
  return file.substr(-4) === '.cjs';
}).forEach(file => {
  mocha.addFile(path.join(testDir, file));
});

mocha.run(failures => {
  process.exitCode = failures ? 1 : 0;
});
