/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { h } from "@phosphor/virtualdom";
import { GIT_DIFF } from "./git-diff-contribution";
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { GitDiffService } from './git-diff-service';
import { GitDiffViewOptions } from './git-diff-model';
import { VirtualRenderer, open, VirtualWidget, OpenerService, StatefulWidget } from "@theia/core/lib/browser";
import { GitRepositoryProvider } from '../git-repository-provider';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GitFileChange, GitFileStatus, GitUtils } from '../../common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';

@injectable()
export class GitDiffWidget extends VirtualWidget implements StatefulWidget {

    protected dom: h.Child;
    protected fileChanges: GitFileChange[];
    protected options: GitDiffViewOptions;

    constructor(
        @inject(GitDiffService) protected readonly gitDiffService: GitDiffService,
        @inject(GitRepositoryProvider) protected repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected labelProvider: LabelProvider,
        @inject(OpenerService) protected openerService: OpenerService) {
        super();
        this.id = GIT_DIFF;
        this.title.label = "Files changed";

        this.addClass('theia-git');
    }

    async initialize(options: GitDiffViewOptions) {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            this.fileChanges = await this.gitDiffService.getDiff(repository, options);
            this.options = options;
            await this.updateView();
        }
    }

    storeState(): object {
        return this.options;
    }

    restoreState(oldState: object): void {
        this.initialize(oldState);
    }

    protected async updateView() {
        const commitishBar = await this.renderDiffListHeader();
        if (this.options && this.options.fromRevision && this.options.toRevision) {
            const fromRevision = this.options.fromRevision.toString();
            const toRevision = this.options.toRevision;
            const fileChangeList = await this.renderFileChangeList(this.fileChanges, toRevision, fromRevision);
            this.dom = h.div({ className: "git-diff-container" }, VirtualRenderer.flatten([commitishBar, fileChangeList]));
            this.update();
        }
    }

    protected render(): h.Child {
        return this.dom;
    }

    protected async renderDiffListHeader(): Promise<h.Child> {
        if (this.options) {
            let fileDiv: h.Child = '';
            const header = this.options.title ? h.div({ className: 'git-diff-header' }, this.options.title) : '';
            if (this.options.fileUri) {
                const uri: URI = new URI(this.options.fileUri);
                const repository = this.repositoryProvider.selectedRepository;
                const [icon, label, path] = await Promise.all([
                    this.labelProvider.getIcon(uri),
                    this.labelProvider.getName(uri),
                    repository ? GitUtils.getRepositoryRelativePath(repository, uri) : this.labelProvider.getLongName(uri)
                ]);
                const iconSpan = h.span({ className: icon + ' file-icon' });
                const nameSpan = h.span({ className: 'name' }, label + ' ');
                const pathSpan = h.span({ className: 'path' }, path);
                const compareDiv = h.div({ className: 'theia-header' }, 'Compare...');
                fileDiv = h.div({ className: "gitItem diff-file" }, h.div({ className: "noWrapInfo" }, iconSpan, nameSpan, pathSpan));
                const inSpan = h.span({ className: 'row-title' }, 'in:');
                const withSpan = h.span({ className: 'row-title' }, 'with:');
                const toDiv = this.options.toRevision ? h.div({ className: "revision noWrapInfo" }, inSpan, this.options.toRevision) : '';
                const fromDiv = this.options.fromRevision ? h.div({ className: "revision noWrapInfo" }, withSpan, this.options.fromRevision.toString()) : '';
                return h.div({ className: "commitishBar" }, header, compareDiv, fileDiv, toDiv, fromDiv);
            }
            return h.div({ className: "commitishBar" }, header);
        }
        return '';
    }

    protected async renderFileChangeList(fileChanges: GitFileChange[], commitSha: string, toCommitSha?: string): Promise<h.Child> {
        const files: h.Child[] = [];

        for (const fileChange of fileChanges) {
            const fileChangeElement: h.Child = await this.renderGitItem(fileChange, commitSha, toCommitSha);
            files.push(fileChangeElement);
        }
        const header = h.div({ className: 'theia-header' }, 'Files changed');
        const list = h.div({ className: "commitFileList" }, ...files);
        return h.div({ className: "commitFileListContainer" }, header, list);
    }

    protected async renderGitItem(change: GitFileChange, commitSha: string, fromCommitSha?: string): Promise<h.Child> {
        const repository = this.repositoryProvider.selectedRepository;
        const uri: URI = new URI(change.uri);
        const [icon, label, path] = await Promise.all([
            this.labelProvider.getIcon(uri),
            this.labelProvider.getName(uri),
            repository ? GitUtils.getRepositoryRelativePath(repository, uri) : this.labelProvider.getLongName(uri)
        ]);
        const iconSpan = h.span({ className: icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, label + ' ');
        const pathSpan = h.span({ className: 'path' }, path);
        const nameAndPathDiv = h.div({
            className: 'noWrapInfo',
            ondblclick: () => {
                let diffuri: URI | undefined;
                if (change.status !== GitFileStatus.New) {
                    let fromURI: URI;
                    if (fromCommitSha) {
                        fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(fromCommitSha);
                    } else {
                        fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha + "~1");
                    }
                    const toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha);
                    diffuri = DiffUris.encode(fromURI, toURI, uri.displayName);
                }
                if (diffuri) {
                    open(this.openerService, diffuri);
                }
            }
        }, iconSpan, nameSpan, pathSpan);
        const statusDiv = h.div({ className: 'status ' + GitFileStatus[change.status].toLowerCase() }, this.getStatusChar(change.status, change.staged || false));
        return h.div({ className: 'gitItem noselect' }, nameAndPathDiv, statusDiv);
    }

    protected getStatusChar(status: GitFileStatus, staged: boolean): string {
        switch (status) {
            case GitFileStatus.New:
            case GitFileStatus.Renamed:
            case GitFileStatus.Copied: return staged ? 'A' : 'U';
            case GitFileStatus.Modified: return 'M';
            case GitFileStatus.Deleted: return 'D';
            case GitFileStatus.Conflicted: return 'C';
        }
        return '';
    }

}
