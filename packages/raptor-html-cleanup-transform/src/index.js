/* eslint-env node */
'use strict';

const parse5 = require('parse5');
const Readable = require('stream').Readable;
const constants = require('./constants');
const isUnaryTag = constants.isUnaryTag;

function normalizeAttrName(name) {
    // :foo => d:foo
    if (name[0] === constants.DIRECTIVE_SYMBOL) {
        return constants.DEFAULT_DIRECTIVE_PREFIX + name;
    }
    // @foo => bind:foo
    if (name[0] === constants.EVENT_HANDLER_SYMBOL) {
        return constants.EVENT_HANDLER_DIRECTIVE_PREFIX + constants.DIRECTIVE_SYMBOL + name.substring(1);
    }
    return name;
}

function generateHTMLAttr(attr) {
    var value = attr.unquoted ? attr.value : `"${attr.value}"`;
    return `${attr.name}=${value}`;
}

function isExpression(str) {
    return str[0] === '{' && str[str.length - 1] === '}';
}

function parseAttrs(attrs) {
    const normalizedAttrs = attrs.map((attr) => {
        return {
            name: attr.prefix ? `${attr.prefix}:${attr.name}` : normalizeAttrName(attr.name),
            value : attr.value,
            unquoted: isExpression(attr.value) }
        }
    );
    return normalizedAttrs.map(generateHTMLAttr);
}

function createStreamParser(output) {
    const sax = new parse5.SAXParser();
    sax.on('startTag', (tagName, rawAttrs) => {
        const attrs = rawAttrs && rawAttrs.length ? ' ' + parseAttrs(rawAttrs).join(' ') : '';
        const tag = isUnaryTag(tagName) ? `<${tagName}${attrs}/>` : `<${tagName}${attrs}>`;
        output.push(tag);
    });
    // sax.on('comment', comment => {/* skip commnents */});
    sax.on('endTag', (tag) => output.push(`</${tag}>`));
    sax.on('text', (text) => output.push(text));

    return sax;
}

class HTMLReadable extends Readable {
    constructor(src) {
        super();
        this.src = src;
    }
    _read() {
        this.push(this.src);
        this.push(null);
    }
}

module.exports = {
    transform (buffer) {
        const src = buffer.toString();
        // We do a first pass so we get the "correct" beahviour when dealing with broken self-closing/missing tags.
        const parsed = parse5.serialize(parse5.parseFragment(src));
        // Now we do our own transformations to make it "JSX" compliant
        return new Promise(function (resolve) {
            const output = [];
            const parser = createStreamParser(output);
            const sourceStream = new HTMLReadable(parsed);

            sourceStream.pipe(parser);
            parser.on('end', () => resolve(output.join('')));
        });
    }
};