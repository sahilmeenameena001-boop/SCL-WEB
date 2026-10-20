// Section blocks and elements that can be added in the visual editor.
// `animate` / `design` are keyed by data-sb-anim markers in the markup ("root" = the section). Markup uses the template
// engine's tokens; default content is stored in the page's content file. Styles: runtime/sb-blocks.css.

const PH = (n) => `/assets/sb/${n}`;
const root = (type, cls, inner) =>
  `<section class="sb-section ${cls}" data-sar-section="{{@sectionid}}" data-sar-type="${type}">\n${inner}\n</section>\n`;

export const BLOCKS = [
  {
    id: 'hero-center',
    label: 'Hero — centered',
    category: 'Hero',
    html: root(
      'hero',
      'sb-hero sb-hero-gradient',
      `  <div class="sb-inner sb-narrow sb-center">
    <span class="sb-badge">{{@ badge}}</span>
    <h1 data-sb-anim="heading">{{@ heading}}</h1>
    <p class="sb-lead" data-sb-anim="text">{{@ text}}</p>
    <div class="sb-actions">
      <a class="sb-btn" href="{{@url primary.href}}">{{@ primary.label}}</a>
      <a class="sb-btn sb-btn-ghost" href="{{@url secondary.href}}">{{@ secondary.label}}</a>
    </div>
  </div>`,
    ),
    content: {
      badge: '✦ New: launch your site in minutes',
      heading: 'Build something people remember',
      text: 'A bold headline, a short promise and two clear actions. Click any text to edit it.',
      primary: { label: 'Get started', href: '#' },
      secondary: { label: 'Learn more', href: '#' },
    },
    animate: { heading: { text: { preset: 'words-up', trigger: 'load' } }, text: { entrance: { preset: 'fade-up', delay: 0.3, trigger: 'load' } } },
  },
  {
    id: 'hero-split',
    label: 'Hero — text + image',
    category: 'Hero',
    html: root(
      'hero',
      'sb-hero',
      `  <div class="sb-inner sb-split">
    <div>
      <span class="sb-eyebrow">{{@ eyebrow}}</span>
      <h1>{{@ heading}}</h1>
      <p class="sb-lead">{{@ text}}</p>
      <div class="sb-actions">
        <a class="sb-btn" href="{{@url primary.href}}">{{@ primary.label}}</a>
        <a class="sb-btn sb-btn-ghost" href="{{@url secondary.href}}">{{@ secondary.label}}</a>
      </div>
    </div>
    <div class="sb-hero-media"><img src="{{@url image.src}}" alt="{{@ image.alt}}"></div>
  </div>`,
    ),
    content: {
      eyebrow: 'Studio · Since 2026',
      heading: 'Design that moves people',
      text: 'Pair a strong message with an image. Drag a photo from Assets onto the image to replace it.',
      primary: { label: 'Start a project', href: '#' },
      secondary: { label: 'See our work', href: '#' },
      image: { src: PH('ph-wide-1.svg'), alt: 'Hero image' },
    },
  },
  {
    id: 'hero-image',
    label: 'Hero — full background image',
    category: 'Hero',
    html: root(
      'hero',
      'sb-hero sb-hero-image',
      `  <div class="sb-inner sb-narrow sb-center">
    <span class="sb-eyebrow">{{@ eyebrow}}</span>
    <h1>{{@ heading}}</h1>
    <p class="sb-lead">{{@ text}}</p>
    <div class="sb-actions"><a class="sb-btn" href="{{@url primary.href}}">{{@ primary.label}}</a></div>
  </div>`,
    ),
    content: {
      eyebrow: 'Welcome',
      heading: 'Your story, full screen',
      text: 'Change the background in Style → Background, or drop an image on this section.',
      primary: { label: 'Explore', href: '#' },
    },
    design: { bg: { type: 'image', image: PH('ph-wide-2.svg'), overlay: 'rgba(8,10,18,0.45)', size: 'cover', position: 'center' } },
    animate: { root: { parallax: { speed: 0.4, mode: 'background' } } },
  },
  {
    id: 'features',
    label: 'Features — 3 cards',
    category: 'Content',
    html: root(
      'cards',
      '',
      `  <div class="sb-inner">
    <div class="sb-head sb-center sb-narrow">
      <span class="sb-eyebrow">{{@ eyebrow}}</span>
      <h2>{{@ heading}}</h2>
      <p class="sb-lead">{{@ text}}</p>
    </div>
    <div class="sb-grid sb-cols-3" data-sb-anim="grid">
      {{@each items}}<article class="sb-card">
        <div class="sb-icon">{{@ icon}}</div>
        <h3>{{@ title}}</h3>
        <p>{{@ text}}</p>
      </article>{{@end}}
    </div>
  </div>`,
    ),
    content: {
      eyebrow: 'Why us',
      heading: 'Everything you need',
      text: 'Three reasons, each in its own card. Duplicate a card to add more.',
      items: [
        { icon: '⚡', title: 'Fast', text: 'Static pages that load instantly on every device.' },
        { icon: '✦', title: 'Beautiful', text: 'Typography, colour and motion that feel considered.' },
        { icon: '◎', title: 'Focused', text: 'Clear messages that turn visitors into customers.' },
      ],
    },
    animate: { grid: { entrance: { preset: 'fade-up', stagger: true, staggerAmount: 0.12 } } },
  },
  {
    id: 'image-text',
    label: 'Image + text',
    category: 'Content',
    html: root(
      'content',
      '',
      `  <div class="sb-inner sb-split">
    <img class="sb-img" src="{{@url image.src}}" alt="{{@ image.alt}}">
    <div>
      <span class="sb-eyebrow">{{@ eyebrow}}</span>
      <h2>{{@ heading}}</h2>
      <div class="sb-rich">{{@html body}}</div>
      <div class="sb-actions"><a class="sb-btn" href="{{@url cta.href}}">{{@ cta.label}}</a></div>
    </div>
  </div>`,
    ),
    content: {
      eyebrow: 'About',
      heading: 'A story worth telling',
      body: '<p>Use this block to introduce your team, a product or a process. The text supports <strong>bold</strong>, <em>italic</em> and links.</p>',
      cta: { label: 'Read more', href: '#' },
      image: { src: PH('ph-wide-3.svg'), alt: 'Illustration' },
    },
  },
  {
    id: 'text-image',
    label: 'Text + image (reversed)',
    category: 'Content',
    html: root(
      'content',
      '',
      `  <div class="sb-inner sb-split sb-reverse">
    <img class="sb-img" src="{{@url image.src}}" alt="{{@ image.alt}}">
    <div>
      <span class="sb-eyebrow">{{@ eyebrow}}</span>
      <h2>{{@ heading}}</h2>
      <div class="sb-rich">{{@html body}}</div>
    </div>
  </div>`,
    ),
    content: {
      eyebrow: 'Process',
      heading: 'How we work',
      body: '<p>Image on the right, words on the left. On phones the image stacks above the text.</p>',
      image: { src: PH('ph-wide-1.svg'), alt: 'Illustration' },
    },
  },
  {
    id: 'rich-text',
    label: 'Text block',
    category: 'Content',
    html: root(
      'content',
      '',
      `  <div class="sb-inner sb-narrow">
    <h2>{{@ heading}}</h2>
    <div class="sb-rich">{{@html body}}</div>
  </div>`,
    ),
    content: {
      heading: 'A heading for your text',
      body: '<p>Write as much as you need here. Double-click to edit; select text to make it bold, italic or a link.</p><p>Paragraphs, lists and links are all supported.</p>',
    },
  },
  {
    id: 'gallery',
    label: 'Gallery grid',
    category: 'Media',
    html: root(
      'gallery',
      '',
      `  <div class="sb-inner">
    <div class="sb-head"><h2>{{@ heading}}</h2></div>
    <div class="sb-gallery" data-sb-anim="gallery">
      {{@each images}}<figure><img src="{{@url src}}" alt="{{@ alt}}"></figure>{{@end}}
    </div>
  </div>`,
    ),
    content: {
      heading: 'Gallery',
      images: [1, 2, 3, 1, 2, 3].map((n, i) => ({ src: PH(`ph-wide-${n}.svg`), alt: `Gallery image ${i + 1}` })),
    },
    animate: { gallery: { entrance: { preset: 'zoom-in', stagger: true, staggerAmount: 0.08 } } },
  },
  {
    id: 'video',
    label: 'Video (YouTube)',
    category: 'Media',
    html: root(
      'media',
      '',
      `  <div class="sb-inner sb-narrow sb-center">
    <h2>{{@ heading}}</h2>
    <iframe class="sb-video" src="{{@url video.src}}" title="{{@ video.title}}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
  </div>`,
    ),
    content: { heading: 'Watch the film', video: { src: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ', title: 'Video' } },
    origins: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
  },
  {
    id: 'testimonials',
    label: 'Testimonials',
    category: 'Social proof',
    html: root(
      'testimonials',
      '',
      `  <div class="sb-inner">
    <div class="sb-head sb-center"><h2>{{@ heading}}</h2></div>
    <div class="sb-grid sb-cols-3" data-sb-anim="grid">
      {{@each quotes}}<figure class="sb-card sb-testimonial">
        <blockquote>{{@ text}}</blockquote>
        <figcaption class="sb-person"><img src="{{@url photo}}" alt=""><div><strong>{{@ name}}</strong><span>{{@ role}}</span></div></figcaption>
      </figure>{{@end}}
    </div>
  </div>`,
    ),
    content: {
      heading: 'Loved by our clients',
      quotes: [
        { text: '“They understood what we needed before we did.”', name: 'Asha Rao', role: 'Founder, Lumen', photo: PH('ph-avatar-1.svg') },
        { text: '“Our new site doubled enquiries in a month.”', name: 'Daniel Kim', role: 'CEO, Northfield', photo: PH('ph-avatar-2.svg') },
        { text: '“Calm, fast and delightful to work with.”', name: 'Meera Shah', role: 'Head of Marketing, Orbit', photo: PH('ph-avatar-3.svg') },
      ],
    },
    animate: { grid: { entrance: { preset: 'fade-up', stagger: true } } },
  },
  {
    id: 'stats',
    label: 'Stats / numbers',
    category: 'Social proof',
    html: root(
      'stats',
      '',
      `  <div class="sb-inner">
    <div class="sb-grid sb-cols-4 sb-center" data-sb-anim="grid">
      {{@each stats}}<div class="sb-stat"><strong>{{@ value}}</strong><span>{{@ label}}</span></div>{{@end}}
    </div>
  </div>`,
    ),
    content: {
      stats: [
        { value: '120+', label: 'Projects shipped' },
        { value: '98%', label: 'Happy clients' },
        { value: '12', label: 'Countries' },
        { value: '24/7', label: 'Support' },
      ],
    },
    animate: { grid: { entrance: { preset: 'pop', stagger: true } } },
  },
  {
    id: 'logos',
    label: 'Logo strip',
    category: 'Social proof',
    html: root(
      'logos',
      '',
      `  <div class="sb-inner sb-center">
    <p class="sb-eyebrow">{{@ heading}}</p>
    <div class="sb-logos">{{@each logos}}<img src="{{@url src}}" alt="{{@ alt}}">{{@end}}</div>
  </div>`,
    ),
    content: { heading: 'Trusted by teams at', logos: [1, 2, 3, 4].map((n) => ({ src: PH(`ph-logo-${n}.svg`), alt: `Logo ${n}` })) },
  },
  {
    id: 'pricing',
    label: 'Pricing — 3 plans',
    category: 'Conversion',
    html: root(
      'pricing',
      '',
      `  <div class="sb-inner">
    <div class="sb-head sb-center"><h2>{{@ heading}}</h2><p class="sb-lead">{{@ text}}</p></div>
    <div class="sb-grid sb-cols-3">
      {{@each plans}}<div class="sb-card">
        <h3>{{@ name}}</h3>
        <div class="sb-price">{{@ price}} <small>{{@ period}}</small></div>
        <div class="sb-rich">{{@html features}}</div>
        <a class="sb-btn" href="{{@url cta.href}}">{{@ cta.label}}</a>
      </div>{{@end}}
    </div>
  </div>`,
    ),
    content: {
      heading: 'Simple pricing',
      text: 'Pick a plan that fits. Upgrade any time.',
      plans: [
        { name: 'Starter', price: '₹999', period: '/month', features: '<ul><li>1 website</li><li>Basic analytics</li><li>Email support</li></ul>', cta: { label: 'Choose Starter', href: '#' } },
        { name: 'Growth', price: '₹2,499', period: '/month', features: '<ul><li>5 websites</li><li>Advanced analytics</li><li>Priority support</li></ul>', cta: { label: 'Choose Growth', href: '#' } },
        { name: 'Scale', price: '₹5,999', period: '/month', features: '<ul><li>Unlimited websites</li><li>Custom domain</li><li>Dedicated manager</li></ul>', cta: { label: 'Talk to us', href: '#' } },
      ],
    },
  },
  {
    id: 'faq',
    label: 'FAQ',
    category: 'Conversion',
    html: root(
      'faq',
      '',
      `  <div class="sb-inner sb-narrow">
    <h2>{{@ heading}}</h2>
    <div class="sb-faq">
      {{@each questions}}<details><summary>{{@ q}}</summary><div>{{@html a}}</div></details>{{@end}}
    </div>
  </div>`,
    ),
    content: {
      heading: 'Questions & answers',
      questions: [
        { q: 'How long does it take?', a: '<p>Most sites go live within two weeks.</p>' },
        { q: 'Can I edit the site myself?', a: '<p>Yes — every text, image, colour and animation is editable.</p>' },
        { q: 'Do you offer support?', a: '<p>We are a message away, every working day.</p>' },
      ],
    },
  },
  {
    id: 'cta',
    label: 'Call to action banner',
    category: 'Conversion',
    html: root(
      'cta',
      '',
      `  <div class="sb-inner">
    <div class="sb-cta-box" data-sb-anim="box">
      <h2>{{@ heading}}</h2>
      <p class="sb-lead">{{@ text}}</p>
      <div class="sb-actions"><a class="sb-btn" href="{{@url cta.href}}">{{@ cta.label}}</a></div>
    </div>
  </div>`,
    ),
    content: { heading: 'Ready to begin?', text: 'Tell us about your project and we will reply within a day.', cta: { label: 'Contact us', href: 'mailto:{{brand.contact.email}}' } },
    animate: { box: { entrance: { preset: 'zoom-in' } } },
  },
  {
    id: 'contact',
    label: 'Contact details',
    category: 'Conversion',
    html: root(
      'contact',
      '',
      `  <div class="sb-inner sb-split">
    <div>
      <h2>{{@ heading}}</h2>
      <p class="sb-lead">{{@ text}}</p>
    </div>
    <div class="sb-grid">
      <a class="sb-card" href="mailto:{{@brand brand.contact.email}}"><h3>Email</h3><p>{{@brand brand.contact.email}}</p></a>
      <div class="sb-card"><h3>{{@ address.title}}</h3><p>{{@ address.text}}</p></div>
    </div>
  </div>`,
    ),
    content: { heading: 'Get in touch', text: 'We would love to hear from you.', address: { title: 'Visit', text: '12 Example Street, Mumbai' } },
  },
  {
    id: 'spacer',
    label: 'Empty section',
    category: 'Layout',
    html: root('content', '', `  <div class="sb-inner">\n    <div class="sb-spacer"></div>\n  </div>`),
    content: {},
  },
];

/** Navigation and footer used by new blank sites (shared across pages). */
export const NAV_HTML = `<header class="sb-section sb-nav" data-sar-section="{{@sectionid}}" data-sar-type="navigation">
  <div class="sb-inner">
    <a class="sb-brand" href="{{@url home}}"><img src="{{@brandurl brand.logo.src}}" alt="">{{@brand brand.name}}</a>
    <ul class="sb-links">{{@each links}}<li><a href="{{@url href}}">{{@ label}}</a></li>{{@end}}</ul>
    <a class="sb-btn" href="{{@url cta.href}}">{{@ cta.label}}</a>
  </div>
</header>
`;
export const FOOTER_HTML = `<footer class="sb-section sb-footer" data-sar-section="{{@sectionid}}" data-sar-type="footer">
  <div class="sb-inner">
    <strong>{{@brand brand.name}}</strong>
    <ul class="sb-links">{{@each links}}<li><a href="{{@url href}}">{{@ label}}</a></li>{{@end}}</ul>
    <small>{{@ text}}</small>
  </div>
</footer>
`;

/** Elements that can be inserted into a section. `k` is the unique field key for the new content. */
export const ELEMENTS = {
  heading: { label: 'Heading', make: (k, p) => ({ html: `<h2>{{@ ${k}}}</h2>`, value: p.text || 'New heading' }) },
  subheading: { label: 'Subheading', make: (k, p) => ({ html: `<h3>{{@ ${k}}}</h3>`, value: p.text || 'New subheading' }) },
  paragraph: { label: 'Paragraph', make: (k, p) => ({ html: `<p>{{@ ${k}}}</p>`, value: p.text || 'Write something here. Double-click to edit.' }) },
  richtext: { label: 'Rich text', make: (k, p) => ({ html: `<div class="sb-rich">{{@html ${k}}}</div>`, value: p.html || '<p>Rich text with <strong>bold</strong> and <a href="#">links</a>.</p>' }) },
  button: {
    label: 'Button',
    make: (k, p) => ({ html: `<a class="sb-btn" href="{{@url ${k}.href}}">{{@ ${k}.label}}</a>`, value: { label: p.label || 'Click me', href: p.href || '#' } }),
  },
  image: {
    label: 'Image',
    make: (k, p) => ({ html: `<img class="sb-img" src="{{@url ${k}.src}}" alt="{{@ ${k}.alt}}">`, value: { src: p.src || '/assets/sb/ph-wide-1.svg', alt: p.alt || '' } }),
  },
  video: {
    label: 'Video file',
    make: (k, p) => ({ html: `<video class="sb-video" src="{{@url ${k}.src}}" controls playsinline></video>`, value: { src: p.src || '' } }),
  },
  embed: {
    label: 'Embed / HTML',
    make: (k, p) => ({ html: `<div class="sb-embed">{{@html ${k}}}</div>`, value: p.html || '<p style="padding:24px;border:1px dashed #999;text-align:center">Paste embed HTML in the inspector</p>' }),
  },
  quote: { label: 'Quote', make: (k, p) => ({ html: `<blockquote class="sb-quote">{{@ ${k}}}</blockquote>`, value: p.text || '“A memorable quote.”' }) },
  spacer: { label: 'Spacer', make: () => ({ html: '<div class="sb-spacer"></div>' }) },
  divider: { label: 'Divider', make: () => ({ html: '<hr class="sb-divider">' }) },
};

export const blockById = (id) => BLOCKS.find((b) => b.id === id);
