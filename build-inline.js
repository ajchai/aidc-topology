/**
 * build-inline.js - 内联打包脚本
 * 将多文件模块合并为单个可直接双击打开的 HTML
 */

const fs = require('fs');

const jsFiles = [
    'js/config.js',
    'js/state.js',
    'js/storage.js',
    'js/hardware-engine.js',
    'js/layout-engine.js',
    'js/svg-renderer.js',
    'js/interaction.js',
    'js/stats-panel.js',
    'js/export.js',
    'js/app.js'
];

function processJS(content) {
    let result = content;

    // 1. 去掉 import ... from ... 语句（支持多行花括号格式）
    result = result.replace(/import\s+\{[\s\S]*?\}\s*from\s+['"][^'"]+['"];?/g, '');
    result = result.replace(/import\s+\*?\s*\w+\s*from\s+['"][^'"]+['"];?/g, '');
    result = result.replace(/import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"];?/g, '');

    // 2. 去掉 export { ... } 聚合导出语句
    result = result.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

    // 3. export async function -> async function
    result = result.replace(/\bexport\s+async\s+function\b/g, 'async function');

    // 4. export function -> function
    result = result.replace(/\bexport\s+function\b/g, 'function');

    // 5. export const -> const
    result = result.replace(/\bexport\s+const\b/g, 'const');

    // 6. export let -> let
    result = result.replace(/\bexport\s+let\b/g, 'let');

    // 7. export var -> var
    result = result.replace(/\bexport\s+var\b/g, 'var');

    // 8. export class -> class
    result = result.replace(/\bexport\s+class\b/g, 'class');

    // 9. 清理多空行
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
}

// 读取 CSS
const css = fs.readFileSync('css/style.css', 'utf8');

// 合并 JS
let combinedJS = '';
for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    combinedJS += `\n\n/* ===== ${file} ===== */\n\n${processJS(content)}`;
}

// 读取 index.html
let html = fs.readFileSync('index.html', 'utf8');

// 去掉外部 CSS link
html = html.replace(/<link rel="stylesheet" href="css\/style\.css">\n?/, '');

// 去掉外部 JS script
html = html.replace(/<script type="module" src="js\/app\.js"><\/script>\n?/, '');

// 在 </head> 前插入内联 CSS
html = html.replace('</head>', `    <style>\n${css}\n    </style>\n</head>`);

// 在 </body> 前插入内联 JS
html = html.replace('</body>', `    <script>\n${combinedJS}\n    </script>\n</body>`);

fs.writeFileSync('aidc_network_diagram_inline.html', html);
console.log('Inline HTML generated: aidc_network_diagram_inline.html');
console.log('File size:', (fs.statSync('aidc_network_diagram_inline.html').size / 1024).toFixed(1), 'KB');
