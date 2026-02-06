/**
 * Type declarations for Ink and related packages
 */

declare module 'ink' {
  import * as React from 'react';

  export interface BoxProps {
    children?: React.ReactNode;
    flexDirection?: 'row' | 'column';
    justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
    alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
    width?: number | string;
    height?: number | string;
    minWidth?: number;
    minHeight?: number;
    padding?: number;
    paddingX?: number;
    paddingY?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    margin?: number;
    marginX?: number;
    marginY?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
    borderColor?: string;
    display?: 'flex' | 'none';
    overflow?: 'visible' | 'hidden';
    position?: 'relative' | 'absolute';
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: number | string;
    gap?: number;
    rowGap?: number;
    columnGap?: number;
  }

  export const Box: React.FC<BoxProps>;

  export interface TextProps {
    children?: React.ReactNode;
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    inverse?: boolean;
    dimColor?: boolean;
    wrap?: 'wrap' | 'end' | 'truncate' | 'truncate-start' | 'truncate-middle';
  }

  export const Text: React.FC<TextProps>;

  export const Spacer: React.FC;

  export interface StaticProps {
    children?: React.ReactNode;
  }

  export const Static: React.FC<StaticProps>;

  export interface NewlineProps {
    count?: number;
  }

  export const Newline: React.FC<NewlineProps>;

  export interface TransformProps {
    children?: React.ReactNode;
    transform: (output: string) => string;
  }

  export const Transform: React.FC<TransformProps>;

  export function render(
    node: React.ReactElement,
    options?: {
      stdin?: NodeJS.ReadStream;
      stdout?: NodeJS.WriteStream;
      stderr?: NodeJS.WriteStream;
      debug?: boolean;
      exitOnCtrlC?: boolean;
      patchConsole?: boolean;
    }
  ): {
    waitUntilExit: () => Promise<void>;
    cleanup: () => void;
    clear: () => void;
  };

  export function useInput(
    handler: (input: string, key: {
      upArrow: boolean;
      downArrow: boolean;
      leftArrow: boolean;
      rightArrow: boolean;
      pageUp: boolean;
      pageDown: boolean;
      return: boolean;
      escape: boolean;
      ctrl: boolean;
      shift: boolean;
      tab: boolean;
      backspace: boolean;
      delete: boolean;
      meta: boolean;
    }) => void,
    options?: { isActive?: boolean }
  ): void;

  export function useApp(): {
    exit: (error?: Error) => void;
    waitUntilExit: () => Promise<void>;
  };

  export function useStdin(): {
    stdin: NodeJS.ReadStream;
    isRawModeSupported: boolean;
    setRawMode: (isRawMode: boolean) => void;
    internal_exitOnCtrlC: boolean;
  };

  export function useStdout(): {
    stdout: NodeJS.WriteStream;
    write: (data: string) => void;
  };

  export function useStderr(): {
    stderr: NodeJS.WriteStream;
    write: (data: string) => void;
  };

  export function useFocus(options?: { isActive?: boolean; autoFocus?: boolean }): {
    isFocused: boolean;
    focus: () => void;
  };

  export function useFocusManager(): {
    focusNext: () => void;
    focusPrevious: () => void;
    focus: (id: string) => void;
  };
}

declare module 'ink-spinner' {
  import * as React from 'react';

  export interface SpinnerProps {
    type?: 'dots' | 'dots2' | 'dots3' | 'dots4' | 'dots5' | 'dots6' | 'dots7' | 'dots8' | 
           'dots9' | 'dots10' | 'dots11' | 'dots12' | 'line' | 'line2' | 'pipe' | 'star' |
           'star2' | 'flip' | 'hamburger' | 'growVertical' | 'growHorizontal' | 'balloon' |
           'balloon2' | 'noise' | 'bounce' | 'boxBounce' | 'boxBounce2' | 'triangle' |
           'arc' | 'circle' | 'squareCorners' | 'circleQuarters' | 'circleHalves' | 'squish' |
           'toggle' | 'toggle2' | 'toggle3' | 'toggle4' | 'toggle5' | 'toggle6' | 'toggle7' |
           'toggle8' | 'toggle9' | 'toggle10' | 'toggle11' | 'toggle12' | 'toggle13' |
           'arrow' | 'arrow2' | 'arrow3' | 'bouncingBar' | 'bouncingBall' | 'weather';
  }

  const Spinner: React.FC<SpinnerProps>;
  export default Spinner;
}

declare module 'ink-text-input' {
  import * as React from 'react';

  export interface TextInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
    focus?: boolean;
    mask?: string;
    showCursor?: boolean;
    highlightPastedText?: boolean;
  }

  export const TextInput: React.FC<TextInputProps>;
  export default TextInput;
}
