const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css'
};

const server = http.createServer((req, res) => {
    // 剥离查询参数（如 ?t=123456），否则 Cache Busting 会导致文件找不到
    const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;
    let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(500);
            res.end(`Server Error: ${error.code}`);
        } else {
            // 核心安全策略：必须注入这两个 Header 才能在前端代码中使用 SharedArrayBuffer 和高精度 performance.now()
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\x1b[32m🚀 STW-Sentinel Core Server is running at http://localhost:${PORT}/\x1b[0m`);
    console.log(`\x1b[33m🔒 COOP & COEP Security Headers injected successfully.\x1b[0m`);
});
