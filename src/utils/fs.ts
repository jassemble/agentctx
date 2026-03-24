import { access, readFile, stat } from 'node:fs/promises';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFileContent(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

export async function getLastModified(path: string): Promise<Date> {
  const s = await stat(path);
  return s.mtime;
}
