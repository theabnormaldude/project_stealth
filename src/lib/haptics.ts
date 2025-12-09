/**
 * Haptics utility for providing tactile feedback
 * Uses Capacitor Haptics on iOS/Android, falls back to vibration API or noop on web
 */

// Types for haptic feedback
export type HapticStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
export type NotificationStyle = 'success' | 'warning' | 'error';

// Check if we're in a Capacitor environment
const isCapacitor = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).Capacitor;
};

// Check if vibration API is available
const hasVibration = (): boolean => {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
};

// Duration mappings for vibration fallback
const impactDurations: Record<HapticStyle, number> = {
  light: 10,
  medium: 20,
  heavy: 30,
  soft: 15,
  rigid: 25,
};

const notificationPatterns: Record<NotificationStyle, number[]> = {
  success: [10, 50, 10],
  warning: [20, 100, 20],
  error: [30, 50, 30, 50, 30],
};

/**
 * Trigger impact haptic feedback
 */
export const impact = async (style: HapticStyle = 'medium'): Promise<void> => {
  try {
    if (isCapacitor()) {
      // Try to use Capacitor Haptics if available
      // Dynamic import with error handling for when plugin is not installed
      try {
        const hapticsModule = await import('@capacitor/haptics' as string);
        const { Haptics, ImpactStyle } = hapticsModule;
        const styleMap: Record<HapticStyle, unknown> = {
          light: ImpactStyle.Light,
          medium: ImpactStyle.Medium,
          heavy: ImpactStyle.Heavy,
          soft: ImpactStyle.Light,
          rigid: ImpactStyle.Heavy,
        };
        await Haptics.impact({ style: styleMap[style] });
        return;
      } catch {
        // Plugin not installed, fall through to vibration
      }
    }
    if (hasVibration()) {
      // Fallback to vibration API
      navigator.vibrate(impactDurations[style]);
    }
  } catch {
    // Fail silently
  }
};

/**
 * Trigger notification haptic feedback
 */
export const notification = async (type: NotificationStyle = 'success'): Promise<void> => {
  try {
    if (isCapacitor()) {
      try {
        const hapticsModule = await import('@capacitor/haptics' as string);
        const { Haptics, NotificationType } = hapticsModule;
        const typeMap: Record<NotificationStyle, unknown> = {
          success: NotificationType.Success,
          warning: NotificationType.Warning,
          error: NotificationType.Error,
        };
        await Haptics.notification({ type: typeMap[type] });
        return;
      } catch {
        // Plugin not installed
      }
    }
    if (hasVibration()) {
      navigator.vibrate(notificationPatterns[type]);
    }
  } catch {
    // Fail silently
  }
};

/**
 * Trigger selection haptic feedback (very light)
 */
export const selection = async (): Promise<void> => {
  try {
    if (isCapacitor()) {
      try {
        const hapticsModule = await import('@capacitor/haptics' as string);
        const { Haptics } = hapticsModule;
        await Haptics.selectionStart();
        await Haptics.selectionEnd();
        return;
      } catch {
        // Plugin not installed
      }
    }
    if (hasVibration()) {
      navigator.vibrate(5);
    }
  } catch {
    // Fail silently
  }
};

/**
 * Trigger vibration pattern
 */
export const vibrate = async (pattern: number | number[]): Promise<void> => {
  try {
    if (isCapacitor()) {
      try {
        const hapticsModule = await import('@capacitor/haptics' as string);
        const { Haptics } = hapticsModule;
        if (typeof pattern === 'number') {
          await Haptics.vibrate({ duration: pattern });
        } else {
          // For patterns, we approximate with multiple impacts
          for (let i = 0; i < pattern.length; i += 2) {
            await Haptics.vibrate({ duration: pattern[i] });
            if (pattern[i + 1]) {
              await new Promise((r) => setTimeout(r, pattern[i + 1]));
            }
          }
        }
        return;
      } catch {
        // Plugin not installed
      }
    }
    if (hasVibration()) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Fail silently
  }
};

// Convenience exports for common orbit actions
export const orbitHaptics = {
  /** Light impact for swipe gesture start */
  swipeStart: () => impact('light'),
  
  /** Medium impact for successful swipe completion */
  swipeComplete: () => impact('medium'),
  
  /** Heavy "thud" for long-press save action */
  save: () => impact('heavy'),
  
  /** Soft tick for history navigation */
  historyNav: () => selection(),
  
  /** Success notification for saved movie */
  saved: () => notification('success'),
  
  /** Warning for edge of history */
  edgeReached: () => notification('warning'),
};

