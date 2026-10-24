import type { Cat, Data } from "../lib/data";
import type { ThemeMode } from "../lib/theme";

export interface Ctx {
  d: Data;
  iso: string;
  setIso: (iso: string) => void;
  cat: Cat;
  setCat: (c: Cat) => void;
  mode: ThemeMode;
}
