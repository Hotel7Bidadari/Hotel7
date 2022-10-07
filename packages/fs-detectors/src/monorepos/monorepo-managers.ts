import type { Framework } from '@vercel/frameworks';

/**
 * The supported list of monorepo managers.
 *
 * This list is designed to work with the @see {@link detectFramework} function.
 *
 * @example
 *   import { monorepoManagers as frameworkList } from '@vercel/fs-detectors'
 *   import { detectFramework } from '@vercel/fs-detectors'
 *
 *   const fs = new GitDetectorFilesystem(...)
 *   detectFramwork({ fs, frameworkList }) // returns the 'slug' field if detected, otherwise null
 *
 */
export type MonorepoManager = Omit<
  Framework,
  'description' | 'getOutputDirName'
> & { darkLogo?: string };
export const monorepoManagers: Array<MonorepoManager> = [
  {
    name: 'Turborepo',
    slug: 'turbo',
    logo: 'https://api-frameworks.vercel.sh/monorepo-logos/turborepo.svg',
    darkLogo:
      'https://api-frameworks.vercel.sh/monorepo-logos/turborepo-dark.svg',
    detectors: {
      some: [
        {
          path: 'turbo.json',
        },
        {
          path: 'package.json',
          matchContent: '"turbo":\\s*{[^}]*.+[^}]*}',
        },
      ],
    },
    settings: {
      buildCommand: {
        placeholder: 'Turborepo default',
        value: null,
      },
      outputDirectory: {
        value: null,
      },
      installCommand: {
        value: null,
      },
      devCommand: {
        value: null,
      },
    },
  },
  {
    name: 'Nx',
    slug: 'nx',
    logo: 'https://api-frameworks.vercel.sh/monorepo-logos/nx.svg',
    detectors: {
      every: [
        {
          path: 'nx.json',
        },
      ],
    },
    settings: {
      buildCommand: {
        placeholder: 'Nx default',
        value: null,
      },
      outputDirectory: {
        placeholder: 'Nx default',
      },
      installCommand: {
        value: null,
      },
      devCommand: {
        value: null,
      },
    },
  },
  {
    name: 'Rush',
    slug: 'rush',
    logo: 'https://api-frameworks.vercel.sh/monorepo-logos/rush.svg',
    detectors: {
      every: [
        {
          path: 'rush.json',
        },
      ],
    },
    settings: {
      buildCommand: {
        placeholder: 'Rush default',
        value: null,
      },
      outputDirectory: {
        placeholder: 'Rush default',
      },
      installCommand: {
        placeholder: 'Rush default',
      },
      devCommand: {
        value: null,
      },
    },
  },
];

export default monorepoManagers;
