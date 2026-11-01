# ResearchPilot for LaTeX (MVP)

VS Code extension for a Papilot-style LaTeX workflow: open a neighboring PDF, select/copy a passage, leave a reviewer note, ask the locally authenticated Codex CLI for a minimal edit, and accept or reject the proposed change. It also supports a basic source lookup and `latexmk` recompilation.

## Install

1. Install Node.js and VS Code.
2. Install and authenticate Codex CLI with your ChatGPT account (`codex login`). The extension invokes the CLI; it does not store tokens or call the OpenAI API directly.
3. Install LaTeX with `latexmk` on PATH.
4. Run `npm install`, then `npm run package`, and install the generated `.vsix` from VS Code's Extensions menu. For development, open this folder and press F5.

## Workflow

Open a `.tex` file and run **Papilot Codex: Compile LaTeX** or **Open PDF Preview**. In the preview, select text in the PDF. If the embedded PDF viewer does not expose the selection, use the prompt fallback. Click **Comment on selection**, describe the desired change, and the extension asks Codex for a unified diff. The returned replacement is applied as a staged editor change; use **Accept Proposed Edit** or **Reject Proposed Edit**. **Find selection in .tex** performs a verbatim source lookup and opens the source at the matching line.

## Limitations of this MVP

The PDF selection bridge depends on the installed VS Code PDF viewer and therefore includes a prompt fallback. SyncTeX is represented by deterministic source lookup for now; a future iteration can parse `.synctex.gz` for exact page-to-source mapping. The current diff parser intentionally accepts only simple replacement hunks and should be replaced with a full patch application library before production use.

## Commands

- `Papilot Codex: Open PDF Preview`
- `Papilot Codex: Comment on Selection`
- `Papilot Codex: Compile LaTeX`
- `Papilot Codex: Accept Proposed Edit`
- `Papilot Codex: Reject Proposed Edit`

## License and inspiration

This project is an independent MVP inspired by the publicly described Papilot workflow. No Papilot source code is included. Review Papilot's current repository license separately before reusing any implementation details.
