/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import {
    EditorManager, EditorDecorationsService, TextEditor, EditorDecoration, EditorDecorationOptions, Range, Position, EditorDecorationStyle
} from '@theia/editor/lib/browser';
import { GitFileBlame, Commit } from '../../common';
import { Disposable, DisposableCollection } from '@theia/core';
import * as moment from 'moment';
import { HoverProvider, TextDocumentPositionParams, Hover, CancellationToken, Languages } from '@theia/languages/lib/common';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class BlameDecorator implements HoverProvider {

    @inject(EditorDecorationsService)
    protected readonly editorDecorationsService: EditorDecorationsService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(Languages)
    protected readonly languages: Languages;

    constructor(
    ) { }

    protected registerHoverProvider(uri: string): Disposable {
        if (this.languages.registerHoverProvider) {
            return this.languages.registerHoverProvider([{ pattern: new URI(uri).withoutScheme().toString() }], this);
        }
        return Disposable.NULL;
    }

    protected emptyHover: Hover = { contents: '' };

    async provideHover(params: TextDocumentPositionParams, token: CancellationToken): Promise<Hover> {
        const { line } = params.position;
        const uri = params.textDocument.uri;
        const applications = this.appliedDecorations.get(uri);
        if (!applications) {
            return this.emptyHover;
        }
        const blame = applications.blame;
        if (!blame) {
            return this.emptyHover;
        }
        const commitLine = blame.lines.find(l => l.line === line);
        if (!commitLine) {
            return this.emptyHover;
        }
        const sha = commitLine.sha;
        const commit = blame.commits.find(c => c.sha === sha)!;
        const date = new Date(commit.author.timestamp);
        let commitMessage = commit.summary + '\n' + (commit.body || '');
        commitMessage = commitMessage.replace(/[`\>\#\*\_\-\+]/g, '\\$&').replace(/\n/g, '  \n');
        const message = `${commit.sha}\n \n ${commit.author.name}, ${date.toString()}\n \n> ${commitMessage}`;

        const hover = {
            contents: [message],
            range: Range.create(Position.create(line, 0), Position.create(line, 10 ^ 10))
        };
        return hover;
    }

    protected appliedDecorations = new Map<string, AppliedBlameDecorations>();

    decorate(blame: GitFileBlame, editor: TextEditor, highlightLine: number): Disposable {
        const uri = editor.uri.toString();
        let applications = this.appliedDecorations.get(uri);
        if (!applications) {
            const that = applications = new AppliedBlameDecorations();
            this.appliedDecorations.set(uri, applications);
            applications.toDispose.push(this.registerHoverProvider(uri));
            applications.toDispose.push(Disposable.create(() => {
                this.appliedDecorations.delete(uri);
            }));
            applications.toDispose.push(Disposable.create(() => {
                editor.deltaDecorations({ uri, oldDecorations: that.previousDecorations, newDecorations: [] });
            }));
        }
        if (applications.highlightedSha) {
            const sha = this.getShaForLine(blame, highlightLine);
            if (applications.highlightedSha === sha) {
                return applications;
            }
            applications.highlightedSha = sha;
        }
        const blameDecorations = this.toDecorations(blame, highlightLine);
        applications.previousStyles.dispose();
        applications.previousStyles.pushAll(blameDecorations.styles);
        const newDecorations = blameDecorations.editorDecorations;
        const oldDecorations = applications.previousDecorations;
        const appliedDecorations = editor.deltaDecorations({ uri, oldDecorations, newDecorations });
        applications.previousDecorations.length = 0;
        applications.previousDecorations.push(...appliedDecorations);
        applications.blame = blame;
        return applications;
    }

    protected getShaForLine(blame: GitFileBlame, line: number): string | undefined {
        const commitLines = blame.lines;
        const commitLine = commitLines.find(c => c.line === line);
        return commitLine ? commitLine.sha : undefined;
    }

    protected toDecorations(blame: GitFileBlame, highlightLine: number): BlameDecorations {
        const beforeContentStyles = new Map<string, EditorDecorationStyle>();
        const commits = blame.commits;
        for (const commit of commits) {
            const sha = commit.sha;
            const commitTime = moment(commit.author.timestamp);
            const heat = this.getHeatColor(commitTime);
            const content = this.formatContentLine(commit, commitTime);
            const short = sha.substr(0, 7);
            const selector = 'git-' + short + '::before';
            beforeContentStyles.set(sha, new EditorDecorationStyle(selector, style => {
                EditorDecorationStyle.copyStyle(BlameDecorator.defaultGutterStyles, style);
                style.content = `'${content}'`;
                style.borderColor = heat;
            }));
        }
        const commitLines = blame.lines;
        const highlightedSha = this.getShaForLine(blame, highlightLine) || '';
        let previousLineSha = '';
        const editorDecorations: EditorDecoration[] = [];

        for (const commitLine of commitLines) {
            const { line, sha } = commitLine;
            const beforeContentClassName = beforeContentStyles.get(sha)!.className;
            const options = <EditorDecorationOptions>{
                beforeContentClassName,
            };
            if (sha === highlightedSha) {
                options.beforeContentClassName += ' ' + BlameDecorator.highlightStyle.className;
            }
            if (sha === previousLineSha) {
                options.beforeContentClassName += ' ' + BlameDecorator.continuationStyle.className;
            }
            previousLineSha = sha;
            const range = Range.create(Position.create(line, 0), Position.create(line, 0));
            editorDecorations.push(<EditorDecoration>{ range, options });
        }
        const styles = [...beforeContentStyles.values()];
        return { editorDecorations, styles };
    }

    protected formatContentLine(commit: Commit, commitTime: moment.Moment): string {
        const when = commitTime.fromNow();
        const contentWidth = BlameDecorator.maxWidth - when.length - 2;
        let content = commit.summary.substring(0, contentWidth + 1);
        content.replace('\n', '↩︎');
        if (content.length > contentWidth) {
            let cropAt = content.lastIndexOf(' ', contentWidth - 4);
            if (cropAt < contentWidth / 2) {
                cropAt = contentWidth - 3;
            }
            content = content.substring(0, cropAt) + '...';
        }
        if (content.length < contentWidth) {
            content = content + '\u2007'.repeat(contentWidth - content.length); // fill up with blanks
        }
        return `${content} ${when}`;
    }

    protected now = moment();
    protected getHeatColor(commitTime: moment.Moment): string {
        const daysFromNow = this.now.diff(commitTime, 'days');
        if (daysFromNow <= 2) {
            return `var(--md-orange-50)`;
        }
        if (daysFromNow <= 5) {
            return `var(--md-orange-100)`;
        }
        if (daysFromNow <= 10) {
            return `var(--md-orange-200)`;
        }
        if (daysFromNow <= 15) {
            return `var(--md-orange-300)`;
        }
        if (daysFromNow <= 60) {
            return `var(--md-orange-400)`;
        }
        if (daysFromNow <= 180) {
            return `var(--md-deep-orange-600)`;
        }
        if (daysFromNow <= 365) {
            return `var(--md-deep-orange-700)`;
        }
        if (daysFromNow <= 720) {
            return `var(--md-deep-orange-800)`;
        }
        return `var(--md-deep-orange-900)`;
    }

}

export namespace BlameDecorator {

    export const maxWidth = 50; // character

    export const defaultGutterStyles = <CSSStyleDeclaration>{
        width: `${maxWidth}ch`,
        color: 'var(--theia-ui-font-color0)',
        backgroundColor: 'var(--theia-ui-font-color5)',
        height: '100%',
        margin: '0 26px -1px 0',
        display: 'inline-block',
        borderRight: `2px solid`,
    };

    export const continuationStyle = new EditorDecorationStyle('git-blame-continuation-line::before', style => {
        style.content = `'\u2007'`; // blank
    });

    export const highlightStyle = new EditorDecorationStyle('git-blame-highlight::before', style => {
        style.backgroundColor = 'var(--theia-ui-font-color4)';
    });

}

export interface BlameDecorations {
    editorDecorations: EditorDecoration[]
    styles: EditorDecorationStyle[]
}

export class AppliedBlameDecorations implements Disposable {
    readonly toDispose = new DisposableCollection();
    readonly previousStyles = new DisposableCollection();
    readonly previousDecorations: string[] = [];
    blame: GitFileBlame | undefined;
    highlightedSha: string | undefined;

    dispose(): void {
        this.previousStyles.dispose();
        this.toDispose.dispose();
        this.blame = undefined;
    }
}
