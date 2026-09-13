// Renders the verification sheets next to this file: a turnaround, a torso and
// head closeup, and a contact sheet sampling every animation clip.
//
// This is optional dev tooling, not part of the game. It is the only thing that
// actually proves the .glb is valid - gen_manager_glb.py can only check its own
// arithmetic, it cannot tell you the container parses, the skin binds, or that
// an arm swings forward rather than backward.
//
//   npm install three playwright
//   node render.js
//
// Set CHROME_PATH if Playwright's bundled browser is not installed, e.g.
//   CHROME_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome node render.js

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const GLB = path.join(HERE, '..', 'bad_office_manager.glb');
const MODULES = path.join(process.cwd(), 'node_modules');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript',
  '.glb': 'model/gltf-binary', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url === '/' ) file = path.join(HERE, 'viewer.html');
  else if (url === '/model.glb') file = GLB;
  else if (url.startsWith('/node_modules/')) file = path.join(MODULES, url.slice(14));
  else file = path.join(HERE, url);

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  if (!fs.existsSync(GLB)) {
    console.error('missing %s - run `python3 gen_manager_glb.py` first', GLB);
    process.exit(1);
  }
  await new Promise(r => server.listen(8099, r));

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    // SwiftShader: these run on machines with no GPU.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('http://127.0.0.1:8099/');
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });

  // What the loader actually found in the file, not what we meant to write.
  console.log(JSON.stringify(await page.evaluate('window.__report'), null, 2));

  for (const mode of ['closeup', 'turnaround', 'anim']) {
    await page.evaluate(m => window.__draw(m), mode);
    await page.waitForTimeout(400);
    const out = path.join(HERE, (mode === 'anim' ? 'animations' : mode) + '.png');
    await (await page.$('#sheet')).screenshot({ path: out });
    console.log('wrote', path.basename(out));
  }

  if (errors.length) {
    console.log('PAGE ERRORS:');
    errors.forEach(e => console.log('  ' + e));
  }
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})();
