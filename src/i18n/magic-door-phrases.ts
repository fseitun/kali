import { t } from "@/i18n/translations";

/** Localized "N corazones" / "N hearts" for magic door copy. */
export function magicDoorHeartsPhrase(hearts: number): string {
  return hearts === 1
    ? t("squares.magicDoorHeartsOne")
    : t("squares.magicDoorHeartsMany", { hearts });
}
