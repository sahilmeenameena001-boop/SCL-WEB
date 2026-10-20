// Human-readable names for elements, sections and fields in the Layers panel and inspector.

const TAGS = {
  h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
  p: 'Paragraph', img: 'Image', video: 'Video', ul: 'List', ol: 'List', li: 'List item', blockquote: 'Quote',
  button: 'Button', form: 'Form', input: 'Input', textarea: 'Text area', label: 'Label', nav: 'Navigation',
  header: 'Header', footer: 'Footer', section: 'Section', article: 'Article', aside: 'Aside', figure: 'Figure',
  figcaption: 'Caption', span: 'Text', strong: 'Bold', em: 'Italic', small: 'Small text', hr: 'Divider',
  svg: 'Icon', iframe: 'Embed', table: 'Table', picture: 'Picture', main: 'Main', body: 'Page',
};

const SECTION_TYPES = {
  navigation: 'Navigation', hero: 'Hero', cards: 'Cards', gallery: 'Gallery', testimonials: 'Testimonials', pricing: 'Pricing',
  form: 'Form', faq: 'FAQ', cta: 'Call to action', content: 'Content', footer: 'Footer', features: 'Features', contact: 'Contact',
  stats: 'Stats', logos: 'Logos', team: 'Team',
};

export const sectionLabel = (type) => SECTION_TYPES[type] || (type ? type[0].toUpperCase() + type.slice(1) : 'Section');

export function elementLabel({ tag, classes = [], text = '', isSection = false, sectionType } = {}) {
  if (isSection) return sectionLabel(sectionType);
  let name;
  if (tag === 'a') name = classes.some((c) => /btn|button/i.test(c)) ? 'Button' : 'Link';
  else if (tag === 'div') name = classes.some((c) => /card/i.test(c)) ? 'Card' : classes.some((c) => /grid/i.test(c)) ? 'Grid' : classes.some((c) => /rich/i.test(c)) ? 'Rich text' : 'Box';
  else name = TAGS[tag] || `<${tag}>`;
  const snippet = String(text || '').replace(/\s+/g, ' ').trim();
  return snippet ? `${name} · ${snippet.length > 28 ? `${snippet.slice(0, 27)}…` : snippet}` : name;
}

/** "sections.hero.primary.label" -> "Primary label"; "items.2.title" -> "Title". */
export function fieldLabel(path = '') {
  const parts = String(path)
    .split('.')
    .filter((p) => !/^\d+$/.test(p));
  const tail = parts.slice(-2);
  if (tail.length === 2 && /^(label|href|src|alt|text|title)$/.test(tail[1])) return humanize(`${tail[0]} ${tail[1]}`);
  return humanize(parts.at(-1) || 'Value');
}

// Keys of inserted (and duplicated) elements carry random suffixes: "heading_k3x9a", "heading_k3x9a_ab12".
const INSERTED_KEY = /\b(heading|subheading|paragraph|richtext|button|image|video|embed|quote)(?:_[a-z0-9]{4,5})+(?![a-z0-9])/g;

function humanize(s) {
  const t = String(s)
    .replace(INSERTED_KEY, '$1')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : 'Value';
}
