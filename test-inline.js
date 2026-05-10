const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  const filePath = 'D:/RuijieWorks/方案/拓扑图/aidc_network_diagram_inline.html';
  await page.goto('file:///' + filePath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const svgContent = await page.evaluate(() => {
    return {
      hasBg: !!document.getElementById('bgLayer'),
      hasLink: !!document.getElementById('linkLayer'),
      hasNode: !!document.getElementById('nodeLayer'),
      bgChildren: document.getElementById('bgLayer')?.children?.length || 0,
      linkChildren: document.getElementById('linkLayer')?.children?.length || 0,
      nodeChildren: document.getElementById('nodeLayer')?.children?.length || 0,
      summaryText: document.getElementById('summaryPanel')?.textContent?.substring(0, 100)
    };
  });

  console.log('SVG Check:', JSON.stringify(svgContent, null, 2));

  await page.screenshot({ path: 'C:/tmp/screenshot_inline.png', fullPage: false });
  console.log('Screenshot saved to C:/tmp/screenshot_inline.png');

  await browser.close();
})();
