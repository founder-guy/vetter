import pacote from 'pacote';
import type { PackageSnapshot, PackageIdentifier } from '../types.js';

/**
 * Parse package string into name and version
 * Supports: pkg, @scope/pkg, pkg@1.0.0, @scope/pkg@1.0.0
 */
export function parsePackageString(input: string): PackageIdentifier {
  // Handle scoped packages
  const scopeMatch = input.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
  if (scopeMatch) {
    return {
      name: scopeMatch[1],
      version: scopeMatch[2],
    };
  }

  // Handle non-scoped packages
  const parts = input.split('@');
  if (parts.length === 1) {
    return { name: parts[0] };
  }

  // Join all but last part (in case name has @)
  const version = parts.pop();
  const name = parts.join('@');

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
  version?: string
): Promise<PackageSnapshot> {
  try {
    const spec = version ? `${name}@${version}` : name;
    const manifest = await pacote.manifest(spec, {
      fullMetadata: true,
      preferOnline: true,
    });

    return {
      name: manifest.name,
      version: manifest.version,
      publishedAt: new Date(manifest.time?.[manifest.version] || Date.now()),
      maintainers: (manifest.maintainers || []).map((m: any) =>
        typeof m === 'string' ? m : m.name || m.email
      ),
      dependencies: manifest.dependencies || {},
      devDependencies: manifest.devDependencies || {},
      unpackedSize: manifest.dist?.unpackedSize,
      description: manifest.description,
    };
  } catch (error: any) {
    if (error.code === 'E404') {
      throw new Error(`Package not found: ${name}`);
    }
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      throw new Error('Cannot reach npm registry. Check your internet connection.');
    }
    throw new Error(`Failed to fetch package metadata: ${error.message}`);
  }
}
