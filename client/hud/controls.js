'use strict';
(() => {
  const menu = document.getElementById('settings-select-menu');
  const controls = [...document.querySelectorAll('.settings-select')].map(wrapper => ({
    select: wrapper.querySelector('select'), trigger: wrapper.querySelector('button'),
    caption: wrapper.querySelector('[data-select-value]'),
    label: wrapper.querySelector('button').getAttribute('aria-label')
  }));
  let current = null;
  function sync() {
    for (const control of controls) {
      const option = [...control.select.options].find(item => item.value === control.select.value);
      control.caption.textContent = option?.label || option?.textContent || '请选择';
      control.trigger.disabled = control.select.disabled;
      control.trigger.setAttribute('aria-label', control.label + '：' + control.caption.textContent);
      control.trigger.title = control.caption.textContent;
    }
  }
  function close(restoreFocus = false) {
    if (!current) return;
    const trigger = current.control.trigger;
    current = null; menu.hidden = true; menu.replaceChildren();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function active(index) {
    if (!current || !current.options.length) return;
    current.index = Math.max(0, Math.min(index, current.options.length - 1));
    current.nodes.forEach(node => node.dataset.active = 'false');
    const choice = current.options[current.index];
    choice.node.dataset.active = 'true';
    current.control.trigger.setAttribute('aria-activedescendant', choice.node.id);
    choice.node.scrollIntoView({ block: 'nearest' });
  }
  function place() {
    if (!current) return;
    const rect = current.control.trigger.getBoundingClientRect();
    current.anchor = { top: rect.top, left: rect.left };
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
    menu.style.width = width + 'px';
    menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
    menu.style.maxHeight = '240px';
    const desired = Math.min(menu.scrollHeight, 240);
    const below = window.innerHeight - rect.bottom - 20, above = rect.top - 20;
    const up = below < desired && above > below;
    const height = Math.min(desired, Math.max(24, up ? above : below));
    menu.style.maxHeight = height + 'px';
    menu.style.top = Math.max(12, Math.min(up ? rect.top - height - 6 : rect.bottom + 6, window.innerHeight - height - 12)) + 'px';
  }
  function choose(choice) {
    if (!current || choice.option.disabled) return;
    const { select } = current.control;
    if (select.value !== choice.option.value) {
      select.value = choice.option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync(); close(true);
  }
  function open(control) {
    if (control.select.disabled) return;
    close(); sync();
    current = { control, options: [], nodes: [], index: 0, search: '', searchedAt: 0 };
    menu.setAttribute('aria-label', control.label);
    [...control.select.options].forEach((option, index) => {
      const node = document.createElement('button');
      node.type = 'button'; node.className = 'settings-select-option';
      node.id = control.select.id + '-option-' + index; node.tabIndex = -1;
      node.disabled = option.disabled; node.setAttribute('role', 'option');
      node.setAttribute('aria-selected', String(option.value === control.select.value));
      node.setAttribute('aria-disabled', String(option.disabled));
      const text = document.createElement('span'); text.textContent = option.label || option.textContent;
      const check = document.createElement('img'); check.src = 'icons/check.svg'; check.alt = '';
      node.append(text, check); menu.append(node); current.nodes.push(node);
      const choice = { option, node };
      if (!option.disabled) current.options.push(choice);
      node.onclick = event => { event.preventDefault(); choose(choice); };
      node.onmouseenter = () => { if (!node.disabled && current) active(current.options.indexOf(choice)); };
    });
    control.trigger.setAttribute('aria-expanded', 'true'); menu.hidden = false;
    place(); active(Math.max(0, current.options.findIndex(choice => choice.option.value === control.select.value)));
    control.trigger.focus({ preventScroll: true });
  }
  for (const control of controls) {
    control.select.hidden = true; control.trigger.hidden = false;
    control.select.addEventListener('change', sync);
    control.trigger.onclick = event => { event.preventDefault(); current?.control === control ? close(true) : open(control); };
    control.trigger.onkeydown = event => {
      if (control.select.disabled) return;
      const key = event.key;
      if (key === 'Tab') { close(); return; }
      if (key === 'Escape' && current?.control === control) { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
        event.preventDefault(); event.stopPropagation();
        if (current?.control !== control) { open(control); if (key === 'End') active(current.options.length - 1); return; }
        if (key === 'ArrowDown') active(current.index + 1);
        if (key === 'ArrowUp') active(current.index - 1);
        if (key === 'Home') active(0);
        if (key === 'End') active(current.options.length - 1);
        if (key === 'Enter' || key === ' ') { const choice = current.options[current.index]; if (choice) choose(choice); }
      } else if (current?.control === control && key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const now = Date.now(); current.search = now - current.searchedAt < 600 ? current.search + key : key;
        current.searchedAt = now;
        const index = current.options.findIndex(choice => (choice.option.label || choice.option.textContent).toLocaleLowerCase().startsWith(current.search.toLocaleLowerCase()));
        if (index >= 0) active(index);
      }
    };
  }
  menu.onmousedown = event => event.preventDefault();
  document.addEventListener('pointerdown', event => {
    if (current && !menu.contains(event.target) && !current.control.trigger.contains(event.target)) close();
  }, true);
  window.addEventListener('resize', () => { if (current) place(); });
  document.addEventListener('assistant-event', ({ detail }) => {
    if (['configured', 'preference'].includes(detail.type)) { close(); queueMicrotask(sync); }
    if (detail.type === 'navigate') close();
  });
  const scrolling = new WeakMap();
  document.addEventListener('scroll', event => {
    const node = event.target === document ? document.documentElement : event.target;
    if (node?.classList) {
      node.classList.add('is-scrolling');
      clearTimeout(scrolling.get(node));
      const timer = setTimeout(() => { if (scrolling.get(node) === timer) { node.classList.remove('is-scrolling'); scrolling.delete(node); } }, 800);
      scrolling.set(node, timer);
    }
    if (current && !menu.contains(event.target) && node?.contains?.(current.control.trigger)) {
      const rect = current.control.trigger.getBoundingClientRect();
      if (Math.abs(rect.top - current.anchor.top) > 1 || Math.abs(rect.left - current.anchor.left) > 1) close();
    }
  }, { capture: true, passive: true });
  sync();
})();
