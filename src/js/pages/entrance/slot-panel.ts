import { getAiProviderAccounts } from "@shared/settings.js";
import type { AppSettings, Account } from "@shared/settings.js";
import { notifyUser } from "../../ui/user-notification.js";
import { t as entranceT } from "./i18n.js";

interface SettingsManager {
  getSnapshot(): AppSettings;
  save(settings: Record<string, unknown>): Promise<boolean>;
}

interface SlotAccountChangedDetail {
  slot?: string;
}

function hasSlotAccountChangedDetail(value: unknown): value is SlotAccountChangedDetail {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  return true;
}

export class SlotPanel {
  slotId: string;
  settingsManager: SettingsManager;

  constructor(slotId: string, settingsManager: SettingsManager) {
    this.slotId = slotId;
    this.settingsManager = settingsManager;
  }

  init(): void {
    this.setupListeners();
    this.render();
  }

  setupListeners(): void {
    window.addEventListener("slot-account-changed", (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (hasSlotAccountChangedDetail(detail) && detail.slot !== this.slotId) {
        this.render();
      }
    });

    window.addEventListener("account-list-updated", () => {
      this.render();
    });

    const accSelect = document.getElementById(
      `${this.slotId}-account-select`
    ) as HTMLSelectElement | null;
    accSelect?.addEventListener("change", (e) => {
      void this.updateSetting("accountId", (e.target as HTMLSelectElement).value);
    });

    const msgSelect = document.getElementById(
      `${this.slotId}-msg-method`
    ) as HTMLSelectElement | null;
    msgSelect?.addEventListener("change", (e) => {
      void this.updateSetting("messageMethod", (e.target as HTMLSelectElement).value);
    });

    const fileSelect = document.getElementById(
      `${this.slotId}-file-method`
    ) as HTMLSelectElement | null;
    fileSelect?.addEventListener("change", (e) => {
      void this.updateSetting("fileMethod", (e.target as HTMLSelectElement).value);
    });

    const catchCheck = document.getElementById(
      `${this.slotId}-catch-check`
    ) as HTMLInputElement | null;
    catchCheck?.addEventListener("change", (e) => {
      void this.updateSetting("catchCommands", (e.target as HTMLInputElement).checked);
    });

    const resumeCheck = document.getElementById(
      `${this.slotId}-resume-last-session-check`
    ) as HTMLInputElement | null;
    resumeCheck?.addEventListener("change", (e) => {
      void this.updateSetting("resumeLastSession", (e.target as HTMLInputElement).checked);
    });

    const rememberConnectionCheck = document.getElementById(
      `${this.slotId}-remember-connection-check`
    ) as HTMLInputElement | null;
    rememberConnectionCheck?.addEventListener("change", (e) => {
      void this.updateSetting("rememberConnectionStatus", (e.target as HTMLInputElement).checked);
    });
  }

  render(): void {
    const settings = this.settingsManager.getSnapshot();
    const slotSettings = settings.slots[this.slotId as "ai1" | "ai2"];
    const accounts = getAiProviderAccounts(settings.accounts);

    const otherSlot = this.slotId === "ai1" ? "ai2" : "ai1";
    const otherAccountId = settings.slots[otherSlot].accountId;

    const availableAccounts = accounts.filter((a: { id: string }) => {
      if (a.id === slotSettings.accountId) return true;
      if (a.id === otherAccountId) return false;
      return true;
    });

    const accSelect = document.getElementById(
      `${this.slotId}-account-select`
    ) as HTMLSelectElement | null;
    if (accSelect) {
      const currentVal = slotSettings.accountId ?? "";
      accSelect.innerHTML =
        `<option value="">${entranceT("slot.selectAccountPlaceholder")}</option>` +
        availableAccounts
          .map(
            (a: Account) =>
              `<option value="${a.id}">${a.nickname ?? a.email} (${a.provider})</option>`
          )
          .join("");
      accSelect.value = currentVal;
    }

    const msgSelect = document.getElementById(
      `${this.slotId}-msg-method`
    ) as HTMLSelectElement | null;
    if (msgSelect) msgSelect.value = slotSettings.messageMethod ?? "injection";

    const fileSelect = document.getElementById(
      `${this.slotId}-file-method`
    ) as HTMLSelectElement | null;
    if (fileSelect) fileSelect.value = slotSettings.fileMethod ?? "dragdrop";

    const catchCheck = document.getElementById(
      `${this.slotId}-catch-check`
    ) as HTMLInputElement | null;
    if (catchCheck) catchCheck.checked = slotSettings.catchCommands ?? true;

    const resumeCheck = document.getElementById(
      `${this.slotId}-resume-last-session-check`
    ) as HTMLInputElement | null;
    if (resumeCheck) resumeCheck.checked = slotSettings.resumeLastSession ?? true;

    const rememberConnectionCheck = document.getElementById(
      `${this.slotId}-remember-connection-check`
    ) as HTMLInputElement | null;
    if (rememberConnectionCheck)
      rememberConnectionCheck.checked = slotSettings.rememberConnectionStatus ?? false;
  }

  private getSlotLabel(): string {
    return this.slotId.toUpperCase();
  }

  private describeAccount(
    accountId: string,
    accounts: Account[] = getAiProviderAccounts(this.settingsManager.getSnapshot().accounts)
  ): string | null {
    const account = accounts.find((entry) => entry.id === accountId);
    if (account == null) {
      return null;
    }

    return `${account.nickname ?? account.email} (${account.provider})`;
  }

  async updateSetting(key: string, value: unknown): Promise<void> {
    const settings = this.settingsManager.getSnapshot();
    const slots = settings.slots;
    const previousAccountId =
      key === "accountId" && typeof slots[this.slotId as "ai1" | "ai2"].accountId === "string"
        ? (slots[this.slotId as "ai1" | "ai2"].accountId?.trim() ?? "")
        : "";

    const updated = {
      ...settings,
      slots: {
        ...slots,
        [this.slotId]: {
          ...slots[this.slotId as "ai1" | "ai2"],
          [key]: value,
        },
      },
    };

    await this.settingsManager.save(updated);

    if (key === "accountId") {
      const nextAccountId = typeof value === "string" ? value.trim() : "";
      if (nextAccountId !== previousAccountId) {
        const title =
          nextAccountId === ""
            ? entranceT("slot.toasts.accountCleared", {
                slot: this.getSlotLabel(),
              })
            : entranceT("slot.toasts.accountAssigned", {
                slot: this.getSlotLabel(),
                account: this.describeAccount(nextAccountId, updated.accounts) ?? nextAccountId,
              });

        notifyUser({
          kind: nextAccountId === "" ? "info" : "success",
          title,
          dedupeKey: `slot:${this.slotId}:account`,
        });
      }

      window.dispatchEvent(
        new CustomEvent("slot-account-changed", {
          detail: { slot: this.slotId, accountId: value },
        })
      );
    }

    this.render();
  }
}
