import { css, customElement, html, query, state } from "@padloc/app/src/elements/lit";
import { View } from "@padloc/app/src/elements/view";
import { $l } from "@padloc/locale/src/translate";
import "@padloc/app/src/elements/icon";
import { StateMixin } from "@padloc/app/src/mixins/state";
import { Routing } from "@padloc/app/src/mixins/routing";
import { ListParams, ListResponse } from "@padloc/core/src/api";
import "@padloc/app/src/elements/scroller";
import "@padloc/app/src/elements/list";
import "@padloc/app/src/elements/button";
import { Input } from "@padloc/app/src/elements/input";
import { Popover } from "@padloc/app/src/elements/popover";
import { singleton } from "@padloc/app/src/lib/singleton";
import "@padloc/app/src/elements/spinner";
import { alert } from "@padloc/app/src/lib/dialog";
import { Select } from "@padloc/app/src/elements/select";
import { StorageQuery } from "@padloc/core/src/storage";
import { ChangeLogEntryDialog } from "./change-log-entry-dialog";
import { ChangeLogEntry, RequestLogEntry } from "@padloc/core/src/logging";
import { RequestLogEntryDialog } from "./request-log-entry-dialog";

@customElement("pl-admin-logs")
export class Logs extends StateMixin(Routing(View)) {
    readonly routePattern = /^logs(?:\/(\w+))?/;

    @state()
    private _changeLogData: ListResponse<ChangeLogEntry> = new ListResponse();

    @state()
    private _requestLogData: ListResponse<RequestLogEntry> = new ListResponse();

    @state()
    private _before?: Date;

    @state()
    private _after?: Date;

    @state()
    private _page = "changes";

    @state()
    private _loading = false;

    @state()
    private _emails: string[] = [];

    @state()
    private _itemsPerPage = 50;

    @query("#beforeInput")
    private _beforeInput: Input;

    @query("#afterInput")
    private _afterInput: Input;

    @query("#emailsInput")
    private _emailsInput: Input;

    @query("#timeRangePopover")
    private _timeRangePopover: Popover;

    @query("#itemsPerPageSelect")
    private _itemsPerPageSelect: Select;

    @singleton("pl-change-log-entry-dialog")
    private _changeLogEntryDialog: ChangeLogEntryDialog;

    @singleton("pl-request-log-entry-dialog")
    private _requestLogEntryDialog: RequestLogEntryDialog;

    private get _offset() {
        return this._page === "changes" ? this._changeLogData.offset : this._requestLogData.offset;
    }

    private get _total() {
        return this._page === "changes" ? this._changeLogData.total : this._requestLogData.total;
    }

    private get _count() {
        return this._page === "changes" ? this._changeLogData.items.length : this._requestLogData.items.length;
    }

    handleRoute([page]: [string]) {
        console.log(page);

        if (!["changes", "requests"].includes(page)) {
            this.go("logs/changes");
            return;
        }

        this._page = page;
        this._load();
    }

    private async _load(offset = 0) {
        const before = this._before;
        const after = this._after;
        const queries: StorageQuery[] = [];
        if (after) {
            queries.push({ path: "time", op: "gt", value: after.toISOString() });
        }
        if (before) {
            queries.push({ path: "time", op: "lt", value: before.toISOString() });
        }
        if (this._emails.length) {
            queries.push({
                op: "or",
                queries: this._emails.map((email) => ({ path: "context.account.email", value: email })),
            });
        }
        this._loading = true;
        try {
            if (this._page === "changes") {
                this._changeLogData = await this.app.api.listChangeLogEntries(
                    new ListParams({
                        offset,
                        limit: this._itemsPerPage,
                        query: queries.length ? { op: "and", queries } : undefined,
                        orderBy: "time",
                        orderByDirection: "desc",
                    })
                );
            } else {
                this._requestLogData = await this.app.api.listRequestLogEntries(
                    new ListParams({
                        offset,
                        limit: this._itemsPerPage,
                        query: queries.length ? { op: "and", queries } : undefined,
                        orderBy: "time",
                        orderByDirection: "desc",
                    })
                );
            }
        } catch (e) {
            alert(e.message, { type: "warning" });
        }

        this._loading = false;
    }

    private _loadNext() {
        return this._load(this._offset + this._count);
    }

    private _loadPrevious() {
        return this._load(Math.max(this._offset - this._itemsPerPage, 0));
    }

    private _applyTimeRange() {
        this._before = this._beforeInput.value ? new Date(this._beforeInput.value) : undefined;
        this._after = this._afterInput.value ? new Date(this._afterInput.value) : undefined;
        this._load(0);
        this._timeRangePopover.hide();
    }

    private _formatDateTime(date: Date) {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "short",
            timeStyle: "medium",
        } as any).format(date);
    }

    private _emailsInputHandler() {
        const emails = this._emailsInput.value.split(/[,;\s]+/);
        this._emails = [...new Set([...this._emails, ...emails.slice(0, -1).filter((e) => !!e)])];
        this._emailsInput.value = emails[emails.length - 1];
        this.requestUpdate();
    }

    private _emailsEnter() {
        const emails = this._emailsInput.value.split(/[,;\s]+/);
        this._emails = [...new Set([...this._emails, ...emails.filter((e) => !!e)])];
        this._emailsInput.value = "";
        this.requestUpdate();
        this._load(0);
    }

    private _emailsKeydown(e: KeyboardEvent) {
        if (e.key === "Backspace" && !this._emailsInput.value) {
            this._emails.pop();
            this.requestUpdate();
            this._load(0);
        }
    }

    private _isEmailValid(email: string) {
        return /\S+@\S+\.\S+/.test(email);
    }

    private _removeEmail(email: string) {
        this._emails = this._emails.filter((e) => e !== email);
        this.requestUpdate();
        this._load(0);
    }

    private _itemsPerPageSelected() {
        this._itemsPerPage = this._itemsPerPageSelect.value;
        this._load(0);
    }

    static styles = [
        ...View.styles,
        css`
            table {
                border-collapse: collapse;
                width: 100%;
            }

            thead th {
                font-weight: 600;
                position: sticky;
                top: 0;
                background: var(--color-background);
                text-align: left;
            }

            th > div {
                padding: 0.5em;
                border-bottom: solid 1px var(--border-color);
            }

            td {
                padding: 0.5em;
                text-align: left;
                border: solid 1px var(--border-color);
            }

            tbody tr:hover {
                cursor: pointer;
                color: var(--color-highlight);
            }

            tr:first-child td {
                border-top: none;
            }

            tr:last-child td {
                border-bottom: none;
            }

            tr :last-child {
                border-right: none;
            }

            tr :first-child {
                border-left: none;
            }

            #emailsInput {
                flex-wrap: wrap;
                padding: 0.25em;
                --input-padding: 0.3em 0.5em;
                border: none;
            }

            #emailsInput .tag pl-button {
                margin: -0.2em -0.3em -0.2em 0.3em;
            }
        `,
    ];

    render() {
        return html`
            <div class="fullbleed vertical layout">
                <header class="padded center-aligning spacing horizontal layout border-bottom">
                    <pl-icon icon="list"></pl-icon>
                    <div class="ellipsis">${$l("Logs")}</div>

                    <div class="stretch"></div>

                    <pl-button
                        class="small skinny transparent"
                        .toggled=${this._page === "changes"}
                        @click=${() => this.go("logs/changes")}
                    >
                        ${$l("Audit Logs")}
                    </pl-button>

                    <pl-button
                        class="small skinny transparent"
                        .toggled=${this._page === "requests"}
                        @click=${() => this.go("logs/requests")}
                    >
                        ${$l("API Requests")}
                    </pl-button>

                    <div class="stretch"></div>

                    <pl-button class="skinny transparent">
                        <div class="horizontal spacing center-aligning layout">
                            <pl-icon icon="time"></pl-icon>
                            ${this._after
                                ? html`<div class="small">${this._formatDateTime(this._after)}</div>
                                      ${this._before ? html`<div>-</div>` : ""} `
                                : ""}
                            ${this._before ? html`<div class="small">${this._formatDateTime(this._before)}</div>` : ""}
                        </div>
                    </pl-button>

                    <pl-popover id="timeRangePopover">
                        <div class="padded spacing vertical layout">
                            <div class="text-centering small subtle top-margined">${$l("Display events between")}</div>
                            <pl-input class="small slim" type="datetime-local" id="afterInput"></pl-input>
                            <div class="text-centering small subtle">${$l("and")}</div>
                            <pl-input class="small slim" type="datetime-local" id="beforeInput"></pl-input>
                            <pl-button class="small primary" @click=${this._applyTimeRange}>${$l("Apply")}</pl-button>
                        </div>
                    </pl-popover>

                    <pl-button class="skinny transparent" @click=${() => this._load(this._offset)}>
                        <pl-icon icon="refresh"></pl-icon>
                    </pl-button>
                </header>

                <div class="border-bottom">
                    <pl-input
                        id="emailsInput"
                        class="small"
                        .placeholder=${$l("Filter By Email Address...")}
                        type="email"
                        @enter=${this._emailsEnter}
                        @input=${this._emailsInputHandler}
                        @blur=${this._emailsEnter}
                        @keydown=${this._emailsKeydown}
                    >
                        <div class="horizontal wrapping spacing layout" slot="before">
                            ${this._emails.map(
                                (email) => html`
                                    <div
                                        class="small center-aligning horizontal layout tag ${this._isEmailValid(email)
                                            ? ""
                                            : "warning"}"
                                    >
                                        ${!this._isEmailValid(email) ? html`<pl-icon icon="warning"></pl-icon>` : ""}
                                        <div>${email}</div>
                                        <pl-button
                                            class="small skinny transparent"
                                            @click=${() => this._removeEmail(email)}
                                        >
                                            <pl-icon icon="cancel"></pl-icon>
                                        </pl-button>
                                    </div>
                                `
                            )}
                        </div>
                    </pl-input>
                </div>
                <div class="stretch scrolling">
                    ${this._page === "changes"
                        ? html`
                              <table class="small table-with-truncated-cells">
                                  <thead>
                                      <tr>
                                          <th class="percent-column-20"><div>${$l("Time")}</div></th>
                                          <th class="percent-column-10"><div>${$l("Class")}</div></th>
                                          <th class="percent-column-10"><div>${$l("Action")}</div></th>
                                          <th><div>${$l("User")}</div></th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${this._changeLogData.items.map(
                                          (item) => html`
                                              <tr @click=${() => this._changeLogEntryDialog.show(item)}>
                                                  <td>${this._formatDateTime(new Date(item.time))}</td>
                                                  <td>${item.objectKind}</td>
                                                  <td>${item.action}</td>
                                                  <td class="truncate">
                                                      ${item.context?.account
                                                          ? item.context?.account.name
                                                              ? `${item.context.account.name} <${item.context.account.email}>`
                                                              : item.context.account.email
                                                          : ""}
                                                  </td>
                                              </tr>
                                          `
                                      )}
                                  </tbody>
                              </table>
                          `
                        : html`
                              <table class="small table-with-truncated-cells">
                                  <thead>
                                      <tr>
                                          <th class="percent-column-20"><div>${$l("Time")}</div></th>
                                          <th class="percent-column-20"><div>${$l("Endpoint")}</div></th>
                                          <th><div>${$l("User")}</div></th>
                                          <th class="percent-column-20"><div>${$l("Response Time")}</div></th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${this._requestLogData.items.map(
                                          (entry) => html`
                                              <tr @click=${() => this._requestLogEntryDialog.show(entry)}>
                                                  <td>${this._formatDateTime(new Date(entry.time))}</td>
                                                  <td>${entry.request.method}</td>
                                                  <td class="truncate">
                                                      ${entry.context?.account
                                                          ? entry.context?.account.name
                                                              ? `${entry.context.account.name} <${entry.context.account.email}>`
                                                              : entry.context.account.email
                                                          : ""}
                                                  </td>
                                                  <td>${entry.responseTime} ms</td>
                                              </tr>
                                          `
                                      )}
                                  </tbody>
                              </table>
                          `}
                </div>
                <div class="padded horizontal layout border-top">
                    <pl-select
                        id="itemsPerPageSelect"
                        class="small slim"
                        .options=${[
                            { value: 50, label: "50 items per page" },
                            { value: 100, label: "100 items per page" },
                            { value: 500, label: "500 items per page" },
                            { value: 1000, label: "1000 items per page" },
                        ]}
                        .value=${this._itemsPerPage as any}
                        @change=${this._itemsPerPageSelected}
                    ></pl-select>
                    <div class="stretch"></div>
                    <pl-button
                        class="slim transparent"
                        @click=${() => this._loadPrevious()}
                        ?disabled=${this._offset === 0}
                    >
                        <pl-icon icon="backward"></pl-icon>
                    </pl-button>
                    <div class="padded">
                        ${this._offset} - ${this._offset + this._count} / ${this._changeLogData.total}
                    </div>
                    <pl-button
                        class="slim transparent"
                        @click=${() => this._loadNext()}
                        ?disabled=${this._offset + this._count >= this._total}
                    >
                        <pl-icon icon="forward"></pl-icon>
                    </pl-button>
                </div>
            </div>

            <div class="fullbleed centering layout scrim" ?hidden=${!this._loading}>
                <pl-spinner .active=${this._loading}></pl-spinner>
            </div>
        `;
    }
}
