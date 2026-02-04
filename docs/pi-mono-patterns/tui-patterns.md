# pi-tui Pattern Analysis for swarmctl Dashboard

This document analyzes the pi-mono TUI package patterns for use in swarmctl dashboard.

## 1. Component Architecture

### Core Component Interface

All components implement the `Component` interface:

```typescript
export interface Component {
  /** Render the component to lines for the given viewport width */
  render(width: number): string[];
  
  /** Optional handler for keyboard input when component has focus */
  handleInput?(data: string): void;
  
  /** If true, component receives key release events (Kitty protocol) */
  wantsKeyRelease?: boolean;
  
  /** Invalidate any cached rendering state */
  invalidate(): void;
}
```

### Key Architectural Patterns

1. **Line-based Rendering**: Components return `string[]` - an array of terminal lines
2. **Width-aware**: Each render pass receives the current viewport width
3. **No props object**: State is direct class properties, not a separate props object
4. **Optional callbacks**: Event handlers are optional public properties (e.g., `onSubmit?`)

### Props and State Management

```typescript
// State is stored directly on the class
export class SelectList implements Component {
  private items: SelectItem[] = [];
  private selectedIndex: number = 0;
  private maxVisible: number = 5;
  
  // Callbacks are optional public properties
  public onSelect?: (item: SelectItem) => void;
  public onCancel?: () => void;
  public onSelectionChange?: (item: SelectItem) => void;
}
```

### Rendering Approach: Differential

The TUI class implements **differential rendering**:

```typescript
export class TUI extends Container {
  private previousLines: string[] = [];
  private previousWidth = 0;
  
  private doRender(): void {
    // 1. Collect all lines from components
    const currentLines = this.render(this.terminal.columns);
    
    // 2. Compare with previous render
    const diff = computeDiff(this.previousLines, currentLines);
    
    // 3. Only output changed lines
    for (const change of diff) {
      if (change.type === 'replace') {
        this.terminal.moveTo(change.row, 0);
        this.terminal.write(change.line);
        this.terminal.clearLine();
      }
    }
    
    this.previousLines = currentLines;
  }
}
```

**Benefits**:
- Minimizes terminal output for better performance
- Reduces flickering
- Essential for SSH/slow connections

### Component Lifecycle

1. **Construction**: Initialize state, set up private properties
2. **Mount**: Components are added to parent via `addChild()`
3. **Render**: Called each frame with current width
4. **Input**: `handleInput()` called when focused (if implemented)
5. **Invalidate**: Called when theme changes or state needs refresh
6. **Unmount**: Removed via `removeChild()` or `clear()`

## 2. Component Inventory

### Box - Layout Container
```typescript
export class Box implements Component {
  children: Component[] = [];
  private paddingX: number;
  private paddingY: number;
  private bgFn?: (text: string) => string;
  
  addChild(component: Component): void
  removeChild(component: Component): void
  setBgFn(bgFn?: (text: string) => string): void
}
```
**Features**: Padding, background color via function, child container

### Input - Single-line Text Input
```typescript
export class Input implements Component, Focusable {
  private value: string = "";
  private cursor: number = 0;
  public onSubmit?: (value: string) => void;
  public onEscape?: () => void;
  
  getValue(): string
  setValue(value: string): void
}
```
**Features**: Horizontal scrolling, grapheme-aware cursor, bracketed paste support

### SelectList - Selection List
```typescript
export class SelectList implements Component {
  constructor(items: SelectItem[], maxVisible: number, theme: SelectListTheme);
  
  setFilter(filter: string): void;
  setSelectedIndex(index: number): void;
  getSelectedItem(): SelectItem | null;
}
```
**Features**: Scrollable, filterable, themable, wrap-around navigation

### Markdown - Rich Text Rendering
```typescript
export class Markdown implements Component {
  constructor(
    text: string,
    paddingX: number,
    paddingY: number,
    theme: MarkdownTheme,
    defaultTextStyle?: DefaultTextStyle
  );
  
  setText(text: string): void;
}
```
**Features**: Full markdown parsing (via `marked`), tables, code blocks, lists, quotes

### Text - Multi-line Text
```typescript
export class Text implements Component {
  constructor(
    text: string = "",
    paddingX: number = 1,
    paddingY: number = 1,
    customBgFn?: (text: string) => string
  );
  
  setText(text: string): void;
  setCustomBgFn(customBgFn?: (text: string) => string): void;
}
```
**Features**: Word wrapping, ANSI code preservation, padding, background

### Loader - Animated Spinner
```typescript
export class Loader extends Text {
  constructor(
    ui: TUI,
    spinnerColorFn: (str: string) => string,
    messageColorFn: (str: string) => string,
    message: string = "Loading..."
  );
  
  start(): void;
  stop(): void;
  setMessage(message: string): void;
}
```
**Features**: Braille spinner animation (80ms), auto-updates TUI

### CancellableLoader - Abortable Loader
```typescript
export class CancellableLoader extends Loader {
  onAbort?: () => void;
  get signal(): AbortSignal;
  get aborted(): boolean;
}
```
**Features**: AbortController integration, Escape to cancel

### Image - Terminal Image Display
```typescript
export class Image implements Component {
  constructor(
    base64Data: string,
    mimeType: string,
    theme: ImageTheme,
    options: ImageOptions = {},
    dimensions?: ImageDimensions
  );
}
```
**Features**: Kitty/iTerm2 graphics protocol, automatic fallback

### Spacer - Empty Space
```typescript
export class Spacer implements Component {
  constructor(lines: number = 1);
  setLines(lines: number): void;
}
```

### SettingsList - Settings Panel
```typescript
export class SettingsList implements Component {
  constructor(
    items: SettingItem[],
    maxVisible: number,
    theme: SettingsListTheme,
    onChange: (id: string, newValue: string) => void,
    onCancel: () => void,
    options: { enableSearch?: boolean } = {}
  );
}
```
**Features**: Label/value display, cycling values, submenu support, search

### Editor - Full Text Editor (complex)
A full multi-line editor with autocomplete, syntax highlighting, etc.

## 3. Terminal Abstraction

### Terminal Interface
```typescript
export interface Terminal {
  start(onInput: (data: string) => void, onResize: () => void): void;
  stop(): void;
  drainInput(maxMs?: number, idleMs?: number): Promise<void>;
  write(data: string): void;
  get columns(): number;
  get rows(): number;
  get kittyProtocolActive(): boolean;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
  setTitle(title: string): void;
}
```

### ProcessTerminal Implementation

The `ProcessTerminal` class provides:

1. **Raw Mode Management**: Saves/restores stdin raw mode state
2. **Kitty Keyboard Protocol**: Auto-detects and enables advanced key reporting
3. **Bracketed Paste**: Wraps paste content in markers (`\x1b[200~...\x1b[201~`)
4. **Input Buffering**: Uses `StdinBuffer` to handle partial escape sequences
5. **Drain on Exit**: Prevents key releases from leaking to parent shell

### Cross-Platform Support

```typescript
// Unix-specific resize signal
if (process.platform !== "win32") {
  process.kill(process.pid, "SIGWINCH");
}
```

### Input Handling

The `StdinBuffer` class handles:
- **Partial escape sequences**: Buffers until complete
- **Bracketed paste**: Detects and emits paste events
- **Timeout-based flush**: Flushes incomplete sequences after 10ms

## 4. Integration Patterns

### Component Composition

```typescript
// Container pattern for nesting
export class Container implements Component {
  children: Component[] = [];
  
  addChild(component: Component): void
  removeChild(component: Component): void
  clear(): void
  
  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      lines.push(...child.render(width));
    }
    return lines;
  }
}
```

### Event Handling

```typescript
// Input flows through TUI to focused component
tui.setFocus(component);

// Component handles its own input
class MyComponent implements Component {
  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(data, "submit")) {
      this.onSubmit?.(this.value);
    }
  }
}
```

### State Updates

```typescript
// Request re-render after state change
class Loader extends Text {
  private updateDisplay() {
    this.setText(`${frame} ${message}`);
    this.ui?.requestRender(); // Trigger re-render
  }
}
```

### Testing Pattern

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";

describe("Input component", () => {
  it("submits value on Enter", () => {
    const input = new Input();
    let submitted: string | undefined;
    input.onSubmit = (value) => { submitted = value; };
    
    input.handleInput("h");
    input.handleInput("i");
    input.handleInput("\r"); // Enter
    
    assert.strictEqual(submitted, "hi");
  });
});
```

## 5. Keybinding System

### Editor Actions
```typescript
export type EditorAction =
  | "cursorUp" | "cursorDown" | "cursorLeft" | "cursorRight"
  | "cursorWordLeft" | "cursorWordRight"
  | "cursorLineStart" | "cursorLineEnd"
  | "deleteCharBackward" | "deleteCharForward"
  | "deleteWordBackward" | "deleteWordForward"
  | "newLine" | "submit"
  | "selectUp" | "selectDown" | "selectConfirm" | "selectCancel";
```

### Key Matching
```typescript
const kb = getEditorKeybindings();
if (kb.matches(data, "selectUp")) {
  // Handle up arrow
}
```

### Default Keybindings
```typescript
export const DEFAULT_EDITOR_KEYBINDINGS = {
  cursorUp: "up",
  cursorDown: "down",
  cursorLeft: ["left", "ctrl+b"],
  cursorRight: ["right", "ctrl+f"],
  cursorWordLeft: ["alt+left", "ctrl+left", "alt+b"],
  submit: "enter",
  selectCancel: ["escape", "ctrl+c"],
  // ...
};
```

## 6. Theme System

### Theme Interfaces

Components accept theme objects with styling functions:

```typescript
export interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

export interface MarkdownTheme {
  heading: (text: string) => string;
  link: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  // ...
}
```

### Usage with Chalk

```typescript
import chalk from "chalk";

const theme: MarkdownTheme = {
  heading: (s) => chalk.bold.cyan(s),
  link: (s) => chalk.blue.underline(s),
  code: (s) => chalk.yellow(s),
  bold: (s) => chalk.bold(s),
  // ...
};
```

## 7. Dash Integration Plan

### Replace Ink with pi-tui

**Current (Ink)**:
```tsx
import { Box, Text } from 'ink';

<Box flexDirection="column">
  <Text color="green">Status: {status}</Text>
</Box>
```

**New (pi-tui)**:
```typescript
import { Box, Text } from '@mariozechner/pi-tui';

const box = new Box(1, 1, chalk.bgBlack);
const statusText = new Text(`Status: ${status}`, 0, 0);
box.addChild(statusText);
tui.addChild(box);
```

### Dashboard Component Design

```typescript
class Dashboard implements Component {
  private header = new Box(1, 0);
  private serviceList = new SelectList([], 10, dashboardTheme);
  private logPanel = new Text("", 1, 1);
  private statusBar = new Text("", 0, 0);
  
  constructor(private tui: TUI) {
    this.setupLayout();
  }
  
  private setupLayout(): void {
    const container = new Box(0, 0);
    container.addChild(this.header);
    container.addChild(this.serviceList);
    container.addChild(this.logPanel);
    container.addChild(this.statusBar);
    this.tui.addChild(container);
  }
  
  updateServices(services: Service[]): void {
    this.serviceList = new SelectList(
      services.map(s => ({
        value: s.id,
        label: s.name,
        description: s.status
      })),
      10,
      dashboardTheme
    );
    this.tui.requestRender();
  }
  
  appendLog(line: string): void {
    const current = this.logPanel.getText?.() || "";
    this.logPanel.setText(current + "\n" + line);
    this.tui.requestRender();
  }
  
  render(width: number): string[] {
    // Stack components vertically
    return [
      ...this.header.render(width),
      ...this.serviceList.render(width),
      ...this.logPanel.render(width),
      ...this.statusBar.render(width)
    ];
  }
  
  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(data, "selectUp")) {
      this.serviceList.handleInput?.(data);
    } else if (kb.matches(data, "quit")) {
      process.exit(0);
    }
  }
}
```

### Real-time Monitoring UI

```typescript
class ServiceMonitor implements Component {
  private metrics = new Map<string, MetricDisplay>();
  private loader?: CancellableLoader;
  
  startRefreshing(): void {
    const interval = setInterval(() => {
      this.fetchMetrics().then(data => {
        this.updateMetrics(data);
        this.tui.requestRender();
      });
    }, 1000);
  }
  
  render(width: number): string[] {
    const lines: string[] = [];
    for (const [name, metric] of this.metrics) {
      const bar = this.renderBar(metric.value, metric.max, width - 20);
      lines.push(`${name.padEnd(12)} ${bar} ${metric.value}%`);
    }
    return lines;
  }
  
  private renderBar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }
}
```

### Theme Integration

```typescript
import chalk from "chalk";

export const swarmctlTheme = {
  // SelectList theme
  selectedPrefix: (s) => chalk.cyan(s),
  selectedText: (s) => chalk.cyan.bold(s),
  description: (s) => chalk.gray(s),
  scrollInfo: (s) => chalk.dim(s),
  noMatch: (s) => chalk.red(s),
  
  // Status colors
  statusRunning: (s) => chalk.green(s),
  statusStopped: (s) => chalk.red(s),
  statusWarning: (s) => chalk.yellow(s),
  
  // Log levels
  logInfo: (s) => chalk.white(s),
  logError: (s) => chalk.red(s),
  logDebug: (s) => chalk.gray(s),
};
```

### Main Entry Point

```typescript
import { ProcessTerminal } from "@mariozechner/pi-tui/terminal.js";
import { TUI } from "@mariozechner/pi-tui/tui.js";
import { Dashboard } from "./dashboard.js";

async function main() {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  
  const dashboard = new Dashboard(tui);
  tui.addChild(dashboard);
  tui.setFocus(dashboard);
  
  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    tui.stop();
    process.exit(0);
  });
  
  tui.start();
  
  // Connect to swarm service
  const swarm = new SwarmClient();
  swarm.onServiceUpdate = (services) => {
    dashboard.updateServices(services);
  };
  swarm.onLog = (line) => {
    dashboard.appendLog(line);
  };
}

main().catch(console.error);
```

## 8. Utility Functions

### Width Calculation
```typescript
import { visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui/utils.js";

const width = visibleWidth(text); // Accounts for ANSI codes, wide chars
const lines = wrapTextWithAnsi(text, 80); // Word wrap preserving ANSI
```

### Background Application
```typescript
import { applyBackgroundToLine } from "@mariozechner/pi-tui/utils.js";

const lineWithBg = applyBackgroundToLine(text, width, chalk.bgBlack);
```

### Truncation
```typescript
import { truncateToWidth } from "@mariozechner/pi-tui/utils.js";

const truncated = truncateToWidth(longText, 40, "...");
```

## 9. Dependencies

```json
{
  "dependencies": {
    "@mariozechner/pi-tui": "^0.51.0",
    "chalk": "^5.5.0"
  }
}
```

## 10. Key Advantages Over Ink

1. **Differential Rendering**: Only changed lines are redrawn
2. **No React Overhead**: Direct component model, no VDOM
3. **Kitty Protocol**: Advanced key detection (key releases, modifiers)
4. **Image Support**: Native terminal image display
5. **Better Markdown**: Full `marked` integration with tables
6. **Simpler State**: Direct property access, no hooks needed
7. **Typed Keybindings**: Compile-time key identifier checking

---

*Analysis generated from pi-mono/packages/tui v0.51.5*
