# data_sprint

Replication of Sulyok & Walker (2020), "Community movement and COVID-19: a global study using Google's Community Mobility Reports" (*Epidemiology and Infection* 148, e284), with a better analysis and visuals. The brief allows us to change the visualization, model, presentation and analysis, but the data sources and main theme must stay the same.

## Layout

```
data_sprint/
├── README.md
├── chat.md                     shared team log (newest message at the bottom)
├── docs/
│   └── problem-brief.docx      the task brief
├── data/
│   ├── raw/                    upstream material, never edited
│   │   ├── full-mobility-report.zip   full Google mobility CSV (1.1 GB unzipped)
│   │   ├── jhu-covid-19/              JHU case data (datasets/covid19 copy)
│   │   └── sulyok-repo/               the original authors' code and data
│   ├── interim/                trimmed inputs, one file per source
│   │   ├── 2026-10-24-gmr-national.csv                 Google mobility, national rows only
│   │   ├── 2026-10-24-countries-aggregated.csv         JHU cumulative cases/deaths by country
│   │   ├── 2026-10-24-time-series-covid-combined.csv   JHU cases by province (sum to get countries)
│   │   └── 2026-10-24-reference.csv                    JHU lookup with population
│   └── processed/
│       └── 2026-10-24-panel-clean.csv                  cleaned country-day analysis panel
└── replication/                scripts, run from the repo root in numeric order
    ├── 01_data_import.R        builds replication/out/panel.rds from data/interim
    └── out/                    script output (gitignored)
```

## Data notes

- **Mobility** covers 135 countries, 15 Feb 2020 to 15 Oct 2022. Dates are `DD-MM-YYYY`.
- **Cases** run 22 Jan 2020 to 16 Apr 2022. `countries-aggregated.csv` uses `DD-MM-YYYY` dates; `time-series-covid-combined.csv` uses `YYYY-MM-DD`. Counts are cumulative; revisions cause small negative daily changes.
- Join mobility to cases on ISO2 through `reference.csv`, not on country names. Seven countries are named differently in the two sources, and Aruba, Hong Kong, Puerto Rico and Réunion have no country-level cases.
- Namibia's ISO2 code is the text `NA`. Read CSVs with `na = ""` so R doesn't turn it into a missing value.
- **`processed/2026-10-24-panel-clean.csv`** has 105,741 rows for 134 countries, 15 Feb 2020 to 16 Apr 2022. The `window` column splits it as in the paper: `paper_train` (to 19 Jun 2020), `paper_validation` (20 Jun to 8 Sep 2020) and `extension` (9 Sep 2020 onward).
- The full mobility CSV is not tracked. To use it, unzip `data/raw/full-mobility-report.zip` inside `data/raw/`; the unzipped folder is gitignored.

## Working conventions

- Run scripts from the repo root with relative paths, e.g. `setwd("C:/data_sprint")`.
- Number scripts in run order (`02_...R`, `03_...R`) and write outputs to `replication/out/`.
- Changes arrive as patch files: apply with `git am <file>.patch`, then push. Patch files are gitignored.
- Add a line to the change log below with every change.

## Change log

- 2026-10-24: `replication/01_data_import.R` builds the country-day panel from `data/interim`: parses `DD-MM-YYYY` dates, joins cases and population on ISO2, adds continent, saves `replication/out/panel.rds`.
- 2026-10-24: restructured the repo into `docs/`, `data/{raw,interim,processed}/` and `replication/`. Removed the duplicate panel copy under `replication/Deva_data/`, the scratch `Data_explorer.R` (superseded by `01_data_import.R`) and the committed patch file. Importer paths updated.
