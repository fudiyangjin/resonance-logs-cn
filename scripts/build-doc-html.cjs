/**
 * Build localized HTML docs from doc/{locale}/ Markdown sources.
 */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const LOCALES = ['zh-CN', 'en-US', 'ja-JP'];
const DOC_DIR = path.join(__dirname, '..', 'doc');
const OUT_DIR = path.join(DOC_DIR, 'html_doc');
const SHARED_IMG = path.join(DOC_DIR, 'shared', 'img');

const localeArg = process.argv.find((a) => a.startsWith('--locale='));
const ONLY_LOCALE = localeArg ? localeArg.split('=')[1] : null;
const BUILD_LOCALES = ONLY_LOCALE ? [ONLY_LOCALE] : LOCALES;

const MESSAGE_FILE_BY_LOCALE = {
  'zh-CN': 'zh-CN.ts',
  'en-US': 'en-US.ts',
  'ja-JP': 'ja-JP.ts',
};

const FEATURE_HUBS = {
  'zh-CN': {
    monitor: { hubHref: 'README.html', hubLabel: 'Buff 监控' },
    dps: { hubHref: 'README.html', hubLabel: 'DPS 检测' },
    monster: { hubHref: 'README.html', hubLabel: '怪物监控' },
  },
  'en-US': {
    monitor: { hubHref: 'README.html', hubLabel: 'Buff Monitor' },
    dps: { hubHref: 'README.html', hubLabel: 'DPS Meter' },
    monster: { hubHref: 'README.html', hubLabel: 'Monster Monitor' },
  },
  'ja-JP': {
    monitor: { hubHref: 'README.html', hubLabel: 'Buff モニター' },
    dps: { hubHref: 'README.html', hubLabel: 'DPS メーター' },
    monster: { hubHref: 'README.html', hubLabel: 'モンスターモニター' },
  },
};

const NAV_LABELS = {
  'zh-CN': {
    home: '文档首页',
    siteTitle: 'Resonance Logs CN',
    langSwitch: '语言',
    localeNames: { 'zh-CN': '简体中文', 'en-US': 'English', 'ja-JP': '日本語' },
  },
  'en-US': {
    home: 'Documentation Home',
    siteTitle: 'Resonance Logs CN',
    langSwitch: 'Language',
    localeNames: { 'zh-CN': '简体中文', 'en-US': 'English', 'ja-JP': '日本語' },
  },
  'ja-JP': {
    home: 'ドキュメントホーム',
    siteTitle: 'Resonance Logs CN',
    langSwitch: '言語',
    localeNames: { 'zh-CN': '简体中文', 'en-US': 'English', 'ja-JP': '日本語' },
  },
};

const LANDING = {
  'zh-CN': {
    title: 'Resonance Logs 文档',
    intro: '请选择文档语言。首次使用建议从“快速入门”开始。',
  },
  'en-US': {
    title: 'Resonance Logs Documentation',
    intro: 'Choose a documentation language. Start with Getting Started if this is your first time.',
  },
  'ja-JP': {
    title: 'Resonance Logs ドキュメント',
    intro: 'ドキュメント言語を選択してください。初めての方は「はじめに」から始めてください。',
  },
};

const messageCache = {};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'Document';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function parseMessagesFromTs(content) {
  const messages = {};
  const re = /"((?:\\.|[^"\\])+)":\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    messages[m[1]] = m[2]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return messages;
}

function loadMessages(locale) {
  if (messageCache[locale]) return messageCache[locale];
  const fileName = MESSAGE_FILE_BY_LOCALE[locale];
  if (!fileName) throw new Error(`Unknown locale: ${locale}`);
  const filePath = path.join(__dirname, '..', 'src', 'lib', 'i18n', 'messages', fileName);
  messageCache[locale] = parseMessagesFromTs(fs.readFileSync(filePath, 'utf-8'));
  return messageCache[locale];
}

function replaceUiPlaceholders(md, locale) {
  const messages = loadMessages(locale);
  return md.replace(/\{\{ui:([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    if (!(trimmed in messages)) {
      console.warn(`  missing i18n key for ${locale}: ${trimmed}`);
      return `[${trimmed}]`;
    }
    return messages[trimmed];
  });
}

function indexHrefFrom(outPath, locale) {
  const localeIndex = path.join(OUT_DIR, locale, 'index.html');
  return path.relative(path.dirname(outPath), localeIndex).replace(/\\/g, '/');
}

function langSwitchLinks(outPath, locale, relOutPath) {
  return BUILD_LOCALES.map((loc) => {
    const label = NAV_LABELS[locale].localeNames[loc];
    if (loc === locale) return `<a href="#" class="active">${escapeHtml(label)}</a>`;
    const target = path.join(OUT_DIR, loc, relOutPath);
    const href = path.relative(path.dirname(outPath), target).replace(/\\/g, '/');
    return `<a href="${href}">${escapeHtml(label)}</a>`;
  }).join(' / ');
}

function hubNavForFile(mdPath, outPath, locale) {
  const localeDir = path.join(DOC_DIR, locale);
  const rel = path.relative(path.join(localeDir, 'features'), mdPath).replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts.length < 2) return null;
  const module = parts[0];
  const hub = FEATURE_HUBS[locale][module];
  if (!hub) return null;

  const hubOut = path.join(path.dirname(outPath), hub.hubHref);
  const fromOut = path.relative(path.dirname(outPath), hubOut).replace(/\\/g, '/');
  const isHubReadme = path.basename(mdPath).toLowerCase() === 'readme.md' && parts.length === 2;
  return { hubHref: fromOut, hubLabel: hub.hubLabel, isHub: isHubReadme };
}

function imageRelFromSrc(src) {
  if (!src.includes('img/')) return null;
  return src
    .replace(/^(\.\.\/)+(features\/)?(shared\/)?img\//, '')
    .replace(/^.*\/img\//, '');
}

function rewriteLinks(html, outPath) {
  let result = html
    .replace(/href="([^"]+\.md)(#[^"]*)?"/g, (_, p1, p2 = '') => {
      let base = p1.replace(/\.md$/, '.html');
      if (/\/README\.html$/.test(base) || base === 'README.html') {
        const dir = path.dirname(base);
        base = dir === '.' ? 'index.html' : `${dir}/index.html`;
      }
      if (p1.includes('CHANGELOG.md')) {
        base = outPath.replace(/\\/g, '/').includes('changelog/')
          ? 'latest.html'
          : 'changelog/latest.html';
      }
      return `href="${base}${p2}"`;
    })
    .replace(/href="([^"]*\/changelog\/)"/g, 'href="$1index.html"');

  result = result.replace(/src="([^"]+)"/g, (match, src) => {
    const imgRel = imageRelFromSrc(src);
    if (!imgRel) return match;

    const target = path.join(OUT_DIR, 'shared', 'img', imgRel.replace(/\//g, path.sep));
    const source = path.join(SHARED_IMG, imgRel.replace(/\//g, path.sep));
    if (!fs.existsSync(source)) {
      console.warn(`  missing image: ${imgRel}`);
      return match;
    }

    const href = path.relative(path.dirname(outPath), target).replace(/\\/g, '/');
    return `src="${href}"`;
  });

  return result;
}

function htmlTemplate(title, content, locale, outPath, hubNav, relOutPath) {
  const labels = NAV_LABELS[locale];
  const indexLink = indexHrefFrom(outPath, locale);
  let nav = `<a href="${indexLink}">${labels.home}</a>`;
  if (hubNav && !hubNav.isHub) {
    nav += ` / <a href="${hubNav.hubHref}">${escapeHtml(hubNav.hubLabel)}</a>`;
  }
  nav += `<span class="lang-switch">${labels.langSwitch}: ${langSwitchLinks(outPath, locale, relOutPath)}</span>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(labels.siteTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans", sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 1.75rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h2 { font-size: 1.35rem; margin-top: 1.5em; }
    h3 { font-size: 1.15rem; margin-top: 1.2em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; }
    blockquote { margin: 1em 0; padding: 8px 16px; background: #fef3c7; border-left: 4px solid #f59e0b; }
    pre { background: #f3f4f6; padding: 12px; overflow-x: auto; border-radius: 6px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
    .nav { margin-bottom: 24px; font-size: 0.9rem; color: #6b7280; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
    .lang-switch { margin-left: auto; }
    .lang-switch a.active { font-weight: 600; color: #111; pointer-events: none; }
  </style>
</head>
<body>
  <nav class="nav">${nav}</nav>
  <main>${content}</main>
</body>
</html>`;
}

function buildFile(mdPath, outPath, locale) {
  let md = fs.readFileSync(mdPath, 'utf-8');
  md = replaceUiPlaceholders(md, locale);
  const html = marked.parse(md, { gfm: true });
  const title = extractTitle(md);
  const processed = rewriteLinks(html, outPath);
  const relOutPath = path.relative(path.join(OUT_DIR, locale), outPath);
  const hubNav = hubNavForFile(mdPath, outPath, locale);
  const full = htmlTemplate(title, processed, locale, outPath, hubNav, relOutPath);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, full, 'utf-8');
  console.log(`  built [${locale}] ${path.relative(OUT_DIR, outPath)}`);
}

function collectMdFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) collectMdFiles(full, files);
    else if (name.endsWith('.md')) files.push(full);
  }
  return files;
}

function buildFeatureModule(moduleName, locale) {
  const localeDir = path.join(DOC_DIR, locale);
  const moduleDir = path.join(localeDir, 'features', moduleName);
  if (!fs.existsSync(moduleDir)) return;
  const mdFiles = collectMdFiles(moduleDir).sort();
  for (const mdPath of mdFiles) {
    const rel = path.relative(path.join(localeDir, 'features'), mdPath);
    const outPath = path.join(
      OUT_DIR,
      locale,
      'features',
      rel.replace(/\.md$/i, '.html').replace(/README\.html$/i, 'index.html'),
    );
    if (path.basename(mdPath).toLowerCase() === 'readme.md') {
      const outDir = path.dirname(outPath);
      buildFile(mdPath, path.join(outDir, 'index.html'), locale);
      buildFile(mdPath, path.join(outDir, 'README.html'), locale);
      continue;
    }
    buildFile(mdPath, outPath, locale);
  }
}

function buildLocale(locale) {
  const localeDir = path.join(DOC_DIR, locale);
  if (!fs.existsSync(localeDir)) {
    console.warn(`Skipping missing locale dir: ${locale}`);
    return;
  }

  console.log(`\nBuilding ${locale} ...`);
  const localeOut = path.join(OUT_DIR, locale);
  ensureDir(localeOut);

  const rootBuild = [
    [path.join(localeDir, 'README.md'), path.join(localeOut, 'index.html')],
    [path.join(localeDir, 'getting-started.md'), path.join(localeOut, 'getting-started.html')],
    [path.join(localeDir, 'faq.md'), path.join(localeOut, 'faq.html')],
  ];

  const rootChangelog = path.join(__dirname, '..', 'CHANGELOG.md');
  if (fs.existsSync(rootChangelog)) {
    rootBuild.push([rootChangelog, path.join(localeOut, 'changelog', 'latest.html')]);
  }

  for (const [mdPath, outPath] of rootBuild) {
    if (fs.existsSync(mdPath)) buildFile(mdPath, outPath, locale);
  }

  for (const module of ['monitor', 'dps', 'monster']) {
    buildFeatureModule(module, locale);
  }

  const faqMdDir = path.join(localeDir, 'faq');
  if (fs.existsSync(faqMdDir)) {
    ensureDir(path.join(localeOut, 'faq'));
    for (const name of fs.readdirSync(faqMdDir)) {
      if (name.endsWith('.md')) {
        buildFile(path.join(faqMdDir, name), path.join(localeOut, 'faq', name.replace(/\.md$/, '.html')), locale);
      }
    }
  }

  const changelogDir = path.join(localeDir, 'changelog');
  if (fs.existsSync(changelogDir)) {
    ensureDir(path.join(localeOut, 'changelog'));
    const changelogIndex = path.join(changelogDir, 'README.md');
    if (fs.existsSync(changelogIndex)) {
      buildFile(changelogIndex, path.join(localeOut, 'changelog', 'index.html'), locale);
    }
    for (const name of fs.readdirSync(changelogDir)) {
      if (name.endsWith('.md') && name !== 'README.md') {
        buildFile(path.join(changelogDir, name), path.join(localeOut, 'changelog', name.replace(/\.md$/, '.html')), locale);
      }
    }
  }
}

function buildLandingPage() {
  const links = BUILD_LOCALES.map((loc) => {
    const labels = LANDING[loc] || LANDING['en-US'];
    return `<li><a href="${loc}/index.html">${escapeHtml(labels.title)}</a></li>`;
  }).join('\n');

  const intro = escapeHtml(LANDING['zh-CN'].intro);
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resonance Logs Documentation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 16px; line-height: 1.6; color: #333; }
    h1 { text-align: center; }
    ul { list-style: none; padding: 0; text-align: center; }
    li { margin: 16px 0; }
    a { color: #2563eb; font-size: 1.2rem; text-decoration: none; }
    a:hover { text-decoration: underline; }
    p { text-align: center; color: #6b7280; }
  </style>
</head>
<body>
  <h1>Resonance Logs Documentation</h1>
  <p>${intro}</p>
  <ul>${links}</ul>
</body>
</html>`;
  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf-8');
  console.log('  built index.html');
}

function copySharedAssets() {
  if (!fs.existsSync(SHARED_IMG)) return;
  copyDir(SHARED_IMG, path.join(OUT_DIR, 'shared', 'img'));
  console.log('  copied shared/img');
}

function main() {
  console.log('Building doc/html_doc ...');
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  for (const locale of BUILD_LOCALES) {
    buildLocale(locale);
  }

  copySharedAssets();

  if (!ONLY_LOCALE) {
    buildLandingPage();
  }

  console.log('\nDone. Output: doc/html_doc/');
}

main();
