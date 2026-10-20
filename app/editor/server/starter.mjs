// Blank starter site for the visual editor: shared navigation + footer and a home page with a few
// ready-made sections, in the same template format as captured sites.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NAV_HTML, FOOTER_HTML } from '../library/blocks.mjs';
import { applyOpsInTx } from './ops.mjs';

const LAYOUT = (id) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
{{@head-start}}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{@ page.title}}</title>
  <meta name="description" content="{{@ page.description}}">
  <link rel="icon" href="{{@brandurl brand.favicon}}">
{{@head-end}}
</head>
<body class="sb-body page-${id}">
  {{@section ${id}/nav}}
  <main>
  </main>
  {{@section ${id}/footer}}
</body>
</html>
`;

export function createBlankSite(store, { name }) {
  const tmp = mkdtempSync(join(tmpdir(), 'sb-blank-'));
  const write = (rel, data) => {
    mkdirSync(dirname(join(tmp, rel)), { recursive: true });
    writeFileSync(join(tmp, rel), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
  };
  try {
    const brand = String(name || 'My site').slice(0, 60);
    write('site.config.json', {
      $schema: 'Edit these values and run `npm run build`. Every key below is wired into the generated pages.',
      brand: {
        name: brand,
        logo: { src: '/assets/sb/logo.svg', alt: `${brand} logo` },
        favicon: '/assets/sb/logo.svg',
        contact: { email: 'hello@example.com', phone: '+910000000000', phoneDisplay: '+91 00000 00000' },
        social: {},
      },
      colors: {
        primary: { value: '#1f2a44' },
        accent: { value: '#f2a541' },
        text: { value: '#14161c' },
        background: { value: '#fbfaf7' },
      },
      fonts: {
        body: { family: '"Inter", system-ui, sans-serif', google: 'Inter:wght@400;500;600;700' },
        heading: { family: '"Fraunces", Georgia, serif', google: 'Fraunces:wght@600;700' },
      },
      typography: {},
      images: {},
      integrations: { allowedOrigins: [], blockedEndpoints: [], analytics: { enabled: false, headHtml: '' }, forms: {} },
    });
    write('content/shared.json', {
      navigation: {
        home: '/index.html',
        links: [{ label: 'Home', href: '/index.html' }],
        cta: { label: 'Contact', href: 'mailto:{{brand.contact.email}}' },
      },
      footer: {
        links: [{ label: 'Home', href: '/index.html' }],
        text: '© 2026 {{brand.name}}. All rights reserved.',
      },
    });
    write('components/shared/sb-nav.html', NAV_HTML);
    write('components/shared/sb-footer.html', FOOTER_HTML);
    write('layouts/home.html', LAYOUT('home'));
    write('content/pages/home.json', { page: { title: `${brand}`, description: `${brand} — welcome.` }, sections: {} });
    write('pages/home.json', {
      id: 'home',
      route: 'index.html',
      layout: 'layouts/home.html',
      sections: [
        { id: 'home/nav', localId: 'nav', type: 'navigation', component: 'shared/sb-nav', content: 'shared:navigation' },
        { id: 'home/footer', localId: 'footer', type: 'footer', component: 'shared/sb-footer', content: 'shared:footer' },
      ],
    });
    const id = store.createFromDir(tmp, { name: brand, source: 'blank' });
    return id;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Starter sections are added through the normal operations (not recorded in undo history). */
export async function seedBlankSite(store, id) {
  await store.transaction(
    id,
    'Starter content',
    (tx) => {
      let after = 'home/nav';
      for (const block of ['hero-center', 'features', 'image-text', 'testimonials', 'cta']) {
        [{ sectionId: after }] = applyOpsInTx(tx, [{ op: 'addSection', page: 'home', block, after }]);
      }
    },
    { record: false },
  );
}
