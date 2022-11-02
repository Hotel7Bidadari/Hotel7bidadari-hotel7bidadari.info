import chalk from 'chalk';
import logo from '../util/output/logo';
import { getPkgName } from '../util/pkg-name';

interface Command {
  name: string;
  aliases?: Array<string>;
  subcommands?: Array<Subcommand>;
  options?: Array<Option>;
  description: string;
  arguments?: Array<string>;
}

type Subcommand = Omit<Command, 'subcommands'>;

interface Option {
  name: string;
  description: string;
  shorthand?: string;
  argument?: string;
}

const globalOptions: Array<Option> = [
  {
    name: 'cwd',
    description: 'Specify a working directory to execute CLI command from',
    argument: 'path',
  },
  {
    name: 'debug',
    description: 'Provide a more verbose output',
    shorthand: 'd',
  },
  {
    name: 'force',
    description: 'Skip the build cache',
  },
  {
    name: 'global-config',
    description: 'Set the path to the global `.vercel` directory',
    shorthand: 'Q',
    argument: 'path',
  },
  {
    name: 'help',
    description: 'Display more information about the command',
    shorthand: 'h',
  },
  {
    name: 'local-config',
    description: 'Set the path to the local `vercel.json` file',
    shorthand: 'A',
    argument: 'path',
  },
  {
    name: 'scope',
    description: 'Specify which team to execute CLI command from',
    shorthand: 'S',
    argument: 'team-slug',
  },
  {
    name: 'token',
    description:
      'Specify an authorization token when executing the CLI command',
    shorthand: 't',
    argument: 'token',
  },
];

const nextOption: Option = {
  name: 'next',
  description: 'Show next page of results',
  shorthand: 'N',
};

const yesOption: Option = {
  name: 'yes',
  description: 'Skip the confirmation prompt',
  shorthand: 'y',
};

const commands: Array<Command> = [
  {
    name: 'alias',
    aliases: ['aliases', 'ln'],
    description: 'Manages your domain aliases',
    subcommands: [
      {
        name: 'ls',
        description: 'Show all aliases',
        options: [nextOption],
      },
      {
        name: 'set',
        description: 'Create a new alias',
        arguments: ['deployment', 'alias'],
      },
      {
        name: 'rm',
        description: 'Remove an alias using its hostname',
        arguments: ['alias'],
        options: [yesOption],
      },
    ],
  },
  {
    name: 'bisect',
    description: '',
  },
  {
    name: 'build',
    description: '',
  },
  {
    name: 'certs',
    aliases: ['cert'],
    description: '',
  },
  {
    name: 'deploy',
    description: 'Performs a deployment',
  },
  {
    name: 'dev',
    aliases: ['develop'],
    description: 'Starts a local development server',
  },
  {
    name: 'dns',
    description: '',
  },
  {
    name: 'domains',
    aliases: ['domain'],
    description: '',
  },
  {
    name: 'env',
    description: 'Manage the Environment Variables for your current Project',
  },
  {
    name: 'git',
    description: 'Manage the Git provider repository for your current Project',
  },
  {
    name: 'help',
    description: 'Display help output for [cmd]',
  },
  {
    name: 'init',
    description: 'Initialize an example project',
  },
  {
    name: 'inspect',
    description: '',
  },
  {
    name: 'link',
    description: '',
  },
  {
    name: 'list',
    aliases: ['ls'],
    description: '',
  },
  {
    name: 'login',
    description: '',
  },
  {
    name: 'logout',
    description: '',
  },
  {
    name: 'logs',
    aliases: ['log'],
    description: '',
  },
  {
    name: 'project',
    aliases: ['projects'],
    description: '',
  },
  {
    name: 'pull',
    description: '',
  },
  {
    name: 'remove',
    aliases: ['rm'],
    description: '',
  },
  {
    name: 'secrets',
    aliases: ['secret'],
    description: '',
  },
  {
    name: 'switch',
    description: '',
  },
  {
    name: 'teams',
    aliases: ['team'],
    description: '',
  },
  {
    name: 'whoami',
    description: '',
  },
];

class StringBuilder {
  _str: string;
  _col: number;
  _tabLength: number;
  _tabValue: string;
  constructor() {
    this._str = '';
    this._col = 0;
    this._tabLength = 0;
    this._tabValue = '  ';
  }

  append(str: string) {
    this._str += str;
    this._col += str.length;
  }

  appendIndent() {
    const indent = this._tabValue.repeat(this._tabLength);
    this._str += indent;
    this._col += indent.length;
  }

  appendLine(str: string) {
    this.appendIndent();
    this.append(str);
    this.addNewline();
  }

  addNewline() {
    this._str += '\n';
    this._col = 0;
  }

  incrementTabLength() {
    this._tabLength += 1;
  }

  decrementTabLength() {
    this._tabLength -= 1;
  }

  addWhitespaceToCol(targetCol: number) {
    console.log(this);
    const dif = targetCol - 1 - this._col;
    this._str += ' '.repeat(dif);
    this._col += dif;
  }

  resetTab() {
    this._tabLength = 0;
  }

  toString() {
    return this._str;
  }
}

// const globalOptionsString = globalOptions.reduce(
//   (str, { name, description, shorthand, argument }) => {
//     str.addWhitespaceUpTo(6);
//     if (shorthand) {
//       str.append(`-${shorthand}, `)
//     }
//     str.append(`--${name}`);
//     str.addWhitespaceUpTo(28)
//     if (argument) {
//       str.append(`[${argument}]`);
//     }
//     str.addWhitespaceUpTo(42);
//     str.append(description);
//     str.addNewline();
//     return str
//   },
//   new StringBuilder()
// );

// console.log(globalOptionsString.toString());

// const commandListString = commands.reduce(
//   (str, command) => {
//     str.addWhitespaceUpTo(6);
//     str.append(command.name);
//     if (command.aliases && command.aliases.length > 0) {
//       str.append('|');
//       str.append(command.aliases.join('|'));
//     }
//     str.addWhitespaceUpTo(42);
//     str.append(command.description);
//     str.addNewline();
//     return str;
//   },
//   new StringBuilder()
// );

// console.log(commandListString.toString());

function addOption(str: StringBuilder, option: Option) {
  str.appendIndent();
  if (option.shorthand) {
    str.append(`-${option.shorthand}, `);
  }
  str.append(`--${option.name}`);
  str.addWhitespaceToCol(20);
  if (option.argument) {
    str.append(`[${option.argument}]`);
  }
  str.addWhitespaceToCol(40);
  str.append(option.description);
  str.addNewline();
}

function addSubcommand(str: StringBuilder, subcommand: Subcommand) {
  str.appendIndent();
  str.append(`${subcommand.name}`);

  if (subcommand.aliases && subcommand.aliases.length > 0) {
    str.append('|');
    str.append(subcommand.aliases.join('|'));
  }

  str.addWhitespaceToCol(20);

  if (subcommand.arguments && subcommand.arguments.length > 0) {
    str.append(subcommand.arguments.map(argument => `<${argument}>`).join(' '));
  }

  str.addWhitespaceToCol(40);

  str.append(subcommand.description);

  str.addNewline();

  if (subcommand.options && subcommand.options.length > 0) {
    str.appendLine(chalk.dim('Options:'));
    str.incrementTabLength();
    for (const option of subcommand.options) {
      addOption(str, option);
    }
    str.decrementTabLength();
  }

  str.addNewline();
}

function createDetailedHelpOutput(command: Command) {
  const str = new StringBuilder();
  str.appendLine(
    `${chalk.bold(`${logo} ${getPkgName()} ${command.name}`)} [${
      command.subcommands
        ? command.subcommands.map(subcommand => subcommand.name).join(', ')
        : ''
    }] <options>`
  );
  str.addNewline();
  if (command.subcommands && command.subcommands.length > 0) {
    str.appendLine(chalk.dim('Commands:'));
    str.addNewline();
    str.incrementTabLength();
    for (const subcommand of command.subcommands) {
      addSubcommand(str, subcommand);
    }
  }
  return str.toString();
}

const aliasString = createDetailedHelpOutput(commands[0]);

console.log(aliasString);
// console.log(globalOptionsString.toString());

export const help = () => `
  ${chalk.bold(`${logo} ${getPkgName()}`)} [options] <command | path>

  ${chalk.dim('Commands:')}

    ${chalk.dim('Basic')}

      deploy               [path]      Performs a deployment ${chalk.bold(
        '(default)'
      )}
      dev                              Start a local development server
      env                              Manages the Environment Variables for your current Project
      git                              Manage Git provider repository for your current Project
      help                 [cmd]       Displays complete help for [cmd]
      init                 [example]   Initialize an example project
      inspect              [id]        Displays information related to a deployment
      link                 [path]      Link local directory to a Vercel Project
      ls | list            [app]       Lists deployments
      login                [email]     Logs into your account or creates a new one
      logout                           Logs out of your account
      pull                 [path]      Pull your Project Settings from the cloud
      switch               [scope]     Switches between teams and your personal account

    ${chalk.dim('Advanced')}

      alias                [cmd]       Manages your domain aliases
      bisect                           Use binary search to find the deployment that introduced a bug
      certs                [cmd]       Manages your SSL certificates
      dns                  [name]      Manages your DNS records
      domains              [name]      Manages your domain names
      logs                 [url]       Displays the logs for a deployment
      projects                         Manages your Projects
      rm | remove          [id]        Removes a deployment
      secrets              [name]      Manages your global Secrets, for use in Environment Variables
      teams                            Manages your teams
      whoami                           Shows the username of the currently logged in user

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    --cwd                          Current working directory
    -V, --platform-version         Set the platform version to deploy to
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
  'FILE'
)}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
  'DIR'
)}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -f, --force                    Force a new deployment even if nothing has changed
    --with-cache                   Retain build cache when using "--force"
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline(
  'TOKEN'
)}        Login token
    -p, --public                   Deployment is public (${chalk.dim(
      '`/_src`'
    )} is exposed)
    -e, --env                      Include an env var during run time (e.g.: ${chalk.dim(
      '`-e KEY=value`'
    )}). Can appear many times.
    -b, --build-env                Similar to ${chalk.dim(
      '`--env`'
    )} but for build time only.
    -m, --meta                     Add metadata for the deployment (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.
    -S, --scope                    Set a custom scope
    --regions                      Set default regions to enable the deployment on
    --prod                         Create a production deployment
    -y, --yes                      Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan(`$ ${getPkgName()}`)}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan(`$ ${getPkgName()} /usr/src/project`)}

  ${chalk.gray('–')} Deploy with Environment Variables

    ${chalk.cyan(
      `$ ${getPkgName()} -e NODE_ENV=production -e SECRET=@mysql-secret`
    )}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
  '`list`'
)}

    ${chalk.cyan(`$ ${getPkgName()} help list`)}

`;
