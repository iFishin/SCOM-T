/**
 * SCOM-T README 操作演示动图生成器
 *
 *   npm install --prefix docs/demos/.tools --no-save --no-package-lock playwright-core
 *   node docs/demos/render.mjs --check              # 自检 Chrome / ffmpeg / 驱动
 *   node docs/demos/render.mjs --probe --frame 60    # 各场景截一帧自查
 *   node docs/demos/render.mjs --scene connect       # 生成单个场景
 *   node docs/demos/render.mjs                      # 生成全部 4 个场景
 *
 * 链路：系统 Chrome/Chromium（由 playwright-core 驱动）→ 逐帧 PNG →
 *       ffmpeg 调色板优化 → GIF + 静态首帧。
 * 不改项目依赖声明：驱动装在 docs/demos/.tools，临时帧与浏览器 profile 也都在本目录，
 * 跑完自动清理。浏览器优先读 CHROME_PATH，其次按平台探测常见安装位置与 PATH。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(HERE, 'demos.html');
const FRAMES = path.join(HERE, '.frames');
const PROFILE = path.join(HERE, `.chrome-pw-${process.pid}`);
const DRIVER = path.join(HERE, '.tools/node_modules/playwright-core');
const W = 880, H = 540, FPS = 12;
const ORDER = ['connect', 'loop', 'logs', 'theme'];
const assetBase = (sc) => `${String(ORDER.indexOf(sc.id) + 1).padStart(2, '0')}-${sc.id}`;

const require = createRequire(import.meta.url);

function loadDriver() {
  if (!fs.existsSync(DRIVER)) {
    throw new Error('缺少浏览器驱动，请先运行：npm install --prefix docs/demos/.tools --no-save --no-package-lock playwright-core');
  }
  return require(DRIVER).chromium;
}

// 跨平台探测：环境变量 > 常见安装位置 > PATH。找不到时给出可操作的提示。
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;

  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('找不到 Chrome/Chromium：请设置 CHROME_PATH 指向浏览器可执行文件');
}

const argv = process.argv.slice(2);
const probe = argv.includes('--probe');
const sceneArg = argv.includes('--scene') ? argv[argv.indexOf('--scene') + 1] : null;
const frameArg = argv.includes('--frame') ? Number(argv[argv.indexOf('--frame') + 1]) : 0;

function makeGif(sc) {
  const vf = 'split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];' +
             '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
  const gif = path.join(HERE, `${assetBase(sc)}.gif`);
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, `${sc.id}_%03d.png`),
    '-vf', vf, '-loop', '0', gif,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg 失败 (${sc.id}):\n${r.stderr}`);
  console.log(`  ✓ ${path.basename(gif)} · ${(fs.statSync(gif).size / 1024).toFixed(0)} KB · ${sc.frames} 帧 / ${(sc.frames / FPS).toFixed(1)}s`);
}

async function main() {
  const chromium = loadDriver();
  const chrome = findChrome();
  fs.mkdirSync(FRAMES, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: chrome,
    headless: true,
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
    await page.waitForFunction('typeof window.renderFrame === "function"', { timeout: 10000 });
    const scenes = await page.evaluate(() => window.demoScenes);
    const selected = sceneArg ? scenes.filter(s => s.id === sceneArg) : scenes;
    if (!selected.length) throw new Error('未知场景：' + sceneArg);
    console.log(`Chrome 已就绪 · ${selected.length} 个场景`);

    for (const sc of selected) {
      const picks = probe ? [Math.min(frameArg, sc.frames - 1)]
                          : Array.from({ length: sc.frames }, (_, i) => i);
      console.log(`→ ${sc.id} (${sc.title})：${picks.length} 帧`);
      for (const f of picks) {
        await page.evaluate(([id, n]) => window.renderFrame(id, n), [sc.id, f]);
        // 等一帧绘制完成，保证截到的是这一帧的最终状态
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(1))));
        const out = probe
          ? path.join(HERE, `.probe-${sc.id}.png`)
          : path.join(FRAMES, `${sc.id}_${String(f).padStart(3, '0')}.png`);
        await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
      }
      if (probe) {
        console.log(`  自查帧 .probe-${sc.id}.png (f=${picks[0]})`);
        continue;
      }
      fs.copyFileSync(
        path.join(FRAMES, `${sc.id}_000.png`),
        path.join(HERE, `${assetBase(sc)}-still.png`),
      );
      makeGif(sc);
    }
  } finally {
    await context.close();
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.rmSync(PROFILE, { recursive: true, force: true });
    console.log('已清理本次临时帧与浏览器 profile（仅 docs/demos 下的 .frames 与 .chrome-pw-<pid>）');
  }

  if (!probe) {
    console.log('\n产物：');
    for (const f of fs.readdirSync(HERE).filter(f => f.endsWith('.gif') || f.endsWith('-still.png'))) {
      console.log(`  ${f} · ${(fs.statSync(path.join(HERE, f)).size / 1024).toFixed(0)} KB`);
    }
  }
}

if (argv.includes('--check')) {
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  console.log('浏览器 :', findChrome());
  console.log('ffmpeg  :', ffmpeg.status === 0 ? '可用' : '不可用（请先安装 ffmpeg）');
  console.log('驱动    :', fs.existsSync(DRIVER) ? '已安装' : '缺失（见文件头部的安装命令）');
  if (ffmpeg.status !== 0) process.exit(1);
} else {
  main().catch(e => { console.error(e); process.exit(1); });
}
