import { usernameKey, type Profile } from './domain.ts';
export const FRIEND_SEARCH_LIMIT = 10;
export function searchFragment(input: string) {
  const value = usernameKey(input);
  if (!/^[a-z0-9_]{3,24}$/.test(value)) throw new Error('Enter at least 3 letters, numbers or underscores to find your friend.');
  return value;
}
/** A disposable index, derived from the literal chosen username rather than events. */
export function usernameFragments(username: string) {
  const key = usernameKey(username), values = new Set<string>();
  for (let start = 0; start < key.length; start++) for (let end = start + 3; end <= key.length; end++) values.add(key.slice(start, end));
  return [...values].sort();
}
export function searchProjection(profile: Profile) {
  return { uid: profile.uid, username: profile.username, displayName: profile.displayName, profileEventId: profile.lastEventId, terms: usernameFragments(profile.username) };
}
