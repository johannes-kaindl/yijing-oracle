// Endpunkt-Zeilen-Editor (UI-STANDARD §8, Kanon-Regel). Dünne Render-Schicht — die Logik
// liegt pure in core/settings/endpoint-editor-model.ts. Schnitt von vault-crews übernommen.
import { Setting, setIcon } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import {
  ENDPOINT_PRESETS,
  validateEndpointInput,
  type EndpointStatus,
  type EndpointStatusKind,
} from "../../vendor/kit/endpoint_diagnostics";
import {
  activeIndexFromStatuses,
  applyEndpointEdit,
  statusKindKey,
  warnRuleKey,
} from "../../core/settings/endpoint-editor-model";

export interface EndpointListOpts {
  list: string[];
  name: string;
  desc: string;
  setList(next: string[]): void;
  probe(endpoint: string): Promise<EndpointStatus>;
  /** Nach einer Listen-Änderung: speichern + Tab neu aufbauen. */
  commit(): void;
}

/** Zeilen-Editor: eine Setting-Zeile je Endpunkt, letzte Leerzeile ist der Adder. */
export function buildEndpointList(containerEl: HTMLElement, opts: EndpointListOpts): void {
  const statuses: (EndpointStatusKind | null)[] = opts.list.map(() => null);
  const statusEls: HTMLElement[] = [];
  const rows = [...opts.list, ""]; // letzte Leerzeile = Adder

  const commit = (next: string[]): void => {
    opts.setList(next);
    opts.commit();
  };

  rows.forEach((value, i) => {
    const isAdder = i >= opts.list.length;
    const setting = new Setting(containerEl);
    if (i === 0) setting.setName(opts.name).setDesc(opts.desc);

    if (!isAdder) {
      // Status-Indikator: Form UND Farbe UND Klasse UND aria-label (WCAG 1.4.1).
      const statusEl = setting.settingEl.createSpan({ cls: "yijing-ep-status is-checking" });
      setIcon(statusEl, "loader");
      statusEl.setAttribute("aria-label", t("set.ep.status.checking"));
      statusEls.push(statusEl);
    }

    setting.addText((c) => {
      c.setValue(value);
      if (isAdder) c.setPlaceholder(t("set.epAdd"));
      // Mutation NUR bei blur, nicht in onChange: onChange feuert pro Tastendruck und würde
      // im Adder jeden Zwischenstand (h, ht, htt, …) anhängen.
      c.inputEl.addEventListener("blur", () => {
        const next = applyEndpointEdit(opts.list, i, c.getValue(), isAdder);
        if (next.length === opts.list.length && next.every((e, k) => e === opts.list[k])) return;
        commit(next);
      });
    });

    if (!isAdder) {
      const warnings = validateEndpointInput(value);
      if (warnings.length > 0) {
        const warnEl = setting.settingEl.createSpan({ cls: "yijing-ep-warn" });
        setIcon(warnEl, "alert-triangle");
        warnEl.setAttribute("aria-label", warnings.map((w) => t(warnRuleKey(w.rule))).join(" · "));
      }
      // Das Status-Icon ist KEIN Lösch-Button — Löschen läuft über diesen Trash.
      setting.addExtraButton((b) =>
        b
          .setIcon("trash-2")
          .setTooltip(t("set.epRemove"))
          .onClick(() => commit(applyEndpointEdit(opts.list, i, "", false))),
      );
    }
  });

  const actions = new Setting(containerEl);
  for (const preset of ENDPOINT_PRESETS) {
    actions.addButton((b) =>
      b.setButtonText(t("set.epPresetAdd", preset.label)).onClick(() => {
        if (!opts.list.includes(preset.url)) commit([...opts.list, preset.url]);
      }),
    );
  }
  actions.addButton((b) => b.setButtonText(t("set.epProbe")).onClick(() => opts.commit()));

  // Probe je Zeile; der erste erreichbare wird als aktiv markiert.
  opts.list.forEach((ep, i) => {
    void opts.probe(ep).then((status) => {
      statuses[i] = status.kind;
      const el = statusEls[i];
      if (el) {
        el.removeClass("is-checking", "is-ok", "is-error");
        setIcon(el, status.reachable ? "circle-check" : "circle-x");
        el.addClass(status.reachable ? "is-ok" : "is-error");
        el.setAttribute("aria-label", t(statusKindKey(status.kind)));
      }
      const active = activeIndexFromStatuses(statuses);
      statusEls.forEach((se, j) => se.toggleClass("is-active", j === active));
    });
  });
}
