export type NavCrew = { id: number; name: string; code: string };

/** Past this many characters a crew name stops being a nav item and starts being a paragraph. */
const LONG_NAME = 24;

/** Whether the desktop nav shows the crews as a dropdown rather than as a row of links. */
export function collapses(crews: NavCrew[]): boolean {
  return crews.length > 1 || (crews[0] !== undefined && crews[0].name.length > LONG_NAME);
}
