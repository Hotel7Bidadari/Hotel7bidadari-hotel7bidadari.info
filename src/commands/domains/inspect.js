import ms from 'ms';
import chalk from 'chalk';
import table from 'text-table';
import format from 'date-fns/format';
import dnsTable from '../../util/dns-table';
import strlen from '../../util/strlen';
import cmd from '../../util/output/cmd';
import getScope from '../../util/get-scope';
import Now from '../../util';
import { DomainNotFound, DomainPermissionDenied } from '../../util/errors';

import getDomainByName from '../../util/domains/get-domain-by-name';

async function inspect(ctx, opts, args, output) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];

  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  const now = new Now({ apiUrl, token, debug, currentTeam });
  const [domainName] = args;

  if (!domainName) {
    output.error(`${cmd('now domains inspect <domain>')} expects one argument`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now domains inspect <domain>`'
      )}`
    );
    return 1;
  }

  output.debug(`Fetching domain info`);
  const domain = await getDomainByName(output, now, contextName, domainName);
  if (domain instanceof DomainNotFound) {
    output.error(`Domain not found by "${domainName}" under ${chalk.bold(contextName)}`);
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    output.error(`You don't have access to the domain ${domainName} under ${chalk.bold(contextName)}`)
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  if (!domain.verified) {
    output.warn(`This domain is not verified. To verify it you should either:`);
    output.print(`  ${chalk.gray('-')} Change your domain nameservers to the intended set shown below.\n`);
    output.print(`  ${chalk.gray('-')} Add a DNS TXT record with the name and value detailed below.\n`);
    output.print(`  Then run ${cmd('now domains verify <domain>')} or just wait for a confirmation email.\n`);
  }

  output.print('\n');
  output.print(chalk.bold('  Domain Info\n'));
  output.print(`    ${chalk.dim('id')}\t\t\t${domain.id}\n`);
  output.print(`    ${chalk.dim('name')}\t\t${domain.name}\n`);
  output.print(`    ${chalk.dim('serviceType')}\t\t${domain.serviceType}\n`);
  output.print(`    ${chalk.dim('createdAt')}\t\t${formatDate(domain.createdAt)}\n`);
  output.print(`    ${chalk.dim('expiresAt')}\t\t${formatDate(domain.expiresAt)}\n`);
  output.print(`    ${chalk.dim('boughtAt')}\t\t${formatDate(domain.boughtAt)}\n`);
  output.print(`    ${chalk.dim('nsVerifiedAt')}\t${formatDate(domain.nsVerifiedAt)}\n`)
  output.print(`    ${chalk.dim('txtVerifiedAt')}\t${formatDate(domain.txtVerifiedAt)}\n`)
  output.print(`    ${chalk.dim('cdnEnabled')}\t\t${domain.cdnEnabled}\n`);
  output.print(`    ${chalk.dim('suffix')}\t\t${domain.suffix}\n`);
  output.print(`    ${chalk.dim('aliases')}\t\t${domain.aliases.length}\n`);
  output.print(`    ${chalk.dim('certs')}\t\t${domain.certs.length}\n`);
  output.print('\n');

  output.print(chalk.bold('  Nameservers\n'));
  output.print(`${formatNSTable(domain.intendedNameServers, domain.nameServers)}\n`);
  output.print('\n');

  output.print(chalk.bold('  Verification Record\n'));
  output.print(`${dnsTable([['_now', 'TXT', domain.verificationRecord]], {extraSpace: '  '})}\n`);
  return null;
}

function formatNSTable(intendedNameServers, currentNameServers) {
  const maxLength = Math.max(intendedNameServers.length, currentNameServers.length);
  const rows = [];

  for (let i = 0; i < maxLength; i++) {
    rows.push([
      intendedNameServers[i] || '',
      currentNameServers[i] || '',
    ])
  }

  return (
    table([
      [chalk.gray('Intended Nameservers'), chalk.gray('Current Nameservers')],
      ...rows
    ], {
      align: ['l', 'l', 'l'],
      hsep: ' '.repeat(4),
      stringLength: strlen
    }).replace(/^(.*)/gm, `    $1`)
  )
}

function formatDate(dateStr) {
  if (!dateStr) {
    return chalk.gray('-');
  }

  const date = new Date(dateStr)
  const diff = date - Date.now();

  return diff < 0
    ? `${format(date, 'DD MMMM YYYY HH:mm:ss')} ${chalk.gray(`[${ms(-diff)  } ago]`)}`
    : `${format(date, 'DD MMMM YYYY HH:mm:ss')} ${chalk.gray(`[in ${  ms(diff)}]`)}`;
}

export default inspect;
