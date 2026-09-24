import { describe, expect, it } from 'vitest';
import {
  chunk,
  mapRows,
  matchHeaders,
  normalizeStatus,
  parseCsv,
} from '../scripts/import-sheet-lib.js';

const fieldDefs = [
  { name: 'Title', type: 'text' },
  { name: 'Year', type: 'number' },
];

describe('parseCsv', () => {
  it('parses simple rows with CRLF/LF and no trailing-row artifact', () => {
    expect(parseCsv('a,b\r\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('handles quoted commas, newlines and escaped quotes', () => {
    expect(parseCsv('T,N\n"Foo, Bar","line1\nline2"\n"say ""hi""",x')).toEqual([
      ['T', 'N'],
      ['Foo, Bar', 'line1\nline2'],
      ['say "hi"', 'x'],
    ]);
  });
  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿Title,Year\nFoo,1')[0]).toEqual(['Title', 'Year']);
  });
  it('keeps empty fields and blank lines as rows', () => {
    expect(parseCsv('a,,c\n\nd')).toEqual([['a', '', 'c'], [''], ['d']]);
  });
});

describe('normalizeStatus', () => {
  it('defaults blank to have', () => {
    expect(normalizeStatus('')).toEqual({ status: 'have', recognised: true });
    expect(normalizeStatus(undefined)).toEqual({ status: 'have', recognised: true });
  });
  it('accepts have/iso case-insensitively with whitespace', () => {
    expect(normalizeStatus(' ISO ').status).toBe('iso');
    expect(normalizeStatus('Have').status).toBe('have');
  });
  it('flags unknown values and falls back to have', () => {
    expect(normalizeStatus('wishlist')).toEqual({ status: 'have', recognised: false });
  });
});

describe('matchHeaders', () => {
  it('matches case/whitespace-insensitively and reports unmatched', () => {
    const { columns, unmatchedHeaders } = matchHeaders(
      [' title ', 'YEAR', 'Status', 'Notes', 'Colour'],
      fieldDefs
    );
    expect(columns).toEqual([
      { kind: 'field', name: 'Title' },
      { kind: 'field', name: 'Year' },
      { kind: 'status' },
      { kind: 'notes' },
      null,
    ]);
    expect(unmatchedHeaders).toEqual(['Colour']);
  });
  it('reports duplicate headers after the first as unmatched', () => {
    const { unmatchedHeaders } = matchHeaders(['Title', 'title'], fieldDefs);
    expect(unmatchedHeaders).toEqual(['title']);
  });
  it('ignores blank headers without reporting them', () => {
    const { columns, unmatchedHeaders } = matchHeaders(['Title', ''], fieldDefs);
    expect(columns[1]).toBeNull();
    expect(unmatchedHeaders).toEqual([]);
  });
});

describe('mapRows', () => {
  it('maps rows to addItem-shaped items, trimming and skipping empty rows', () => {
    const rows = [
      ['Title', 'Year', 'Status', 'Notes', 'Extra'],
      ['  Foo ', 1999, 'iso', ' good ', 'x'],
      ['', '', '', '', ''],
      ['   ', null, '', '', ''],
      ['Bar', '', '', '', ''],
    ];
    const result = mapRows(rows, fieldDefs);
    expect(result.rowsRead).toBe(4);
    expect(result.skippedEmpty).toBe(2);
    expect(result.unmatchedHeaders).toEqual(['Extra']);
    expect(result.items).toEqual([
      { status: 'iso', fields: { Title: 'Foo', Year: '1999' }, notes: 'good' },
      { status: 'have', fields: { Title: 'Bar', Year: '' }, notes: '' },
    ]);
  });
  it('treats rows with only unmatched data as empty', () => {
    const result = mapRows([['Title', 'Extra'], ['', 'x']], fieldDefs);
    expect(result.items).toEqual([]);
    expect(result.skippedEmpty).toBe(1);
  });
  it('appends unmatched columns to notes when requested', () => {
    const result = mapRows(
      [['Title', 'Notes', 'Extra'], ['Foo', 'n', 'x']],
      fieldDefs,
      { mapUnmatchedToNotes: true }
    );
    expect(result.items[0].notes).toBe('n\nExtra: x');
  });
  it('records rows with an unrecognised status', () => {
    const result = mapRows([['Title', 'Status'], ['Foo', 'maybe']], fieldDefs);
    expect(result.invalidStatusRows).toEqual([{ row: 2, value: 'maybe' }]);
    expect(result.items[0].status).toBe('have');
  });
  it('handles a header-only or empty sheet', () => {
    expect(mapRows([['Title']], fieldDefs).items).toEqual([]);
    expect(mapRows([], fieldDefs).rowsRead).toBe(0);
  });
});

describe('chunk', () => {
  it('splits into batches of at most 500 by default', () => {
    const sizes = chunk(Array.from({ length: 1201 }, (_, i) => i)).map((c) => c.length);
    expect(sizes).toEqual([500, 500, 201]);
  });
});
