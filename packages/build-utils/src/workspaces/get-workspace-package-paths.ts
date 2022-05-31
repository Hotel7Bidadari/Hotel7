import _path from 'path';
import yaml from 'js-yaml';
import glob from 'glob';
import { DetectorFilesystem } from '../detectors/filesystem';
import { Workspace } from './get-workspaces';
import { getGlobFs } from '../fs/get-glob-fs';

const path = _path.posix;

interface GetPackagePathOptions {
  fs: DetectorFilesystem;
}

export interface GetWorkspacePackagePathsOptions extends GetPackagePathOptions {
  fs: DetectorFilesystem;
  workspace: Workspace;
}

export async function getWorkspacePackagePaths({
  fs,
  workspace,
}: GetWorkspacePackagePathsOptions): Promise<string[]> {
  const { type, rootPath: workspaceRootPath } = workspace;
  const workspaceFs = fs.chdir(workspaceRootPath);

  let results: string[] = [];

  switch (type) {
    case 'yarn':
    case 'npm':
      results = await getPackageJsonWorkspacePackagePaths({ fs: workspaceFs });
      break;
    case 'pnpm':
      results = await getPnpmWorkspacePackagePaths({ fs: workspaceFs });
      break;
    default:
      throw new Error(`Unknown workspace implementation: ${type}`);
  }

  return results.map(packagePath => {
    return path.join(workspaceRootPath, path.dirname(packagePath));
  });
}

type PackageJsonWithWorkspace = {
  workspaces:
    | {
        packages: string[];
        noHoist?: string[];
      }
    | string[];
};

type PnpmWorkspaces = {
  packages: string[];
};

async function getPackagePaths(
  packages: string[],
  fs: DetectorFilesystem
): Promise<string[]> {
  return (
    await Promise.all(
      packages.map(
        packageGlob =>
          new Promise<string[]>((resolve, reject) => {
            glob(
              path.join(packageGlob, 'package.json').replace(/\\/g, '/'),
              {
                cwd: '/',
                fs: getGlobFs(fs),
              },
              (err, matches) => {
                if (err) reject(err);
                else resolve(matches);
              }
            );
          })
      )
    )
  ).flat();
}

async function getPackageJsonWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<string[]> {
  const packageJsonAsBuffer = await fs.readFile('package.json');
  const { workspaces } = JSON.parse(
    packageJsonAsBuffer.toString()
  ) as PackageJsonWithWorkspace;

  let packages: string[] = [];

  if (Array.isArray(workspaces)) {
    packages = workspaces;
  } else {
    packages = workspaces.packages;
  }

  return getPackagePaths(packages, fs);
}

async function getPnpmWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<string[]> {
  const pnpmWorkspaceAsBuffer = await fs.readFile('pnpm-workspace.yaml');
  const { packages } = yaml.load(
    pnpmWorkspaceAsBuffer.toString()
  ) as PnpmWorkspaces;

  return getPackagePaths(packages, fs);
}
