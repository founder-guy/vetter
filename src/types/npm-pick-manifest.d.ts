declare module 'npm-pick-manifest' {
  export interface Packument {
    name: string;
    versions: Record<string, Manifest>;
    'dist-tags': Record<string, string>;
    time: Record<string, string>;
    [key: string]: unknown;
  }

  export interface Manifest {
    name: string;
    version: string;
    description?: string;
    maintainers?: Array<{ name?: string; email?: string } | string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dist?: {
      unpackedSize?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  function pickManifest(packument: Packument, spec: string): Manifest;

  export default pickManifest;
}
