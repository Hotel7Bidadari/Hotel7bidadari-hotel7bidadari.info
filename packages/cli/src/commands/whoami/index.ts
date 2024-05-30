import { help } from '../help';
import { whoamiCommand } from './command';

import getScope from '../../util/get-scope';
import { parseArguments } from '../../util/get-args';
import Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';

export default async function whoami(client: Client): Promise<number> {
  const { output } = client;
  const flagsSpecification = getFlagsSpecification(whoamiCommand.options);
  const parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  parsedArgs.args = parsedArgs.args.slice(1);

  if (parsedArgs.flags['--help'] || parsedArgs.args[0] === 'help') {
    output.print(help(whoamiCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { contextName } = await getScope(client, { getTeam: false });

  if (client.stdout.isTTY) {
    output.log(contextName);
  } else {
    // If stdout is not a TTY, then only print the username
    // to support piping the output to another file / exe
    client.stdout.write(`${contextName}\n`);
  }

  return 0;
}
