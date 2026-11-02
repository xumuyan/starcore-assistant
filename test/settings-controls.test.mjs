import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function page() {
  const timers = new Map(), microtasks = [], docEvents = new Map(), windowEvents = new Map();
  let timerID = 0, focused;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.dataset = {}; this.style = {};
      this.hidden = false; this.disabled = false; this.value = ''; this.events = new Map();
      const classes = new Set(); this.classList = { add: n => classes.add(n), remove: n => classes.delete(n), contains: n => classes.has(n) };
      this.rect = { left: 150, top: 200, bottom: 240, width: 340, height: 40 };
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    removeAttribute(k) { this.attributes.delete(k); }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(n => n.parent = null); this.children = []; this.append(...nodes); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    addEventListener(name, fn) { const rows = this.events.get(name) || []; rows.push(fn); this.events.set(name, rows); }
    dispatchEvent(event) { event.target = this; this['on' + event.type]?.(event); for (const fn of this.events.get(event.type) || []) fn(event); }
    focus() { focused = this; }
    scrollIntoView(options) { this.scrolled = options; }
    getBoundingClientRect() { return this.rect; }
    get scrollHeight() { return this.children.length * 40 + 8; }
  }
  const menu = new Element(), controls = [], html = read('client/hud/index.html'); menu.hidden = true;
  for (const match of html.matchAll(/<span class="settings-select">(<select id="([^"]+)">([\s\S]*?)<\/select>)([\s\S]*?)<\/span><\/label>/g)) {
    const wrapper = new Element(), select = new Element('select'), trigger = new Element('button'), caption = new Element('span');
    select.id = match[2]; select.options = [...match[3].matchAll(/<option value="([^"]+)"[^>]*>(.*?)<\/option>/g)].map(row => ({ value: row[1], label: row[2], textContent: row[2], disabled: false }));
    select.value = select.options[0].value; trigger.id = 'select-' + select.id.slice(4); trigger.hidden = true;
    trigger.setAttribute('aria-label', match[4].match(/aria-label="([^"]+)"/)[1]);
    trigger.append(caption); wrapper.append(select, trigger);
    wrapper.querySelector = selector => selector === 'select' ? select : selector === 'button' ? trigger : caption;
    controls.push({ wrapper, select, trigger, caption });
  }
  assert.equal(controls.length, 3, 'exercise the real three settings controls');
  const root = new Element(), body = new Element(); body.append(...controls.map(c => c.wrapper), menu);
  const document = { body, documentElement: root, createElement: tag => new Element(tag), getElementById: id => id === 'settings-select-menu' ? menu : null,
    querySelectorAll: selector => selector === '.settings-select' ? controls.map(c => c.wrapper) : [],
    addEventListener(name, fn) { docEvents.set(name, fn); } };
  const window = { innerWidth: 1120, innerHeight: 760, addEventListener(name, fn) { windowEvents.set(name, fn); } };
  class Event { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  vm.runInNewContext(read('client/hud/controls.js'), { document, window, Event, Date, WeakMap,
    queueMicrotask: fn => microtasks.push(fn), setTimeout: fn => { timers.set(++timerID, fn); return timerID; }, clearTimeout: id => timers.delete(id) });
  const event = extra => ({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
  return { menu, controls, root, window, focused: () => focused, timers,
    click: c => c.trigger.onclick(event()), key(c, key) { const e = event({ key }); c.trigger.onkeydown(e); return e; },
    outside: target => docEvents.get('pointerdown')({ target }), scroll: target => docEvents.get('scroll')({ target }),
    configure: () => docEvents.get('assistant-event')({ detail: { type: 'configured' } }), flush: () => microtasks.splice(0).forEach(fn => fn()),
    resize: () => windowEvents.get('resize')(), node: () => new Element() };
}

test('glass settings dropdowns retain native values, options, and safe change events', () => {
  const p = page(), c = p.controls[0];
  assert.equal(c.select.hidden, true); assert.equal(c.trigger.hidden, false);
  assert.equal(c.caption.textContent, c.select.options[0].label);
  assert.match(c.trigger.getAttribute('aria-label'), /语音服务.*Mac/);
  let changes = 0; c.select.onchange = () => changes++;
  p.click(c); assert.equal(p.menu.hidden, false); assert.equal(c.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(p.menu.children.length, c.select.options.length);
  p.menu.children[1].onclick({ preventDefault() {} });
  assert.equal(c.select.value, 'fish'); assert.equal(changes, 1); assert.equal(c.caption.textContent, c.select.options[1].label);
  assert.equal(p.menu.hidden, true); assert.equal(p.focused(), c.trigger);
  p.click(c); p.menu.children[1].onclick({ preventDefault() {} }); assert.equal(changes, 1, 'choosing same item does not fire duplicate changes');
});

test('keyboard highlights do not commit until Enter and Escape only closes the menu', () => {
  const p = page(), c = p.controls[2], original = c.select.value;
  p.key(c, 'ArrowDown'); p.key(c, 'End'); assert.equal(c.select.value, original);
  const escape = p.key(c, 'Escape'); assert.equal(escape.prevented, true); assert.equal(escape.stopped, true);
  assert.equal(p.menu.hidden, true); assert.equal(c.select.value, original);
  p.key(c, 'ArrowDown'); p.key(c, 'End'); const enter = p.key(c, 'Enter');
  assert.equal(enter.prevented, true, 'do not submit settings form'); assert.equal(c.select.value, 'f9');
  p.click(c); const tab = p.key(c, 'Tab'); assert.equal(tab.prevented, false); assert.equal(p.menu.hidden, true);
});

test('disabled choices are skipped, plain text stays text, and menus clamp within viewport', () => {
  const p = page(), c = p.controls[1]; c.select.options[1].disabled = true;
  c.select.options[2].label = '<img src=x onerror=bad()>';
  c.trigger.rect = { left: 900, top: 700, bottom: 740, width: 340, height: 40 };
  p.click(c); assert.equal(p.menu.children[1].disabled, true);
  assert.equal(p.menu.children[2].children[0].textContent, '<img src=x onerror=bad()>');
  assert.equal(p.menu.children[2].children[0].innerHTML, undefined);
  assert.ok(parseFloat(p.menu.style.top) < c.trigger.rect.top, 'flip above bottom-edge trigger');
  assert.ok(parseFloat(p.menu.style.left) + parseFloat(p.menu.style.width) <= p.window.innerWidth - 12);
  p.key(c, 'ArrowDown'); assert.equal(c.trigger.getAttribute('aria-activedescendant'), c.select.id + '-option-2');
  p.key(c, 'Enter'); assert.equal(c.select.value, 's2-pro');
  c.select.disabled = true; p.configure(); p.flush(); assert.equal(c.trigger.disabled, true); p.click(c); assert.equal(p.menu.hidden, true);
});

test('configured values sync after original settings handler and external scroll dismisses safely', () => {
  const p = page(), c = p.controls[0];
  p.click(c); p.configure(); c.select.value = 'fish'; p.flush();
  assert.equal(c.caption.textContent, c.select.options[1].label); assert.equal(p.menu.hidden, true);
  p.click(c); p.scroll(p.menu); assert.equal(p.menu.hidden, false, 'scrolling options keeps menu');
  p.scroll(p.node()); assert.equal(p.menu.hidden, false, 'unrelated scrolling does not interrupt selection');
  c.trigger.rect = { ...c.trigger.rect, top: c.trigger.rect.top - 30, bottom: c.trigger.rect.bottom - 30 };
  p.scroll(c.wrapper); assert.equal(p.menu.hidden, true, 'moving underlying panel cannot leave detached menu');
  p.click(c); const outside = p.node(); p.outside(outside); assert.equal(p.menu.hidden, true);
});

test('scroll indicators appear only during actual scrolling and hide independently after inactivity', () => {
  const p = page(), a = p.node(), b = p.node();
  assert.equal(a.classList.contains('is-scrolling'), false);
  p.scroll(a); const stale = [...p.timers.values()][0]; p.scroll(a); p.scroll(b);
  stale(); assert.equal(a.classList.contains('is-scrolling'), true, 'old timer cannot hide a new scrolling interval');
  assert.equal(b.classList.contains('is-scrolling'), true);
  [...p.timers.values()].forEach(fn => fn());
  assert.equal(a.classList.contains('is-scrolling'), false); assert.equal(b.classList.contains('is-scrolling'), false);
  const css = read('client/hud/panels.css');
  assert.match(css, /scrollbar-color:transparent transparent/); assert.match(css, /\.is-scrolling::-webkit-scrollbar-thumb\{/);
  assert.doesNotMatch(css, /\}::-webkit-scrollbar-thumb:hover/); assert.match(css, /scrollbar-gutter:stable/);
});
