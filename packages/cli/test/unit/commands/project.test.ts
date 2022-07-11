import { join } from 'path';
import fs from 'fs-extra';
import projects from '../../../src/commands/project';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { client } from '../../mocks/client';
import { Project } from '../../../src/types';
import { readOutputStream } from '../../helpers/read-output-stream';
import {
  pluckIdentifiersFromDeploymentList,
  parseSpacedTableRow,
} from '../../helpers/parse-table';

describe('project', () => {
  describe('list', () => {
    it('should list deployments under a user', async () => {
      const user = useUser();
      const project = useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls');
      await projects(client);

      const output = await readOutputStream(client, 2);
      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[0]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[2]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[3]);
      data.pop();

      expect(org).toEqual(user.username);
      expect(header).toEqual(['name', 'updated']);
      expect(data).toEqual([project.project.name]);
    });
    it('should list deployments for a team', async () => {
      useUser();
      const team = useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
      });

      client.config.currentTeam = team[0].id;
      client.setArgv('project', 'ls');
      await projects(client);

      const output = await readOutputStream(client, 2);
      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[0]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[2]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[3]);
      data.pop();

      expect(org).toEqual(team[0].slug);
      expect(header).toEqual(['name', 'updated']);
      expect(data).toEqual([project.project.name]);
    });
  });
  describe('add', () => {
    it('should add a project', async () => {
      const user = useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'add', 'test-project');
      await projects(client);

      const project: Project = await client.fetch(`/v8/projects/test-project`);
      expect(project).toBeDefined();

      expect(client.stderr).toOutput(
        `Success! Project test-project added (${user.username})`
      );
    });
  });
  describe('rm', () => {
    it('should remove a project', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'rm', 'test-project');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        `The project test-project will be removed permanently.`
      );
      client.stdin.write('y\n');

      const exitCode = await projectsPromise;
      expect(exitCode).toEqual(0);
    });
  });
  describe('connect', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/commands/projects/connect', name);

    it('connects an unlinked project', async () => {
      const cwd = fixture('unlinked');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'unlinked',
          name: 'unlinked',
        });
        client.setArgv('projects', 'connect');
        const projectsPromise = projects(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Which scope should contain your project?'
        );
        client.stdin.write('\r');

        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        const exitCode = await projectsPromise;
        await expect(client.stderr).toOutput(
          'Connected GitHub repository user/repo!'
        );

        expect(exitCode).toEqual(0);

        const project: Project = await client.fetch(`/v8/projects/unlinked`);
        expect(project.link).toMatchObject({
          type: 'github',
          repo: 'user/repo',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        });
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should fail when there is no git config', async () => {
      const cwd = fixture('no-git-config');
      try {
        process.chdir(cwd);
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'no-git-config',
          name: 'no-git-config',
        });
        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          `Error! No local git repo found. Run \`git clone <url>\` to clone a remote Git repository first.\n`
        );
      } finally {
        process.chdir(originalCwd);
      }
    });
    it('should fail when there is no remote url', async () => {
      const cwd = fixture('no-remote-url');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'no-remote-url',
          name: 'no-remote-url',
        });
        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          `Error! No remote origin URL found in your Git config. Make sure you've connected your local Git repo to a Git provider first.\n`
        );
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should fail when the remote url is bad', async () => {
      const cwd = fixture('bad-remote-url');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'bad-remote-url',
          name: 'bad-remote-url',
        });
        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          `Error! Failed to parse Git repo data from the following remote URL in your Git config: bababooey\n`
        );
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should connect a repo to a project that is not already connected', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'new-connection',
          name: 'new-connection',
        });
        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);

        const project: Project = await client.fetch(
          `/v8/projects/new-connection`
        );
        expect(project.link).toMatchObject({
          type: 'github',
          repo: 'user/repo',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        });
        expect(client.stderr).toOutput(
          `> Connected GitHub repository user/repo!\n`
        );
        expect(exitCode).toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should replace an old connection with a new one', async () => {
      const cwd = fixture('existing-connection');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        const project = useProject({
          ...defaultProject,
          id: 'existing-connection',
          name: 'existing-connection',
        });
        project.project.link = {
          type: 'github',
          repo: 'repo',
          org: 'user',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };

        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);

        const newProjectData: Project = await client.fetch(
          `/v8/projects/existing-connection`
        );
        expect(newProjectData.link).toMatchObject({
          type: 'github',
          repo: 'user2/repo2',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        });
        await expect(client.stderr).toOutput(
          `> Connected GitHub repository user2/repo2!\n`
        );
        expect(exitCode).toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should exit when an already-connected repo is connected', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        const project = useProject({
          ...defaultProject,
          id: 'new-connection',
          name: 'new-connection',
        });
        project.project.link = {
          type: 'github',
          repo: 'repo',
          org: 'user',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };
        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          `> user/repo is already connected to your project.\n`
        );
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should fail when it cannot find the repository', async () => {
      const cwd = fixture('invalid-repo');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'invalid-repo',
          name: 'invalid-repo',
        });

        client.setArgv('projects', 'connect', '--confirm');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          `Failed to link laksfj/asdgklsadkl. Make sure there aren't any typos and that you have access to the repository if it's private.`
        );
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
  });
  describe('disconnect', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/commands/projects/connect', name);

    it('should disconnect a repository', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        const project = useProject({
          ...defaultProject,
          id: 'new-connection',
          name: 'new-connection',
        });
        project.project.link = {
          type: 'github',
          repo: 'repo',
          org: 'user',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };
        client.setArgv('project', 'disconnect');
        const projectsPromise = projects(client);

        await expect(client.stderr).toOutput(
          `Are you sure you want to disconnect user/repo from your project?`
        );
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Disconnected user/repo.');

        const newProjectData: Project = await client.fetch(
          `/v8/projects/new-connection`
        );
        expect(newProjectData.link).toBeUndefined();

        const exitCode = await projectsPromise;
        expect(exitCode).toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should fail if there is no repository to disconnect', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'new-connection',
          name: 'new-connection',
        });

        client.setArgv('project', 'disconnect');
        const projectsPromise = projects(client);

        await expect(client.stderr).toOutput(
          'No Git repository connected. Run `vercel project connect` to connect one.'
        );

        const exitCode = await projectsPromise;
        expect(exitCode).toEqual(1);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
  });
});
