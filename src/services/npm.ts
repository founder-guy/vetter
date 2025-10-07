import registryFetch from 'npm-registry-fetch';
import pickManifest, { type Packument } from 'npm-pick-manifest';
import type { PackageSnapshot, PackageIdentifier } from '../types.js';

type Maintainer = string | { name?: string; email?: string };

interface LegacyLicense {
  type?: string;
  url?: string;
}

/**
 * Parse package string into name and version
 * Supports: pkg, @scope/pkg, pkg@1.0.0, @scope/pkg@1.0.0
 * @throws {Error} If package identifier is invalid (empty or malformed)
 */
export function parsePackageString(input: string): PackageIdentifier {
  // Validate input is not empty or whitespace-only
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error(`Invalid package identifier: "${input}"`);
  }

  // Handle scoped packages
  const scopeMatch = trimmedInput.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
  if (scopeMatch) {
    return {
      name: scopeMatch[1],
      version: scopeMatch[2],
    };
  }

  // Handle non-scoped packages
  const parts = trimmedInput.split('@');
  if (parts.length === 1) {
    return { name: parts[0] };
  }

  // Join all but last part (in case name has @)
  const version = parts.pop();
  const name = parts.join('@');

  // Validate that parsed name is not empty
  if (!name.trim()) {
    throw new Error(`Invalid package identifier: "${input}"`);
  }

  return {
    name,
    version: version || undefined,
  };
}

/**
 * Fetch package metadata from npm registry
 */
export async function getPackageMetadata(
  name: string,
  version?: string,
  options?: import('../types.js').RegistryOptions
): Promise<PackageSnapshot> {
  try {
    // Encode package name for URL, preserving / in scoped packages
    const encodedName = encodeURIComponent(name).replace('%2F', '/');

    // Fetch full packument (all versions metadata)
    const packument = (await registryFetch.json(`/${encodedName}`, {
      preferOnline: true,
      ...(options?.registry ? { registry: options.registry } : {}),
    })) as Packument;

    // Resolve version/tag/semver range to specific version
    const spec = version || 'latest';
    const manifest = pickManifest(packument, spec);

    // Normalize license field (handle legacy object/array formats)
    let normalizedLicense: string | undefined;
    if (typeof manifest.license === 'string') {
      normalizedLicense = manifest.license;
    } else if (manifest.license && typeof manifest.license === 'object') {
      // Legacy format: { type: 'MIT', url: '...' }
      if ('type' in manifest.license) {
        normalizedLicense = manifest.license.type as string;
      }
    } else if (Array.isArray(manifest.licenses)) {
      // Legacy array format: [{ type: 'MIT' }, { type: 'Apache-2.0' }]
      const types = manifest.licenses
        .map((l: string | LegacyLicense) => (typeof l === 'string' ? l : l?.type))
        .filter(Boolean);
      normalizedLicense = types.length > 0 ? types.join(' OR ') : undefined;
    }

    return {
      name: manifest.name,
      version: manifest.version,
      publishedAt: new Date(packument.time?.[manifest.version] || Date.now()),
      maintainers: (manifest.maintainers || []).map((m: Maintainer) =>
        typeof m === 'string' ? m : m.name || m.email || 'unknown'
      ),
      dependencies: manifest.dependencies || {},
      devDependencies: manifest.devDependencies || {},
      unpackedSize: manifest.dist?.unpackedSize,
      description: manifest.description,
      license: normalizedLicense,
    };
  } catch (error: unknown) {
    const isErrorWithCode = (e: unknown): e is { code?: string; statusCode?: number } =>
      typeof e === 'object' && e !== null;

    if (isErrorWithCode(error)) {
      if (error.statusCode === 404 || error.code === 'E404') {
        throw new Error(`Package not found: ${name}`);
      }
      if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        throw new Error('Cannot reach npm registry. Check your internet connection.');
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch package metadata: ${message}`);
  }
}
