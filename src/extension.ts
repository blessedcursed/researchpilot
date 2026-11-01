import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

type Comment = { selectedText: string; note: string; texFile?: string; line?: number };
let panel: vscode.WebviewPanel | undefined;
let proposed: { uri: vscode.Uri; original: string; replacement: string } | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('papilotCodex.openPreview', openPreview),
    vscode.commands.registerCommand('papilotCodex.commentSelection', commentSelection),
    vscode.commands.registerCommand('papilotCodex.compile', compile),
    vscode.commands.registerCommand('papilotCodex.acceptEdit', acceptEdit),
    vscode.commands.registerCommand('papilotCodex.rejectEdit', rejectEdit)
  );
}

async function rootTex(): Promise<vscode.Uri | undefined> {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.fsPath.endsWith('.tex')) return active;
  const files = await vscode.workspace.findFiles('**/*.tex', '**/{node_modules,.git}/**', 1);
  return files[0];
}

async function openPreview() {
  const tex = await rootTex(); if (!tex) return vscode.window.showErrorMessage('Open a .tex file or workspace first.');
  const pdf = vscode.Uri.file(tex.fsPath.replace(/\.tex$/i, '.pdf'));
  panel?.dispose();
  panel = vscode.window.createWebviewPanel('papilotPreview', 'Papilot Codex PDF', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = html(panel.webview, pdf, tex);
  panel.webview.onDidReceiveMessage(async (m) => {
    if (m.type === 'comment') await makeComment(m.selectedText, tex);
    if (m.type === 'sync') await syncToTex(tex, m.selectedText);
  }, undefined, []);
}

function html(webview: vscode.Webview, pdf: vscode.Uri, tex: vscode.Uri) {
  const nonce = String(Date.now());
  const pdfUri = webview.asWebviewUri(pdf);
  return `<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0;font:13px sans-serif;background:#252526;color:#ddd}header{padding:8px;background:#333;display:flex;gap:8px}button{background:#0e639c;color:white;border:0;padding:6px 10px;border-radius:3px}iframe{width:100%;height:calc(100vh - 45px);border:0;background:white}</style></head><body><header><button id="comment">Comment on selection</button><button id="sync">Find selection in .tex</button><span id="status">${tex.fsPath}</span></header><iframe src="${pdfUri}"></iframe><script nonce="${nonce}">const vscode=acquireVsCodeApi();function sel(){return window.getSelection()?.toString().trim()||prompt('Selected PDF text');}comment.onclick=()=>{const s=sel();if(s)vscode.postMessage({type:'comment',selectedText:s})};sync.onclick=()=>{const s=sel();if(s)vscode.postMessage({type:'sync',selectedText:s})};</script></body></html>`;
}

async function makeComment(selectedText: string, tex: vscode.Uri) {
  const note = await vscode.window.showInputBox({ prompt: 'What should Codex change about this passage?', placeHolder: 'Rewrite for clarity, fix the claim, add a citation…' });
  if (!note) return;
  const loc = await locate(tex, selectedText);
  const comment: Comment = { selectedText, note, texFile: tex.fsPath, line: loc?.line };
  const prompt = `You are editing a LaTeX research paper. Apply this requested change in ${tex.fsPath}.\nSelected passage:\n${selectedText}\nReviewer note:\n${note}\nReturn ONLY a unified diff for the smallest safe edit. Preserve LaTeX syntax and citations.`;
  const result = await runCodex(prompt, tex.fsPath);
  if (!result.trim()) return;
  const parsed = parseUnifiedReplacement(result, selectedText);
  if (!parsed) return vscode.window.showWarningMessage('Codex returned no recognizable edit. See the output for details.');
  proposed = { uri: tex, original: selectedText, replacement: parsed };
  const doc = await vscode.workspace.openTextDocument(tex); const edit = new vscode.WorkspaceEdit();
  const range = doc.getText().indexOf(selectedText); if (range >= 0) edit.replace(tex, new vscode.Range(doc.positionAt(range), doc.positionAt(range + selectedText.length)), parsed);
  await vscode.workspace.applyEdit(edit); vscode.window.showInformationMessage('Codex proposal staged in the editor. Use Accept Proposed Edit or Reject Proposed Edit.');
}

async function commentSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return vscode.window.showInformationMessage('Select text in a .tex editor first.');
  await makeComment(editor.document.getText(editor.selection), editor.document.uri);
}

async function locate(uri: vscode.Uri, text: string) { const body = fs.readFileSync(uri.fsPath, 'utf8'); const i = body.indexOf(text); return i < 0 ? undefined : { line: body.slice(0, i).split('\n').length }; }
async function syncToTex(tex: vscode.Uri, selected: string) { const found = await locate(tex, selected); if (!found) return vscode.window.showWarningMessage('Selection was not found verbatim in the .tex source.'); const doc = await vscode.workspace.openTextDocument(tex); await vscode.window.showTextDocument(doc, { selection: new vscode.Range(found.line - 1, 0, found.line - 1, 0), preview: false }); }
function parseUnifiedReplacement(output: string, original: string) { const lines = output.split(/\r?\n/); const plus = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)); return plus.length ? plus.join('\n') : (output.includes(original) ? output.split(original)[1].trim() : undefined); }

function runCodex(prompt: string, cwd: string): Promise<string> { return new Promise((resolve, reject) => { const cmd = vscode.workspace.getConfiguration('papilotCodex').get<string>('codexCommand', 'codex'); const p = spawn(cmd, ['exec', '--full-auto', prompt], { cwd: path.dirname(cwd), shell: process.platform === 'win32' }); let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('error', reject); p.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || `codex exited ${code}`))); }); }
async function compile() { const tex = await rootTex(); if (!tex) return vscode.window.showErrorMessage('No .tex file found.'); const cfg = vscode.workspace.getConfiguration('papilotCodex'); const cmd = cfg.get<string>('latexCommand','latexmk'); const args = cfg.get<string[]>('latexArgs',['-pdf','-interaction=nonstopmode']); await new Promise<void>((resolve,reject)=>{const p=spawn(cmd,[...args,path.basename(tex.fsPath)],{cwd:path.dirname(tex.fsPath),shell:process.platform==='win32'}); let e='';p.stderr.on('data',d=>e+=d);p.on('error',reject);p.on('close',c=>c===0?resolve():reject(new Error(e||`compiler exited ${c}`)));}); await openPreview(); }
async function acceptEdit() { if (!proposed) return vscode.window.showInformationMessage('No staged edit.'); proposed = undefined; vscode.window.showInformationMessage('Edit accepted.'); }
async function rejectEdit() { if (!proposed) return vscode.window.showInformationMessage('No staged edit.'); const d=await vscode.workspace.openTextDocument(proposed.uri); const i=d.getText().indexOf(proposed.replacement); if(i>=0){const e=new vscode.WorkspaceEdit();e.replace(proposed.uri,new vscode.Range(d.positionAt(i),d.positionAt(i+proposed.replacement.length)),proposed.original);await vscode.workspace.applyEdit(e);} proposed=undefined; }
export function deactivate() {}
