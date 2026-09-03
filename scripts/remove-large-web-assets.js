const fs = require('fs');
const path = require('path');

const downloadsPath = path.join(__dirname, '..', 'dist', 'downloads');
if (fs.existsSync(downloadsPath)) {
  for (const fileName of fs.readdirSync(downloadsPath)) {
    if (fileName.toLowerCase().endsWith('.apk')) {
      fs.unlinkSync(path.join(downloadsPath, fileName));
    }
  }
}
