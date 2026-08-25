const { chromium } = require('playwright');
(async () => {
  const jobs = JSON.parse(process.argv[2]);
  const b = await chromium.launch();
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.dpr || 1 });
    await p.goto('file://' + j.url);
    await p.waitForTimeout(300);
    await p.screenshot({ path: j.out, omitBackground: !!j.transparent });
    await p.close();
  }
  await b.close();
})();
