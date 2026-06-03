import * as vscode from 'vscode';

/** Generate a random nonce for the script CSP. */
export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

interface BuildHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  /** Script file under `dist/`, e.g. `webview.js` or `canvas.js`. */
  scriptName: string;
  /** Stylesheet file under `dist/`, e.g. `webview.css` or `canvas.css`. */
  cssName: string;
  title: string;
}

/** Build the nonce + CSP HTML shell that loads a bundled webview script/stylesheet. */
export function buildHtml({ webview, extensionUri, scriptName, cssName, title }: BuildHtmlOptions): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', scriptName));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', cssName));
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>${title}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
