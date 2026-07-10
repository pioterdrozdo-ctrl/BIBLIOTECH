'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'theme-bootstrap.js'), 'utf8');
const themes = ['light', 'dark', 'forest', 'ocean', 'sunset', 'violet', 'coffee', 'mono'];
const modes = ['light', 'dark'];
const legacyDarkThemes = new Set(['dark', 'forest', 'ocean', 'violet', 'mono']);

class ClassList {
    constructor() { this.values = new Set(); }
    add(...names) { names.forEach(name => this.values.add(name)); }
    remove(...names) { names.forEach(name => this.values.delete(name)); }
    contains(name) { return this.values.has(name); }
    toggle(name, force) {
        const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
        if (enabled) this.values.add(name);
        else this.values.delete(name);
        return enabled;
    }
}

class Element {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.classList = new ClassList();
        this.dataset = {};
        this.attributes = {};
        this.children = [];
        this.style = {
            values: {},
            colorScheme: '',
            setProperty: (name, value) => { this.style.values[name] = value; }
        };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    addEventListener() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    matches() { return false; }
}

function assertState(actual, theme, mode, message = 'theme state mismatch') {
    assert.equal(actual.theme, theme, `${message}: palette`);
    assert.equal(actual.mode, mode, `${message}: brightness mode`);
}

function createStorage(seed = {}) {
    const values = new Map(Object.entries(seed));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        snapshot() { return Object.fromEntries(values); }
    };
}

function createRuntime(seed = {}, search = '') {
    const html = new Element('html');
    const body = new Element('body');
    const head = new Element('head');
    const links = new Map();
    let themeMeta = null;

    const document = {
        documentElement: html,
        body,
        head,
        createElement(tagName) { return new Element(tagName); },
        getElementById() { return null; },
        addEventListener() {},
        querySelector(selector) {
            const relMatch = selector.match(/^link\[rel="([^"]+)"\]$/);
            if (relMatch) return links.get(relMatch[1]) || null;
            if (selector === 'meta[name="theme-color"]') return themeMeta;
            return null;
        },
        querySelectorAll() { return []; }
    };

    const originalAppend = head.appendChild.bind(head);
    head.appendChild = element => {
        originalAppend(element);
        if (element.tagName === 'LINK') links.set(element.rel, element);
        if (element.tagName === 'META' && element.name === 'theme-color') themeMeta = element;
        return element;
    };

    const localStorage = createStorage(seed);
    const events = [];
    const window = {
        location: { search },
        addEventListener() {},
        dispatchEvent(event) { events.push(event); },
        matchMedia() { return { matches: false }; }
    };

    const context = {
        window,
        document,
        localStorage,
        URLSearchParams,
        CustomEvent: class CustomEvent {
            constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
        },
        MutationObserver: class MutationObserver {
            constructor(callback) { this.callback = callback; }
            observe() {}
            disconnect() {}
        },
        setTimeout,
        clearTimeout,
        console
    };

    vm.runInNewContext(source, context, { filename: 'theme-bootstrap.js' });
    return { controller: window.BibliotechTheme, html, body, localStorage, events };
}

for (const theme of themes) {
    const runtime = createRuntime({ theme });
    const expectedMode = legacyDarkThemes.has(theme) ? 'dark' : 'light';
    assertState(runtime.controller.getState(), theme, expectedMode, `legacy migration failed for ${theme}`);
    assert.equal(runtime.localStorage.getItem('bibliotech_theme_mode'), expectedMode);
}

for (const theme of themes) {
    for (const mode of modes) {
        const runtime = createRuntime({ theme, bibliotech_theme_mode: mode });
        const state = runtime.controller.getState();
        assertState(state, theme, mode, `${theme}/${mode} state mismatch`);
        assert.equal(runtime.html.dataset.theme, theme);
        assert.equal(runtime.html.dataset.themeMode, mode);
        assert.equal(runtime.body.dataset.theme, theme);
        assert.equal(runtime.body.dataset.themeMode, mode);
        assert.equal(runtime.html.classList.contains('dark-theme'), mode === 'dark');
        assert.ok(runtime.html.style.values['--bg'], `${theme}/${mode} has no background variable`);
        assert.ok(runtime.html.style.values['--accent'], `${theme}/${mode} has no accent variable`);
    }
}

{
    const runtime = createRuntime({ theme: 'ocean', bibliotech_theme_mode: 'dark' });
    const toggled = runtime.controller.toggleMode();
    assertState(toggled, 'ocean', 'light', 'mode toggle changed the palette');
    assert.equal(runtime.localStorage.getItem('theme'), 'ocean');
    assert.equal(runtime.localStorage.getItem('bibliotech_theme_mode'), 'light');

    const selected = runtime.controller.selectTheme('violet');
    assertState(selected, 'violet', 'light', 'palette selection changed brightness');
    assert.equal(runtime.localStorage.getItem('theme'), 'violet');
    assert.equal(runtime.localStorage.getItem('bibliotech_theme_mode'), 'light');
}

{
    const runtime = createRuntime({}, '?theme=coffee&mode=dark');
    assertState(runtime.controller.getState(), 'coffee', 'dark', 'query parameters were not applied');
}

console.log(`Theme controller OK: ${themes.length * modes.length} palette/mode combinations, migration and toggles checked.`);
