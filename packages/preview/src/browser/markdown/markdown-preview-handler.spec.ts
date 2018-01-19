/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { expect } from 'chai';
import { PreviewHandler } from '../preview-handler';
import { MarkdownPreviewHandler } from './markdown-preview-handler';

const jsdom = require('jsdom-global');

chai.use(require('chai-string'));

let previewHandler: PreviewHandler;

before(() => {
    jsdom();
    previewHandler = new MarkdownPreviewHandler();
});

describe("markdown-preview-handler", () => {

    it("renders html with line information", async () => {
        const html = await previewHandler.renderHTML(exampleMarkdown1);
        expect(html).equals(exampleHtml1);
    });

    it("finds element for source line", () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(4, document.body);
        expect(element).not.to.be.equal(undefined);
        expect(element!.tagName).to.be.equal('H2');
        expect(element!.textContent).to.be.equal('License');
    });

    it("finds previous element for empty source line", () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(3, document.body);
        expect(element).not.to.be.equal(undefined);
        expect(element!.tagName).to.be.equal('P');
        expect(element!.textContent).that.startWith('Shows a preview of supported resources.');
    });

});

const exampleMarkdown1 = //
    `# Theia - Preview Extension
Shows a preview of supported resources.
See [here](https://github.com/theia-ide/theia).

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)
`;

const exampleHtml1 = //
    `<h1 class="line" data-line="0">Theia - Preview Extension</h1>
<p class="line" data-line="1">Shows a preview of supported resources.
See <a href="https://github.com/theia-ide/theia">here</a>.</p>
<h2 class="line" data-line="4">License</h2>
<p class="line" data-line="5"><a href="https://github.com/theia-ide/theia/blob/master/LICENSE">Apache-2.0</a></p>
`;
