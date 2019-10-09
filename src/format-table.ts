
import * as vscode from 'vscode';
import { MarkdownTableFormatterSettings } from './interfaces';
import { stripHeaderTailPipes, splitCells, padding, joinCells, swidth, addTailPipes, tableJustification } from './utils';

export function formatTable(text: RegExpExecArray, settings: MarkdownTableFormatterSettings) {

    const addTailPipesIfNeeded = settings.keepFirstAndLastPipes
        ? addTailPipes
        : (x: string) => x;

    let formatline = text[2].trim();
    const headerline = text[1].trim();

    let formatrow: number;
    let data: string;
    if (headerline.length === 0) {
        formatrow = 0;
        data = text[3];
    } else {
        formatrow = 1;
        data = text[1] + text[3].replace(/^\n+|\n+$/g, '');
    }
    const lines = data.split(/\r?\n/);

    const justify = splitCells(stripHeaderTailPipes(formatline)).map(cell => {
        const trimmed = cell.trim();
        if (trimmed === "") {
            return "--";
        }
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        const ends = (first || ':') + (last || '-');
        return ends;
    });

    const columns = justify.length;
    const colArr: undefined[] = Array.from(Array(columns));

    const cellPadding = padding(settings.spacePadding);

    const content = lines.map(line => {
        const cells = splitCells(stripHeaderTailPipes(line));
        if (columns - cells.length > 0) {
            // pad rows to have `columns` cells
            cells.push(...Array(columns - cells.length).fill(''));
        } else if (columns - cells.length < 0) {
            // put all extra content into last cell
            cells[columns - 1] = joinCells(cells.slice(columns - 1));
        }
        return cells.map(cell => `${cellPadding}${cell.trim()}${cellPadding}`);
    });

    const widths = colArr.map((_x, i) =>
        Math.max(2, ...content.map(cells => swidth(cells[i]))),
    );

    if (settings.limitLastColumnPadding) {
        const preferredLineLength = vscode.workspace.getConfiguration('editor').get<number>('wordWrapColumn', 80);
        const sum = (arr: number[]) => arr.reduce((x, y) => x + y, 0);
        const wsum = sum(widths);
        if (wsum > preferredLineLength) {
            const prewsum = sum(widths.slice(0, -1));
            widths[widths.length - 1] = Math.max(
                preferredLineLength - prewsum - widths.length - 1,
                3,
            );
            // Need at least :-- for github to recognize a column
        }
    }

    const just = function (str: string, col: number) {
        const length = Math.max(widths[col] - swidth(str), 0);
        var justifySwitch = justify[col];
        if (justifySwitch === "--") {
            justifySwitch = tableJustification[settings.defaultTableJustification];
        }
        switch (justifySwitch) {
            case '::':
                return padding(length / 2) + str + padding((length + 1) / 2);
            case '-:':
                return padding(length) + str;
            case ':-':
                return str + padding(length);
            default:
                throw new Error(`Unknown column justification ${justify[col]}`);
        }
    };

    const formatted = content.map(cells =>
        addTailPipesIfNeeded(joinCells(colArr.map((_x, i) => just(cells[i], i)))),
    );

    formatline = addTailPipesIfNeeded(
        joinCells(
            colArr.map((_x, i) => {
                const [front, back] = justify[i];
                if (settings.removeColonsIfSameAsDefault && (justify[i] === tableJustification[settings.defaultTableJustification])) {
                    return padding(widths[i], '-');
                }
                return front + padding(widths[i] - 2, '-') + back;
            }),
        ),
    );

    formatted.splice(formatrow, 0, formatline);

    return (
        (formatrow === 0 && text[1] !== '' ? '\n' : '') +
        formatted.join('\n')
    );
}