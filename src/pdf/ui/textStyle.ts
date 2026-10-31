import { hexToRgb, type FontFamily } from '../core/fonts';
import type { TextStyle } from '../core/stamp';

export interface TextStyleState {
  family: FontFamily;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export const DEFAULT_TEXT_STYLE: TextStyleState = { family: 'serif', size: 11, color: '#000000', bold: false, italic: false };

export function toTextStyle(s: TextStyleState, opacity?: number): TextStyle {
  return { family: s.family, size: s.size, color: hexToRgb(s.color), bold: s.bold, italic: s.italic, opacity };
}
