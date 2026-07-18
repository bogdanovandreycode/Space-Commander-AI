function appendInlineText(element, source) {
  const parts = String(source).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      element.append(strong);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      element.append(code);
    } else {
      element.append(document.createTextNode(part));
    }
  }
}

export function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  let list = null;
  for (const rawLine of String(markdown).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === '---') {
      list = null;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      list = null;
      const element = document.createElement(`h${Math.min(3, heading[1].length + 1)}`);
      appendInlineText(element, heading[2]);
      fragment.append(element);
      continue;
    }
    if (line.startsWith('- ')) {
      if (!list) {
        list = document.createElement('ul');
        fragment.append(list);
      }
      const item = document.createElement('li');
      appendInlineText(item, line.slice(2));
      list.append(item);
      continue;
    }
    list = null;
    const element = document.createElement(line.startsWith('> ') ? 'blockquote' : 'p');
    appendInlineText(element, line.replace(/^>\s*/, ''));
    fragment.append(element);
  }
  return fragment;
}
