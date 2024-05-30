#!/usr/bin/env node
import { isErrnoException, isError, errorToString } from '@vercel/error-utils';

try {
  // Test to see if cwd has been deleted before
  // importing 3rd party packages that might need cwd.
  process.cwd();
} catch (err: unknown) {
  if (isError(err) && err.message.includes('uv_cwd')) {
    // eslint-disable-next-line no-console
    console.error('Error: The current working directory does not exist.');
    process.exit(1);
  }
}

import { join } from 'path';
import { existsSync } from 'fs';
import { mkdirp } from 'fs-extra';
import chalk from 'chalk';
import epipebomb from 'epipebomb';
import getLatestVersion from './util/get-latest-version';
import { URL } from 'url';
import * as Sentry from '@sentry/node';
import hp from './util/humanize-path';
import commands from './commands';
import pkg from './util/pkg';
import { Output } from './util/output';
import cmd from './util/output/cmd';
import info from './util/output/info';
import error from './util/output/error';
import param from './util/output/param';
import highlight from './util/output/highlight';
import getArgs from './util/get-args';
import getUser from './util/get-user';
import getTeams from './util/teams/get-teams';
import Client from './util/client';
import { handleError } from './util/error';
import reportError from './util/report-error';
import getConfig from './util/get-config';
import * as configFiles from './util/config/files';
import getGlobalPathConfig from './util/config/global-path';
import {
  defaultAuthConfig,
  defaultGlobalConfig,
} from './util/config/get-default';
import * as ERRORS from './util/errors-ts';
import { APIError } from './util/errors-ts';
import { SENTRY_DSN } from './util/constants';
import getUpdateCommand from './util/get-update-command';
import { metrics, shouldCollectMetrics } from './util/metrics';
import { getCommandName, getTitleName } from './util/pkg-name';
import doLoginPrompt from './util/login/prompt';
import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';
import { VercelConfig } from '@vercel/client';
import { ProxyAgent } from 'proxy-agent';
import box from './util/output/box';
import { execExtension } from './util/extension/exec';
import { help } from './args';
import { updateCurrentTeamAfterLogin } from './util/login/update-current-team-after-login';

const VERCEL_DIR = getGlobalPathConfig();
const VERCEL_CONFIG_PATH = configFiles.getConfigFilePath();
const VERCEL_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath();

const GLOBAL_COMMANDS = new Set(['help']);

epipebomb();

// Configure the error reporting system
Sentry.init({
  dsn: SENTRY_DSN,
  release: `vercel-cli@${pkg.version}`,
  environment: 'stable',
});

let client: Client;
let output: Output;
let { isTTY } = process.stdout;
let debug: (s: string) => void = () => {};
let apiUrl = 'https://api.vercel.com';

const main = async () => {
  if (process.env.FORCE_TTY === '1') {
    isTTY = true;
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
  }

  let argv;

  try {
    argv = getArgs(
      process.argv,
      {
        '--version': Boolean,
        '-v': '--version',
        '--debug': Boolean,
        '-d': '--debug',
      },
      { permissive: true }
    );
  } catch (err: unknown) {
    handleError(err);
    return 1;
  }

  const isDebugging = argv['--debug'];
  const isNoColor = argv['--no-color'];

  output = new Output(process.stderr, {
    debug: isDebugging,
    noColor: isNoColor,
  });

  debug = output.debug;

  const localConfigPath = argv['--local-config'];
  let localConfig: VercelConfig | Error | undefined = await getConfig(
    output,
    localConfigPath
  );

  if (localConfig instanceof ERRORS.CantParseJSONFile) {
    output.error(`Couldn't parse JSON file ${localConfig.meta.file}.`);
    return 1;
  }

  if (localConfig instanceof ERRORS.CantFindConfig) {
    if (localConfigPath) {
      output.error(
        `Couldn't find a project configuration file at \n    ${localConfig.meta.paths.join(
          ' or\n    '
        )}`
      );
      return 1;
    } else {
      localConfig = undefined;
    }
  }

  if (localConfig instanceof Error) {
    output.prettyError(localConfig);
    return 1;
  }

  // The second argument to the command can be:
  //
  //  * a path to deploy (as in: `vercel path/`)
  //  * a subcommand (as in: `vercel ls`)
  const targetOrSubcommand = argv._[2];
  const subSubCommand = argv._[3];

  // If empty, leave this code here for easy adding of beta commands later
  const betaCommands: string[] = [];
  if (betaCommands.includes(targetOrSubcommand)) {
    output.print(
      `${chalk.grey(
        `${getTitleName()} CLI ${
          pkg.version
        } ${targetOrSubcommand} (beta) — https://vercel.com/feedback`
      )}\n`
    );
  } else {
    output.print(`${chalk.grey(`${getTitleName()} CLI ${pkg.version}`)}\n`);
  }

  // Handle `--version` directly
  if (!targetOrSubcommand && argv['--version']) {
    // eslint-disable-next-line no-console
    console.log(pkg.version);
    return 0;
  }

  // Handle bare `-h` directly
  const bareHelpOption = !targetOrSubcommand && argv['--help'];
  const bareHelpSubcommand = targetOrSubcommand === 'help' && !subSubCommand;
  if (bareHelpOption || bareHelpSubcommand) {
    output.print(help());
    return 2;
  }

  // Ensure that the Vercel global configuration directory exists
  try {
    await mkdirp(VERCEL_DIR);
  } catch (err: unknown) {
    output.error(
      `An unexpected error occurred while trying to create the global directory "${hp(
        VERCEL_DIR
      )}" ${errorToString(err)}`
    );
    return 1;
  }

  let config: GlobalConfig;
  try {
    config = configFiles.readConfigFile();
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      config = defaultGlobalConfig;
      try {
        configFiles.writeToConfigFile(config);
      } catch (err: unknown) {
        output.error(
          `An unexpected error occurred while trying to save the config to "${hp(
            VERCEL_CONFIG_PATH
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    } else {
      output.error(
        `An unexpected error occurred while trying to read the config in "${hp(
          VERCEL_CONFIG_PATH
        )}" ${errorToString(err)}`
      );
      return 1;
    }
  }

  let authConfig: AuthConfig;
  try {
    authConfig = configFiles.readAuthConfigFile();
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      authConfig = defaultAuthConfig;
      try {
        configFiles.writeToAuthConfigFile(authConfig);
      } catch (err: unknown) {
        output.error(
          `An unexpected error occurred while trying to write the auth config to "${hp(
            VERCEL_AUTH_CONFIG_PATH
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    } else {
      output.error(
        `An unexpected error occurred while trying to read the auth config in "${hp(
          VERCEL_AUTH_CONFIG_PATH
        )}" ${errorToString(err)}`
      );
      return 1;
    }
  }

  if (typeof argv['--api'] === 'string') {
    apiUrl = argv['--api'];
  } else if (config && config.api) {
    apiUrl = config.api;
  }

  try {
    new URL(apiUrl);
  } catch (err: unknown) {
    output.error(`Please provide a valid URL instead of ${highlight(apiUrl)}.`);
    return 1;
  }

  // Shared API `Client` instance for all sub-commands to utilize
  client = new Client({
    agent: new ProxyAgent({ keepAlive: true }),
    apiUrl,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: output.stream,
    output,
    config,
    authConfig,
    localConfig,
    localConfigPath,
    argv: process.argv,
  });

  // The `--cwd` flag is respected for all sub-commands
  if (argv['--cwd']) {
    client.cwd = argv['--cwd'];
  }
  const { cwd } = client;

  // Gets populated to the subcommand name when a built-in is
  // provided, otherwise it remains undefined for an extension
  let subcommand: string | undefined = undefined;

  // Check if we are deploying something
  if (targetOrSubcommand) {
    const targetPath = join(cwd, targetOrSubcommand);
    const targetPathExists = existsSync(targetPath);
    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) ||
      commands.has(targetOrSubcommand);

    if (
      targetPathExists &&
      subcommandExists &&
      !argv['--cwd'] &&
      !process.env.NOW_BUILDER
    ) {
      output.warn(
        `Did you mean to deploy the subdirectory "${targetOrSubcommand}"? ` +
          `Use \`vc --cwd ${targetOrSubcommand}\` instead.`
      );
    }

    if (subcommandExists) {
      debug(`user supplied known subcommand: "${targetOrSubcommand}"`);
      subcommand = targetOrSubcommand;
    } else {
      debug('user supplied a possible target for deployment or an extension');
    }
  } else {
    debug('user supplied no target, defaulting to deploy');
    subcommand = 'deploy';
  }

  if (subcommand === 'help') {
    subcommand = subSubCommand || 'deploy';
    client.argv.push('-h');
  }

  const subcommandsWithoutToken = ['login', 'logout', 'help', 'init', 'build'];

  // Prompt for login if there is no current token
  if (
    (!authConfig || !authConfig.token) &&
    !client.argv.includes('-h') &&
    !client.argv.includes('--help') &&
    !argv['--token'] &&
    subcommand &&
    !subcommandsWithoutToken.includes(subcommand)
  ) {
    if (isTTY) {
      output.log(info(`No existing credentials found. Please log in:`));
      const result = await doLoginPrompt(client);

      // The login function failed, so it returned an exit code
      if (typeof result === 'number') {
        return result;
      }

      // When `result` is a string it's the user's authentication token.
      // It needs to be saved to the configuration file.
      client.authConfig.token = result.token;

      await updateCurrentTeamAfterLogin(client, output, result.teamId);

      configFiles.writeToAuthConfigFile(client.authConfig);
      configFiles.writeToConfigFile(client.config);

      output.debug(`Saved credentials in "${hp(VERCEL_DIR)}"`);
    } else {
      output.prettyError({
        message:
          'No existing credentials found. Please run ' +
          `${getCommandName('login')} or pass ${param('--token')}`,
        link: 'https://err.sh/vercel/no-credentials-found',
      });
      return 1;
    }
  }

  if (typeof argv['--token'] === 'string' && subcommand === 'switch') {
    output.prettyError({
      message: `This command doesn't work with ${param(
        '--token'
      )}. Please use ${param('--scope')}.`,
      link: 'https://err.sh/vercel/no-token-allowed',
    });

    return 1;
  }

  if (typeof argv['--token'] === 'string') {
    const token = argv['--token'];

    if (token.length === 0) {
      output.prettyError({
        message: `You defined ${param('--token')}, but it's missing a value`,
        link: 'https://err.sh/vercel/missing-token-value',
      });

      return 1;
    }

    const invalid = token.match(/(\W)/g);
    if (invalid) {
      const notContain = Array.from(new Set(invalid)).sort();
      output.prettyError({
        message: `You defined ${param(
          '--token'
        )}, but its contents are invalid. Must not contain: ${notContain
          .map(c => JSON.stringify(c))
          .join(', ')}`,
        link: 'https://err.sh/vercel/invalid-token-value',
      });

      return 1;
    }

    client.authConfig = { token, skipWrite: true };

    // Don't use team from config if `--token` was set
    if (client.config && client.config.currentTeam) {
      delete client.config.currentTeam;
    }
  }

  if (argv['--team']) {
    output.warn(
      `The ${param('--team')} option is deprecated. Please use ${param(
        '--scope'
      )} instead.`
    );
  }

  let targetCommand =
    typeof subcommand === 'string' ? commands.get(subcommand) : undefined;
  const scope = argv['--scope'] || argv['--team'] || localConfig?.scope;

  if (
    typeof scope === 'string' &&
    targetCommand !== 'login' &&
    targetCommand !== 'dev' &&
    targetCommand !== 'build' &&
    !(targetCommand === 'teams' && subSubCommand !== 'invite')
  ) {
    let user = null;

    try {
      user = await getUser(client);
    } catch (err: unknown) {
      if (err instanceof Error) {
        output.debug(err.stack || err.toString());
      }

      if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
        output.prettyError({
          message: `You do not have access to the specified account`,
          link: 'https://err.sh/vercel/scope-not-accessible',
        });

        return 1;
      }

      // eslint-disable-next-line no-console
      console.error(error('Not able to load user'));
      return 1;
    }

    if (user.id === scope || user.email === scope || user.username === scope) {
      if (user.version === 'northstar') {
        output.error('You cannot set your Personal Account as the scope.');
        return 1;
      }

      delete client.config.currentTeam;
    } else {
      let teams = [];

      try {
        teams = await getTeams(client);
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === 'not_authorized') {
          output.prettyError({
            message: `You do not have access to the specified team`,
            link: 'https://err.sh/vercel/scope-not-accessible',
          });

          return 1;
        }

        if (isErrnoException(err) && err.code === 'rate_limited') {
          output.prettyError({
            message:
              'Rate limited. Too many requests to the same endpoint: /teams',
          });

          return 1;
        }

        // eslint-disable-next-line no-console
        console.error(error('Not able to load teams'));
        return 1;
      }

      const related =
        teams && teams.find(team => team.id === scope || team.slug === scope);

      if (!related) {
        output.prettyError({
          message: 'The specified scope does not exist',
          link: 'https://err.sh/vercel/scope-not-existent',
        });

        return 1;
      }

      client.config.currentTeam = related.id;
    }
  }

  let exitCode;
  let metric: ReturnType<typeof metrics> | undefined;
  const eventCategory = 'Exit Code';

  try {
    const start = Date.now();

    if (!targetCommand) {
      // Set this for the metrics to record it at the end
      targetCommand = argv._[2];

      // Try to execute as an extension
      try {
        exitCode = await execExtension(
          client,
          targetCommand,
          argv._.slice(3),
          cwd
        );
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === 'ENOENT') {
          // Fall back to `vc deploy <dir>`
          targetCommand = subcommand = 'deploy';
        } else {
          throw err;
        }
      }
    }

    // Not using an `else` here because if the CLI extension
    // was not found then we have to fall back to `vc deploy`
    if (subcommand) {
      let func: any;
      switch (targetCommand) {
        case 'alias':
          func = require('./commands/alias').default;
          break;
        case 'bisect':
          func = require('./commands/bisect').default;
          break;
        case 'build':
          func = require('./commands/build').default;
          break;
        case 'certs':
          func = require('./commands/certs').default;
          break;
        case 'deploy':
          func = require('./commands/deploy').default;
          break;
        case 'dev':
          func = require('./commands/dev').default;
          break;
        case 'dns':
          func = require('./commands/dns').default;
          break;
        case 'domains':
          func = require('./commands/domains').default;
          break;
        case 'env':
          func = require('./commands/env').default;
          break;
        case 'git':
          func = require('./commands/git').default;
          break;
        case 'init':
          func = require('./commands/init').default;
          break;
        case 'inspect':
          func = require('./commands/inspect').default;
          break;
        case 'link':
          func = require('./commands/link').default;
          break;
        case 'list':
          func = require('./commands/list').default;
          break;
        case 'logs':
          func = require('./commands/logs').default;
          break;
        case 'login':
          func = require('./commands/login').default;
          break;
        case 'logout':
          func = require('./commands/logout').default;
          break;
        case 'project':
          func = require('./commands/project').default;
          break;
        case 'promote':
          func = require('./commands/promote').default;
          break;
        case 'pull':
          func = require('./commands/pull').default;
          break;
        case 'redeploy':
          func = require('./commands/redeploy').default;
          break;
        case 'remove':
          func = require('./commands/remove').default;
          break;
        case 'rollback':
          func = require('./commands/rollback').default;
          break;
        case 'teams':
          func = require('./commands/teams').default;
          break;
        case 'whoami':
          func = require('./commands/whoami').default;
          break;
        default:
          func = null;
          break;
      }

      if (!func || !targetCommand) {
        const sub = param(subcommand);
        output.error(`The ${sub} subcommand does not exist`);
        return 1;
      }

      if (func.default) {
        func = func.default;
      }

      exitCode = await func(client);
    }
    const end = Date.now() - start;

    if (shouldCollectMetrics) {
      const category = 'Command Invocation';

      if (!metric) metric = metrics();
      metric
        .timing(category, targetCommand, end, pkg.version)
        .event(category, targetCommand, pkg.version)
        .send();
    }
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOTFOUND') {
      // Error message will look like the following:
      // "request to https://api.vercel.com/v2/user failed, reason: getaddrinfo ENOTFOUND api.vercel.com"
      const matches = /getaddrinfo ENOTFOUND (.*)$/.exec(err.message || '');
      if (matches && matches[1]) {
        const hostname = matches[1];
        output.error(
          `The hostname ${highlight(
            hostname
          )} could not be resolved. Please verify your internet connectivity and DNS configuration.`
        );
      }
      if (typeof err.stack === 'string') {
        output.debug(err.stack);
      }
      return 1;
    }

    if (isErrnoException(err) && err.code === 'ECONNRESET') {
      // Error message will look like the following:
      // request to https://api.vercel.com/v2/user failed, reason: socket hang up
      const matches = /request to https:\/\/(.*?)\//.exec(err.message || '');
      const hostname = matches?.[1];
      if (hostname) {
        output.error(
          `Connection to ${highlight(
            hostname
          )} interrupted. Please verify your internet connectivity and DNS configuration.`
        );
      }
      return 1;
    }

    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.prettyError(err);
      return 1;
    }

    if (err instanceof APIError && 400 <= err.status && err.status <= 499) {
      err.message = err.serverMessage;
      output.prettyError(err);
      return 1;
    }

    if (shouldCollectMetrics) {
      if (!metric) metric = metrics();
      metric
        .event(eventCategory, '1', pkg.version)
        .exception(errorToString(err))
        .send();
    }

    // If there is a code we should not consider the error unexpected
    // but instead show the message. Any error that is handled by this should
    // actually be handled in the sub command instead. Please make sure
    // that happens for anything that lands here. It should NOT bubble up to here.
    if (isErrnoException(err)) {
      if (typeof err.stack === 'string') {
        output.debug(err.stack);
      }
      output.prettyError(err);
    } else {
      await reportError(Sentry, client, err);

      // Otherwise it is an unexpected error and we should show the trace
      // and an unexpected error message
      output.error(`An unexpected error occurred in ${subcommand}: ${err}`);
    }

    return 1;
  }

  if (shouldCollectMetrics) {
    if (!metric) metric = metrics();
    metric.event(eventCategory, `${exitCode}`, pkg.version).send();
  }

  return exitCode;
};

const handleRejection = async (err: any) => {
  debug('handling rejection');

  if (err) {
    if (err instanceof Error) {
      await handleUnexpected(err);
    } else {
      // eslint-disable-next-line no-console
      console.error(error(`An unexpected rejection occurred\n  ${err}`));
      await reportError(Sentry, client, err);
    }
  } else {
    // eslint-disable-next-line no-console
    console.error(error('An unexpected empty rejection occurred'));
  }

  process.exit(1);
};

const handleUnexpected = async (err: Error) => {
  const { message } = err;

  // We do not want to render errors about Sentry not being reachable
  if (message.includes('sentry') && message.includes('ENOTFOUND')) {
    debug(`Sentry is not reachable: ${err}`);
    return;
  }

  // eslint-disable-next-line no-console
  console.error(error(`An unexpected error occurred!\n${err.stack}`));
  await reportError(Sentry, client, err);

  process.exit(1);
};

process.on('unhandledRejection', handleRejection);
process.on('uncaughtException', handleUnexpected);

main()
  .then(async exitCode => {
    // Print update information, if available
    if (isTTY && !process.env.NO_UPDATE_NOTIFIER) {
      // Check if an update is available. If so, `latest` will contain a string
      // of the latest version, otherwise `undefined`.
      const latest = getLatestVersion({
        output,
        pkg,
      });
      if (latest) {
        const changelog = 'https://github.com/vercel/vercel/releases';
        const errorMsg =
          exitCode && exitCode !== 2
            ? chalk.magenta(
                `\n\nThe latest update ${chalk.italic(
                  'may'
                )} fix any errors that occurred.`
              )
            : '';
        output.print(
          box(
            `Update available! ${chalk.gray(`v${pkg.version}`)} ≫ ${chalk.green(
              `v${latest}`
            )}
Changelog: ${output.link(changelog, changelog, { fallback: false })}
Run ${chalk.cyan(cmd(await getUpdateCommand()))} to update.${errorMsg}`
          )
        );
        output.print('\n\n');
      }
    }

    process.exitCode = exitCode;
  })
  .catch(handleUnexpected);
