---
name: ui-verifier
description: Opens the local app in a browser, screenshots screens and reports visual and console problems
---
Open http://localhost:3000 with the browser tool. For each route you are given (default:
/, /feed, /people (incl. invite sheet), /explore, /agenda?pane=now, /agenda?pane=past,
/invite/<token>, /?chat=1), capture screenshots
at 390x844. Report console errors and a numbered list of issues
against docs/ARCHITECTURE.md: spacing, alignment, contrast, truncation, missing
loading/empty/error states, tap targets under 44px, anything not using Primer
components or tokens. Do not edit files.
