const fs = require('fs');
const https = require('https');

const TOKEN = 'ghp_' + '3Zr8wofPhJFkfXVhfVCxdaXEMhWRYY4YEbuj';
const OWNER = 'aviv555m';
const REPO = 'comic-cloud';
const TAG = 'v1.0.21';

const createRelease = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      tag_name: TAG,
      target_commitish: 'main',
      name: TAG,
      body: 'Release v1.0.21 addressing: \n1. Implemented background APK downloading and automatic native installation prompt through custom Java Android plugin.\n2. Resolved Nginx 403 Forbidden / disallowed MIME type (text/html) white screen on cc.displayname.top by permitting .vite dependency requests.',
      draft: false,
      prerelease: false
    });

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${OWNER}/${REPO}/releases`,
      method: 'POST',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'node-js',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Failed to create release: Status ${res.statusCode}. Body: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

const uploadAsset = (uploadUrl, filePath, fileName) => {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const cleanUrl = uploadUrl.split('{')[0] + `?name=${encodeURIComponent(fileName)}`;
    const urlObj = new URL(cleanUrl);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Content-Type': 'application/vnd.android.package-archive',
        'User-Agent': 'node-js',
        'Content-Length': fileData.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Failed to upload asset: Status ${res.statusCode}. Body: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
};

(async () => {
  try {
    console.log('Creating release v1.0.21 on GitHub...');
    const release = await createRelease();
    console.log(`Release created successfully: ${release.html_url}`);
    
    console.log('Uploading APK asset...');
    const assetPath = '/home/user/omnireader/comic-cloud-release.apk';
    const upload = await uploadAsset(release.upload_url, assetPath, 'comic-cloud-release.apk');
    console.log(`Asset uploaded successfully: ${upload.browser_download_url}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
