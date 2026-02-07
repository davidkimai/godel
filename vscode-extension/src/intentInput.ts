import * as vscode from 'vscode';

export class IntentInputBox {
  static async show(): Promise<string | undefined> {
    const intent = await vscode.window.showInputBox({
      prompt: 'Describe what you want to achieve',
      placeHolder: 'e.g., "Refactor authentication to use JWT"',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Intent description is required';
        }
        if (value.length < 10) {
          return 'Intent should be at least 10 characters';
        }
        return null;
      }
    });

    return intent;
  }
}
