# 13. Danish copy and component inventory

## Main copy
- teamspace.
- Fire mennesker. Én retning.
- I dag
- Vores områder
- Projekter
- Tanker
- Hej {firstName}. Hvad er næste skridt?
- Mit fokus / Hele teamet
- Næste skridt / Vis alle opgaver
- Det skal vi have afklaret
- Fortsæt i et projekt
- Tre områder. Ét fælles arbejde.
- Vores rejse
- FÆLLES RETNING
- Giv tankerne plads.
- Skriv først. Organisér senere.

## Controls
Ny opgave; Nyt projekt; Skriv noget; Tilføj; Gem; Annuller; Fortryd; Arkivér; Gendan; Redigér projekt; Redigér retning; Nulstil filtre; Eksportér backup; Gendan backup.

Task fields: Navn; Projekt (valgfrit); Uden projekt; Område (valgfrit); Uden område; Ansvarlig; Ingen ansvarlig; Status; Beskrivelse / blokering; Frist (valgfrit); Prioritet; Delopgaver; Kommentarer.

Task statuses: Åben / I gang / Blokeret / Færdig.
Project phases: Idé / Udforsk / Eksperiment / Bevis værdi / Pilot / Skalér.
Tabs: Kanban / Liste / Retning & læring / Noter.

## Feedback
Demo banner: Lokal prototype. Data gemmes kun i denne browser, ikke fælles mellem jer. Startindhold er eksempler. Eksportér jævnligt backup.
Production banner must not claim local-only persistence.
Save success: Gemt.
Save failure: Kunne ikke gemme. Din tekst er bevaret. Prøv igen.
Conflict: Opgaven er blevet opdateret af en anden. Din kladde er bevaret.
Empty filter: Ingen opgaver matcher dine filtre.
Empty area: Ingen opgaver her endnu.
Invalid storage: Gemte data kunne ikke læses. De bliver ikke overskrevet. Eksportér dem, eller gendan en gyldig backup.

## Component responsibilities
AppShell: navigation, workspace label, account, theme.
CaptureBar: local text/kind, optional project, Enter submit, preserves draft.
TaskFilters: one filter contract, no hidden extra state.
TaskBoard: columns and ordering; no independent entity copies.
TaskCard: title/open, assignee/status inline, due/checklist metadata.
TaskSheet: draft, validation, pending input, atomic save, dirty close.
ProjectJourney: phase grouping; not task status.
ProjectCard: owner, next step, completion count, blocked indicator.
AreaOverview: three ownership cards + shared task board.
ThoughtCard: text/type/author, edit/archive/convert.
BackupPanel: validate, preview, export, explicit restore.
MutationToast: actual result, accessible announcement, safe undo.
ErrorBoundary: recovery route, no silent reset to seed.

## Visual exclusions
No stock photography, generated artwork, charts, Gantt, employee portraits, brand imitation or external font files are needed. Icons are functional, small and secondary to text.
