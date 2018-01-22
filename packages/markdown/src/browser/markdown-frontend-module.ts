/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ResourceResolver, CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { MarkdownUri } from './markdown-uri';
import { MarkdownPreviewContribution } from './markdown-preview-contribution';
import { MarkdownResourceResolver } from './markdown-resource';
import { MarkdownPreviewWidget } from './markdown-preview-widget';
import { MarkdownPreviewWidgetFactory } from './markdown-preview-widget-factory';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(MarkdownUri).toSelf().inSingletonScope();

    bind(MarkdownPreviewWidget).toSelf().inTransientScope();
    bind(WidgetFactory).toDynamicValue(ctx => new MarkdownPreviewWidgetFactory(ctx.container));

    bind(MarkdownPreviewContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(ctx => ctx.container.get(MarkdownPreviewContribution));
    bind(MenuContribution).toDynamicValue(ctx => ctx.container.get(MarkdownPreviewContribution));
    bind(OpenHandler).toDynamicValue(ctx => ctx.container.get(MarkdownPreviewContribution)).inSingletonScope();

    bind(MarkdownResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(MarkdownResourceResolver)).inSingletonScope();
});
