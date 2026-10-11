// Rebuild native contours and standalone SVG from the browser's authored polygons.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scope = { window: {} };
for (const [source, global, basename, title, description] of [
  ['startup-emblem.js', 'DSHEmblem', 'dsh-emblem', 'Delta Circuit', 'Original triangular department seal. The left D, lower S and right H tracks form its silhouette, with an engraved DSH signature and three scan strata inside.'],
  ['startup-laterano-emblem.js', 'DSHLateranoEmblem', 'dsh-laterano-emblem', 'Concord', 'Original geometric chancery seal. Equal-radius intersections form three lancet apertures; a broken circle and a serif DSH inscription frame the signal.'],
]) {
vm.runInNewContext(fs.readFileSync(path.join(root, 'docs', source), 'utf8'), scope);
const emblem = scope.window[global];
if (emblem.parts.length !== 5 || emblem.parts.some(part => part.some(contour =>
  contour.length < 3 || contour.some(point => point.length !== 2 || point.some(n => !Number.isFinite(n)))))) {
  throw new Error('The seal must contain five valid, finite compound contours.');
}
fs.writeFileSync(path.join(root, 'crates/dsh-tui/assets', basename + '.json'), JSON.stringify(emblem, null, 2) + '\n', 'utf8');
const paths = emblem.parts.map(contours => '<path fill-rule="evenodd" d="' + contours.map(points =>
  'M' + points.map(point => point.join(',')).join('L') + 'Z').join('') + '"/>').join('\n');
fs.writeFileSync(path.join(root, 'docs/assets', basename + '.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-118 -115 236 220" role="img" aria-labelledby="title desc">\n' +
  '<title id="title">DSH — ' + title + '</title>\n' +
  '<desc id="desc">' + description + '</desc>\n' +
  '<g fill="currentColor">\n' + paths + '\n</g></svg>\n', 'utf8');
console.log('Exported matching native contours and SVG for ' + emblem.name + '.');
}
