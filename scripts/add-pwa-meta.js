const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('dist/index.html not found. Run expo export first.');
}

let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '</head>',
    '  <link rel="manifest" href="/manifest.json" />\n' +
    '  <meta name="mobile-web-app-capable" content="yes" />\n' +
    '  <meta name="apple-mobile-web-app-capable" content="yes" />\n' +
    '  <meta name="apple-mobile-web-app-status-bar-style" content="default" />\n' +
    '</head>'
  );
}
fs.writeFileSync(indexPath, html);
