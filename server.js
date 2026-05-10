const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  // 解码 URL，处理中文路径
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // 防止路径遍历攻击
  const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(ROOT, safePath);

  // 默认 index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': getMimeType(filePath) + '; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const urls = [`http://localhost:${PORT}`];

  // 尝试获取本机局域网 IP，方便同网段其他设备访问
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${PORT}`);
      }
    }
  }

  console.log('\n✅ 静态文件服务器已启动\n');
  console.log('可访问地址：');
  urls.forEach((u) => console.log(`  → ${u}`));
  console.log('\n按 Ctrl+C 停止服务器\n');

  // Windows 下自动打开浏览器
  if (process.platform === 'win32') {
    exec(`start ${urls[0]}`);
  }
});
