import { VERCEL } from '@vercel-internals/constants';
import cmd from './cmd';
export function getCommandName (subcommands?: string): string {
  let vercel = VERCEL;
  if (subcommands) {
    vercel = `${vercel} ${subcommands}`;
  }
  return cmd(vercel);
}
