const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { once } = require('events');
const path = require('path');

(async () => {
  const t0s = Number(process.argv[2]), t1s = Number(process.argv[3]);
  const fps = Number(process.argv[4]), W = Number(process.argv[5]), out = process.argv[6];
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('PAGE', m.text()); });
  await page.goto('file://' + path.join(__dirname, 'stage.html'));
  await page.evaluate(() => window.READY());

  const total = Math.round((t1s - t0s) * fps);
  const ff = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-y',
    '-f','image2pipe','-framerate',String(fps),'-i','-',
    '-vf','scale=' + W + ':-2:flags=lanczos','-c:v','ffv1','-level','3', out],
    { stdio: ['pipe','inherit','inherit'] });

  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    await page.evaluate(t => window.SEEK(t), t0s + f / fps);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (f % 25 === 0 || f === total - 1) {
      const el = (Date.now() - t0) / 1000, rate = (f + 1) / el;
      console.log(`${f+1}/${total} ${el.toFixed(0)}s ${rate.toFixed(1)}fps eta ${((total-f-1)/rate).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await once(ff, 'close');
  await browser.close();
})();
