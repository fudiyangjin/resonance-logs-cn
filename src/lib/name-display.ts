/**
 * Utility function for transforming player name display in the DPS meter
 * based on user preferences for showing/hiding names and classes.
 */
import { toClassLabel, toSpecLabel } from "$lib/class-labels";

/**
 * Player object containing basic player information
 */
export interface Player {
  /** Unique identifier for the player */
  uid: number;
  /** Player's name */
  name: string;
  /** Player's class name */
  className: string;
  /** Player's specialization name (optional) */
  classSpecName?: string;
}

/**
 * Settings for name display preferences
 */
export type NameDisplaySetting =
  | "Show Your Name"
  | "Show Your Class"
  | "Show Your Name - Class"
  | "Show Your Name - Spec"
  | "Hide Your Name"
  | "Show Others' Name"
  | "Show Others' Class"
  | "Show Others' Name - Class"
  | "Show Others' Name - Spec"
  | "Hide Others' Name";

const CN_TO_EN_SETTING: Record<string, NameDisplaySetting> = {
  "显示你的名称": "Show Your Name",
  "显示你的职业": "Show Your Class",
  "显示你的名称 - 职业": "Show Your Name - Class",
  "显示你的名称 - 专精": "Show Your Name - Spec",
  "隐藏你的名称": "Hide Your Name",
  "显示他人名称": "Show Others' Name",
  "显示他人职业": "Show Others' Class",
  "显示他人名称 - 职业": "Show Others' Name - Class",
  "显示他人名称 - 专精": "Show Others' Name - Spec",
  "隐藏他人名称": "Hide Others' Name",
};

export function normalizeNameDisplaySetting(
  setting: string,
): NameDisplaySetting | string {
  return CN_TO_EN_SETTING[setting] ?? setting;
}

export function shouldUseSpecIconForNameDisplay(settingRaw: string): boolean {
  const setting = normalizeNameDisplaySetting(settingRaw);
  return setting === "Show Your Name - Spec" || setting === "Show Others' Name - Spec";
}

export interface DisplayIconSpecNameParams {
  classSpecName?: string;
  showYourNameSetting: string;
  showOthersNameSetting: string;
  isLocalPlayer: boolean;
}

export function getDisplayIconSpecName({
  classSpecName = "",
  showYourNameSetting,
  showOthersNameSetting,
  isLocalPlayer,
}: DisplayIconSpecNameParams): string {
  const setting = isLocalPlayer ? showYourNameSetting : showOthersNameSetting;
  return shouldUseSpecIconForNameDisplay(setting) ? classSpecName : "";
}

/**
 * Parameters for the name display transformation function
 */
export interface NameDisplayParams {
  /** Player object with name, className, and uid properties */
  player: Player;
  /** Setting for how to display the local player's name */
  showYourNameSetting: string;
  /** Setting for how to display other players' names */
  showOthersNameSetting: string;
  /** Boolean indicating if this is the current user */
  isLocalPlayer: boolean;
}

/**
 * Transforms player name display based on user preferences
 *
 * @param params - Object containing player information and display settings
 * @returns The appropriate display name based on the settings
 *
 * @example
 * ```typescript
 * const displayName = getDisplayName({
 *   player: { uid: 123, name: "PlayerName", className: "Frost Mage" },
 *   showYourNameSetting: "Show Your Class",
 *   showOthersNameSetting: "Show Others' Name",
 *   isLocalPlayer: true
 * });
 * // Returns "Frost Mage"
 * ```
 */
export default function getDisplayName(params: NameDisplayParams): string {
  const { player, showYourNameSetting, showOthersNameSetting, isLocalPlayer } = params;

  // Determine which setting to use based on whether this is the local player
  const settingRaw = isLocalPlayer ? showYourNameSetting : showOthersNameSetting;
  const setting = normalizeNameDisplaySetting(settingRaw);

  // Get the base name to use
  const baseName = player.name || player.uid.toString();

  // Apply the appropriate setting
  switch (setting) {
    case "Show Your Name":
    case "Show Others' Name":
      return baseName;

    case "Show Your Class":
    case "Show Others' Class":
      return player.className ? toClassLabel(player.className) : baseName;

    case "Show Your Name - Class":
    case "Show Others' Name - Class":
      if (player.className) {
        return `${baseName} - ${toClassLabel(player.className)}`;
      }
      return baseName;

    case "Show Your Name - Spec":
    case "Show Others' Name - Spec":
      if (player.classSpecName) {
        return `${baseName} - ${toSpecLabel(player.classSpecName)}`;
      }
      // Fallback to class if spec is not available
      if (player.className) {
        return `${baseName} - ${toClassLabel(player.className)}`;
      }
      return baseName;

    case "Hide Your Name":
    case "Hide Others' Name":
      return player.name ? "" : player.uid.toString();

    default:
      // Fallback to name if setting is unrecognized
      return baseName;
  }
}
