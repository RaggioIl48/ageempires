export const ACTION_KEYS = ['Q', 'E', 'R', 'T', 'F', 'G', 'Z', 'X', 'C', 'V', 'B', 'N', 'J', 'Y', 'U', 'I', 'O', 'P'] as const;

export const MUTE_KEY = 'KeyM';

export function actionSlot(key: string): number {
  return ACTION_KEYS.findIndex((action) => action === key.toUpperCase());
}

export function isMuteShortcut(event: Pick<KeyboardEvent, 'code'> & Partial<Pick<KeyboardEvent, 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey'>>): boolean {
  return event.code === MUTE_KEY && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey;
}
