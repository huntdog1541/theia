/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    interfaces,
    injectable
} from 'inversify';
import {
    WidgetFactory,
} from '@theia/core/lib/browser';
import {
    Emitter,
    Event,
} from '@theia/core/lib/common';
import {
    PreviewWidget,
    PREVIEW_WIDGET_FACTORY_ID
} from './preview-widget';

@injectable()
export class PreviewWidgetFactory implements WidgetFactory {

    readonly id: string = PREVIEW_WIDGET_FACTORY_ID;

    protected readonly onWidgetCreatedEmitter = new Emitter<PreviewWidget>();

    constructor(
        protected readonly container: interfaces.Container
    ) { }

    async createWidget(options?: any): Promise<PreviewWidget> {
        const newWidget = this.container.get(PreviewWidget);
        this.fireWidgetCreated(newWidget);
        return newWidget;
    }

    get onWidgetCreated(): Event<PreviewWidget> {
        return this.onWidgetCreatedEmitter.event;
    }

    protected fireWidgetCreated(newWidget: PreviewWidget): void {
        this.onWidgetCreatedEmitter.fire(newWidget);
    }

}
