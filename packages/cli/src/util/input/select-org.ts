import Client from '../client';
import inquirer from 'inquirer';
import getUser from '../get-user';
import getTeams from '../get-teams';
import { User, Team, Org } from '../../types';

type Choice = { name: string; value: Org };

export default async function selectOrg(
  client: Client,
  question: string,
  autoConfirm?: boolean,
  scope?: string
): Promise<Org> {
  require('./patch-inquirer');
  const {
    output,
    config: { currentTeam },
  } = client;

  output.spinner('Loading scopes…', 1000);
  let user: User;
  let teams: Team[];
  try {
    [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  } finally {
    output.stopSpinner();
  }

  const choices: Choice[] = [
    {
      name: user.name || user.username,
      value: { type: 'user', id: user.uid, slug: user.username },
    },
    ...teams.map<Choice>(team => ({
      name: team.name || team.slug,
      value: { type: 'team', id: team.id, slug: team.slug },
    })),
  ];

  // If an explicit `scope` was provided then
  // try to match the correct `org` choince
  if (scope) {
    const choice = choices.find(
      ({ value }) => value.id === scope || value.slug === scope
    );
    if (!choice) {
      throw new Error('bad');
    }
    return choice.value;
  }

  const defaultOrgIndex = teams.findIndex(team => team.id === currentTeam) + 1;

  if (autoConfirm) {
    return choices[defaultOrgIndex].value;
  }

  const answers = await inquirer.prompt({
    type: 'list',
    name: 'org',
    message: question,
    choices,
    default: defaultOrgIndex,
  });

  const org = answers.org;
  return org;
}
