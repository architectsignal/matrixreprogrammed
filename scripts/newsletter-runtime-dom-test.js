const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'newsletter.js'), 'utf8');

class FakeNode {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.id = '';
    this.name = '';
    this.type = '';
    this.textContent = '';
    this.required = false;
    this.listeners = {};
  }

  appendChild(node) {
    this.detach(node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  insertBefore(node, reference) {
    if (!reference || reference.parentNode !== this) {
      throw new Error('NotFoundError: reference node is not a child of this node');
    }
    this.detach(node);
    node.parentNode = this;
    this.children.splice(this.children.indexOf(reference), 0, node);
    return node;
  }

  detach(node) {
    if (!node.parentNode) return;
    const index = node.parentNode.children.indexOf(node);
    if (index >= 0) node.parentNode.children.splice(index, 1);
    node.parentNode = null;
  }

  getAttribute(name) {
    return this.attributes[name] || (name === 'name' ? this.name : '');
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  descendants() {
    return this.children.flatMap(child => [child, ...child.descendants()]);
  }

  querySelector(selector) {
    return this.descendants().find(node => matches(node, selector)) || null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter(node => matches(node, selector));
  }
}

function matches(node, selector) {
  if (selector.includes('type="email"')) {
    return node.tagName === 'INPUT' && (node.type === 'email' || node.name === 'email' || node.name === 'Email');
  }
  if (selector.includes('marketingConsent') || selector.includes('data-marketing-consent')) {
    return node.tagName === 'INPUT' && node.type === 'checkbox' &&
      (node.name === 'marketingConsent' || node.name === 'consent' || node.dataset.marketingConsent !== undefined);
  }
  if (selector.includes('type="submit"')) {
    return (node.tagName === 'BUTTON' || node.tagName === 'INPUT') && node.type === 'submit';
  }
  if (selector.includes('form-status') || selector.includes('newsletter-status')) {
    return /(?:^|\s)(?:form-status|newsletter-status)(?:\s|$)/.test(node.className);
  }
  return false;
}

const form = new FakeNode('form');
form.id = 'nested-newsletter-form';
form.className = 'newsletter-card';
form.textContent = 'Weekly newsletter briefing';
const email = form.appendChild(new FakeNode('input'));
email.type = 'email';
email.name = 'email';
const actions = form.appendChild(new FakeNode('div'));
actions.className = 'form-actions';
const submit = actions.appendChild(new FakeNode('button'));
submit.type = 'submit';

const document = {
  title: 'Newsletter test',
  readyState: 'complete',
  documentElement: { lang: 'en' },
  createElement: tag => new FakeNode(tag),
  querySelectorAll: selector => selector === 'form' ? [form] : [],
  addEventListener() {}
};

const sandbox = {
  document,
  location: { pathname: '/nested-newsletter-test' },
  navigator: { language: 'en' },
  console,
  setTimeout,
  clearTimeout
};

vm.runInNewContext(source, sandbox, { filename: 'newsletter.js', timeout: 1000 });
const consent = form.querySelector('input[data-marketing-consent]');
if (!consent) throw new Error('newsletter runtime did not create a consent checkbox');
if (!consent.required) throw new Error('newsletter runtime consent checkbox is not required');
const label = consent.parentNode;
if (!label || label.parentNode !== actions) throw new Error('newsletter consent was not inserted beside the nested submit control');
if (actions.children.indexOf(label) !== actions.children.indexOf(submit) - 1) throw new Error('newsletter consent was not inserted immediately before the submit control');
if (form.dataset.newsletterCapture !== 'active') throw new Error('newsletter runtime did not activate the nested form');

form.dataset.newsletterCapture = '';
vm.runInNewContext(source, sandbox, { filename: 'newsletter.js', timeout: 1000 });
const consentCount = form.descendants().filter(node => node.dataset.marketingConsent !== undefined).length;
if (consentCount !== 1) throw new Error(`newsletter runtime duplicated consent controls: ${consentCount}`);

console.log('Newsletter nested-submit DOM regression test passed.');
