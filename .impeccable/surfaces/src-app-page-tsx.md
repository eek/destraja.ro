---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/presa/page.tsx","src/app/parlamentari/page.tsx"]
---

# Surface brief: lastraja.ro master site (home, /legi, /parlamentari, /presa, /metodologie, /cookies)

Scope: merge of three prior variants (V1 Argon, V2 Opus blind, V3 GPT blind) into one site. Home is Persuade (citizen acts on a bill); /presa and /parlamentari are Operate; /metodologie and /cookies are Read.

## Direction contract

THESIS: A calm civic monitor where the bill, its risk colour and its deadline read in one glance. Refuses the category default of a black "alert" newsroom page and the forest-green institutional portal; the only loud colours on the page are the three risk levels.

OWN-WORLD: Warm paper ground (#F6F4EE) with white surfaces, ink-navy (#13233F) type, buttons and links; hairline rules instead of heavy boxes; serif display (Source Serif 4) over a civic sans (Public Sans) with tabular figures for scores. Risk: red / amber / green chips, a 4px risk stripe on each bill card, dot markers. Coalition map: blue for same camp, violet for government + opposition. Dark theme is soft slate (#1B2230), never black.

STORY: A citizen sees that laws are changing, finds the risky ones on the radar, reads one sentence, and files an opinion in 60 seconds. A journalist sees who proposes them and who signs together, and takes the data.

FIRST VIEWPORT: Left: two-line serif headline "Stăm de strajă. / Să știi ce se pregătește.", one-line lead, primary navy button "Vezi legile care te afectează", secondary link "Explorează datele", source line. Right (desktop) / below (mobile): the risk radar, all bills as dots (closer to centre = riskier), with the selected bill's card under it.

FORM: user-pinned merge (brief-pinned; no concept roll): GPT V3 layout and voice, Opus V2 bill cards, radar, ordered party chart and coalition map, GPT "De ce acest nivel de risc?" disclosure.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: hovering/tapping radar dots swaps the bill card under the radar; clicking a coalition cell or a party bar filters the bill list.

Unresolved: operator name and contact e-mail for /cookies.
