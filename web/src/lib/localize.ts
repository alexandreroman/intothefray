// Card data in the viewer's language: each field of a face or an index entry
// falls back to English when the language has no override for it.

import type { Lang } from './lang';
import type { PackFace, PackLocalized } from './types';

// The localized copy of each face, made once per language. CardFace counts its image failures per
// images array, so a face must keep the same array from one render to the next: a new one each
// time would start its fallback over.
const localizedFaces = new WeakMap<PackFace, Map<Lang, PackFace>>();

/**
 * The face as the language shows it: its overridden name and subname, and its localized images
 * tried before the English ones. English, or a face with no override, is the face itself.
 */
export function localizedFace(face: PackFace, lang: Lang): PackFace {
  const override = face.localized?.[lang];
  if (lang === 'en' || override === undefined) {
    return face;
  }
  let byLang = localizedFaces.get(face);
  if (byLang === undefined) {
    byLang = new Map();
    localizedFaces.set(face, byLang);
  }
  let localized = byLang.get(lang);
  if (localized === undefined) {
    localized = {
      ...face,
      name: override.name ?? face.name,
      subname: override.subname ?? face.subname,
      images: [...(override.images ?? []), ...face.images],
    };
    byLang.set(lang, localized);
  }
  return localized;
}

/** The name of a pack, a scenario or a set of the index in the language, else in English. */
export function localizedName(
  ref: { name: string; localized?: Record<string, PackLocalized> },
  lang: Lang,
): string {
  return ref.localized?.[lang]?.name ?? ref.name;
}
