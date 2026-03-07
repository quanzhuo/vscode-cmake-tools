const fetch = require('node-fetch');
let getProxyAgent = () => undefined;
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  try {
    const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
    getProxyAgent = () => new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    console.warn('https-proxy-agent 未安装，无法使用代理');
  }
}
const fs = require('fs-extra');
const path = require('path');
const unzipper = require('unzipper');

const GITHUB_API = 'https://api.github.com/repos/ninja-build/ninja/releases/latest';

const TARGETS = [
  { zip: 'ninja-linux-aarch64.zip', out: 'linux-arm64' },
  { zip: 'ninja-linux.zip', out: 'linux-x64' },
  { zip: 'ninja-win.zip', out: 'win32-x64' },
  { zip: 'ninja-mac.zip', out: 'darwin-x64' }
];


async function downloadAndExtract(url, filename, outDir) {
  const tmpZip = path.join(__dirname, filename);
  const destDir = path.join(__dirname, '..', outDir);
  const agent = getProxyAgent(url);
  const res = await fetch(url, agent ? { agent } : {});
  if (!res.ok) throw new Error(`Failed to download ${filename}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(tmpZip);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });

  // 解压到指定子目录
  await fs.ensureDir(destDir);
  await fs.createReadStream(tmpZip)
    .pipe(unzipper.Extract({ path: destDir }))
    .promise();

  // 修正可执行权限（仅非 win32 目录）
  if (!outDir.startsWith('win32')) {
    const ninjaPath = path.join(destDir, 'ninja');
    if (await fs.pathExists(ninjaPath)) {
      await fs.chmod(ninjaPath, 0o755);
    }
  }

  await fs.remove(tmpZip);
  console.log(`Downloaded and extracted: ${filename} -> ${outDir}`);
}


async function main() {
  // 先清理各平台输出目录
  for (const { out } of TARGETS) {
    const dir = path.join(__dirname, '..', out);
    if (await fs.pathExists(dir)) {
      await fs.remove(dir);
    }
  }

  const agent = getProxyAgent(GITHUB_API);
  const res = await fetch(GITHUB_API, agent ? { agent } : {});
  if (!res.ok) throw new Error('Failed to fetch release info');
  const release = await res.json();
  console.log(`ninja-build release version: ${release.tag_name || release.name}`);
  const assets = release.assets || [];

  for (const { zip, out } of TARGETS) {
    const asset = assets.find(a => a.name === zip);
    if (!asset) {
      console.warn(`Asset not found: ${zip}`);
      continue;
    }
    await downloadAndExtract(asset.browser_download_url, zip, out);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
