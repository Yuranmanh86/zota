const fs = require('fs');
const path = require('path');

const apkPath = path.join(__dirname, '..', 'dist', 'downloads', 'zora.apk');
if (fs.existsSync(apkPath)) {
  fs.unlinkSync(apkPath);
}
