// Bildmeditation: Endpunkt (+ Verbindungstest), Stil, Negativ-Prompt, Größe.
import { Setting, setIcon } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from "../../core/image-settings";
import { statusKindKey } from "../../core/settings/endpoint-editor-model";
import { probeImageEndpoint } from "../http";
import { type SectionCtx } from "./section-ctx";

export function renderImageSection(containerEl: HTMLElement, ctx: SectionCtx): void {
  const img: ImageSettings = ctx.host.settings.image;

  // Single-Endpoint → Test-Button statt Zeilen-Editor. Bewusst KEINE Presets: ENDPOINT_PRESETS
  // sind LM Studio/Ollama, also LLM-Server — für einen Bild-Backend-Port (Draw Things :7860)
  // schlicht falsch. Bild-Presets gehören in den ComfyUI-Faden.
  const epSetting = new Setting(containerEl)
    .setName(t("set.imgEndpoint"))
    .setDesc(t("set.imgEndpointDesc"));

  const statusEl = epSetting.settingEl.createSpan({ cls: "yijing-ep-status" });

  epSetting
    .addText((txt) =>
      txt
        .setPlaceholder("http://127.0.0.1:7860")
        .setValue(img.endpoint)
        .onChange(async (v) => {
          img.endpoint = v.trim();
          await ctx.host.saveSettings();
        }),
    )
    .addButton((b) =>
      b.setButtonText(t("set.imgTest")).onClick(async () => {
        if (!img.endpoint) return;
        statusEl.removeClass("is-ok", "is-error");
        statusEl.addClass("is-checking");
        setIcon(statusEl, "loader");
        statusEl.setAttribute("aria-label", t("set.ep.status.checking"));
        const status = await probeImageEndpoint(normalizeEndpoint(img.endpoint));
        statusEl.removeClass("is-checking");
        setIcon(statusEl, status.reachable ? "circle-check" : "circle-x");
        statusEl.addClass(status.reachable ? "is-ok" : "is-error");
        statusEl.setAttribute("aria-label", t(statusKindKey(status.kind)));
      }),
    );

  new Setting(containerEl)
    .setName(t("set.imgStyle"))
    .setDesc(t("set.imgStyleDesc"))
    .addText((txt) =>
      txt
        .setPlaceholder(DEFAULT_IMAGE_SETTINGS.styleSuffix)
        .setValue(img.styleSuffix)
        .onChange(async (v) => {
          img.styleSuffix = v;
          await ctx.host.saveSettings();
        }),
    );

  new Setting(containerEl).setName(t("set.imgNegative")).addText((txt) =>
    txt
      .setPlaceholder(DEFAULT_IMAGE_SETTINGS.negativePrompt)
      .setValue(img.negativePrompt)
      .onChange(async (v) => {
        img.negativePrompt = v;
        await ctx.host.saveSettings();
      }),
  );

  new Setting(containerEl).setName(t("set.imgSize")).addDropdown((d) => {
    for (const px of [512, 768, 1024]) d.addOption(String(px), `${px} × ${px}`);
    d.setValue(String(img.size));
    d.onChange(async (v) => {
      img.size = Number(v);
      await ctx.host.saveSettings();
    });
  });
}
