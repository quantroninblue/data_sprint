import type { Cat, Data, Version } from "../lib/data";
import type { ThemeMode } from "../lib/theme";

export interface Ctx {
  d: Data;
  iso: string;
  setIso: (iso: string) => void;
  cat: Cat;
  setCat: (c: Cat) => void;
  version: Version;
  setVersion: (v: Version) => void;
  mode: ThemeMode;
}
