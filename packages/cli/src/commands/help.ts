import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import wrap from 'word-wrap';
import Table from 'cli-table3';
import { LOGO, NAME } from '@vercel-internals/constants';

const INDENT = ' '.repeat(2);
const NEWLINE = '\n';
const SECTION_BREAK = NEWLINE.repeat(2);

export interface CommandOption {
  name: string;
  shorthand: string | null;
  type: 'boolean' | 'string';
  argument?: string;
  deprecated: boolean;
  description?: string;
  multi: boolean;
}
export interface CommandArgument {
  name: string;
  required: boolean;
}
export interface CommandExample {
  name: string;
  value: string | string[];
}
export interface Command {
  name: string;
  description: string;
  arguments: CommandArgument[];
  options: CommandOption[];
  examples: CommandExample[];
}

interface TableCell {
  content: string | undefined;
  wrapOnWordBoundary?: boolean;
  wordWrap?: boolean;
}

const globalCommandOptions: CommandOption[] = [
  {
    name: 'help',
    shorthand: 'h',
    type: 'string',
    description: 'Output usage information',
    deprecated: false,
    multi: false,
  },
  {
    name: 'version',
    shorthand: 'v',
    type: 'string',
    description: 'Output the version number',
    deprecated: false,
    multi: false,
  },
  {
    name: 'cwd',
    shorthand: null,
    type: 'string',
    argument: 'DIR',
    description:
      'Sets the current working directory for a single run of a command',
    deprecated: false,
    multi: false,
  },
  {
    name: 'local-config',
    shorthand: 'A',
    type: 'string',
    argument: 'FILE',
    description: 'Path to the local `vercel.json` file',
    deprecated: false,
    multi: false,
  },
  {
    name: 'global-config',
    shorthand: 'Q',
    type: 'string',
    argument: 'DIR',
    description: 'Path to the global `.vercel` directory',
    deprecated: false,
    multi: false,
  },
  {
    name: 'debug',
    shorthand: 'd',
    type: 'string',
    description: 'Debug mode (default off)',
    deprecated: false,
    multi: false,
  },
  {
    name: 'no-color',
    shorthand: null,
    type: 'string',
    description: 'No color mode (default off)',
    deprecated: false,
    multi: false,
  },
  {
    name: 'scope',
    shorthand: 'S',
    type: 'string',
    description: 'Set a custom scope',
    deprecated: false,
    multi: false,
  },
  {
    name: 'token',
    shorthand: 't',
    type: 'string',
    argument: 'TOKEN',
    description: 'Login token',
    deprecated: false,
    multi: false,
  },
];

const blankTableOptions = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: ' ',
};

export function calcLineLength(line: string[]) {
  return stripAnsi(lineToString(line)).length;
}

// Insert spaces in between non-whitespace items only
export function lineToString(line: string[]) {
  let string = '';
  for (let i = 0; i < line.length; i++) {
    if (i === line.length - 1) {
      string += line[i];
    } else {
      const curr = line[i];
      const next = line[i + 1];
      string += curr;
      if (curr.trim() !== '' && next.trim() !== '') {
        string += ' ';
      }
    }
  }
  return string;
}

export function outputArrayToString(outputArray: (string | null)[]) {
  return outputArray.filter(line => line !== null).join('');
}

/**
 * Example: `▲ vercel deploy [path] [options]`
 * @param command
 * @returns
 */
export function buildCommandSynopsisLine(command: Command) {
  const line: string[] = [
    INDENT,
    LOGO,
    chalk.bold(NAME),
    chalk.bold(command.name),
  ];
  if (command.arguments.length > 0) {
    for (const argument of command.arguments) {
      line.push(argument.required ? argument.name : `[${argument.name}]`);
    }
  }
  if (command.options.length > 0) {
    line.push('[options]');
  }

  line.push(SECTION_BREAK);
  return lineToString(line);
}

export function buildCommandOptionLines(
  commandOptions: CommandOption[],
  options: BuildHelpOutputOptions,
  sectionTitle: String
) {
  if (commandOptions.length === 0) {
    return null;
  }

  // Filter out deprecated and intentionally undocumented options
  commandOptions = commandOptions.filter(
    option => !option.deprecated && option.description !== undefined
  );

  // Sort command options alphabetically
  commandOptions.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );

  const columnWidths = [0, 0, 0];
  const rows: (string | undefined | TableCell)[][] = [];
  commandOptions.forEach((option: CommandOption) => {
    const shorthandCell = option.shorthand ? `-${option.shorthand},` : '';
    let longhandCell = `--${option.name}`;

    if (option.argument) {
      longhandCell += ` <${option.argument}>`;
    }

    columnWidths[0] = Math.max(
      columnWidths[0],
      shorthandCell.length + INDENT.repeat(1).length
    );
    columnWidths[1] = Math.max(
      columnWidths[1],
      longhandCell.length + INDENT.repeat(1).length
    );
    rows.push([
      shorthandCell,
      longhandCell,
      { content: option.description, wordWrap: true },
    ]);
  });

  columnWidths[2] =
    options.columns -
    columnWidths[2] -
    columnWidths[1] -
    INDENT.repeat(5).length;

  console.log(columnWidths);
  const table = new Table({
    // chars: blankTableOptions,
    colWidths: columnWidths,
    style: {
      'padding-left': INDENT.length,
    },
  });

  table.push(...rows);

  return [
    `${INDENT}${chalk.dim(sectionTitle)}:`,
    SECTION_BREAK,
    table.toString(),
    SECTION_BREAK,
  ].join('');
}

export function buildCommandExampleLines(command: Command) {
  const outputArray: string[] = [`${INDENT}${chalk.dim('Examples:')}`, ''];
  for (const example of command.examples) {
    const nameLine: string[] = [INDENT];
    nameLine.push(chalk.gray('-'));
    nameLine.push(example.name);
    outputArray.push(lineToString(nameLine));
    outputArray.push('');
    const buildValueLine = (value: string) => {
      return lineToString([INDENT, INDENT, chalk.cyan(`$ ${value}`)]);
    };
    if (Array.isArray(example.value)) {
      for (const line of example.value) {
        outputArray.push(buildValueLine(line));
      }
    } else {
      outputArray.push(buildValueLine(example.value));
    }
    outputArray.push('');
  }

  return outputArrayToString(outputArray);
}

function buildDescriptionLine(
  command: Command,
  options: BuildHelpOutputOptions
) {
  console.log(options.columns);
  const line: string[] = [
    // when width is === terminal width, overflow will occur.
    // subtacting 2 columns seems to resolve the problem.
    wrap(command.description, { indent: INDENT, width: options.columns - 4 }),
    SECTION_BREAK,
  ];
  return lineToString(line);
}

interface BuildHelpOutputOptions {
  columns: number;
}

export function buildHelpOutput(
  command: Command,
  options: BuildHelpOutputOptions
) {
  const outputArray: (string | null)[] = [
    NEWLINE,
    buildCommandSynopsisLine(command),
    buildDescriptionLine(command, options),
    buildCommandOptionLines(command.options, options, 'Options'),
    buildCommandOptionLines(globalCommandOptions, options, 'Global Options'),
    // buildCommandExampleLines(command),
  ];

  return outputArrayToString(outputArray);
}

export interface HelpOptions {
  columns?: number;
}

export function help(command: Command, options: HelpOptions) {
  return buildHelpOutput(command, {
    columns: options.columns ?? 80,
  });
}
