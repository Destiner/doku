import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ProjectMeta } from "./storage";
import {
  generateDocId,
  generateDocName,
  getDocPath,
  getMetadata,
  getProjectDir,
  resolveDocName,
  setMetadata,
} from "./storage";

export { generateDocId };

export interface StorageProvider {
  getMetadata(): ProjectMeta;
  setMetadata(meta: ProjectMeta): void;

  getDocContent(docName: string): string | null;
  setDocContent(docName: string, content: string): void;
  deleteDoc(docName: string): void;
  docExists(docName: string): boolean;

  getDocMtime(docName: string): number | null;
  getDocFilePath(docName: string): string;

  generateDocName(): string;

  resolveDocName(docId: string): string | null;

  dispose(): void;
}

export class FileSystemStorage implements StorageProvider {
  private projectDir: string;

  constructor(cwd: string) {
    this.projectDir = getProjectDir(cwd);
  }

  getMetadata(): ProjectMeta {
    return getMetadata(this.projectDir);
  }

  setMetadata(meta: ProjectMeta): void {
    setMetadata(this.projectDir, meta);
  }

  getDocContent(docName: string): string | null {
    const p = getDocPath(this.projectDir, docName);
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf-8");
  }

  setDocContent(docName: string, content: string): void {
    writeFileSync(getDocPath(this.projectDir, docName), content, "utf-8");
  }

  deleteDoc(docName: string): void {
    const p = getDocPath(this.projectDir, docName);
    if (existsSync(p)) unlinkSync(p);
  }

  docExists(docName: string): boolean {
    return existsSync(getDocPath(this.projectDir, docName));
  }

  getDocMtime(docName: string): number | null {
    const p = getDocPath(this.projectDir, docName);
    try {
      return statSync(p).mtimeMs;
    } catch {
      return null;
    }
  }

  getDocFilePath(docName: string): string {
    return getDocPath(this.projectDir, docName);
  }

  generateDocName(): string {
    return generateDocName(this.projectDir);
  }

  resolveDocName(docId: string): string | null {
    return resolveDocName(this.getMetadata(), docId);
  }

  dispose(): void {
    // no-op — persistent storage
  }
}

export class EphemeralStorage implements StorageProvider {
  private meta: ProjectMeta = { docs: {} };
  private tempDir: string;

  constructor() {
    this.tempDir = mkdtempSync(join(tmpdir(), "doku-playground-"));
    mkdirSync(this.tempDir, { recursive: true });
  }

  getMetadata(): ProjectMeta {
    return this.meta;
  }

  setMetadata(meta: ProjectMeta): void {
    this.meta = meta;
  }

  getDocContent(docName: string): string | null {
    const p = join(this.tempDir, `${docName}.md`);
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf-8");
  }

  setDocContent(docName: string, content: string): void {
    writeFileSync(join(this.tempDir, `${docName}.md`), content, "utf-8");
  }

  deleteDoc(docName: string): void {
    const p = join(this.tempDir, `${docName}.md`);
    if (existsSync(p)) unlinkSync(p);
  }

  docExists(docName: string): boolean {
    return existsSync(join(this.tempDir, `${docName}.md`));
  }

  getDocMtime(docName: string): number | null {
    try {
      return statSync(join(this.tempDir, `${docName}.md`)).mtimeMs;
    } catch {
      return null;
    }
  }

  getDocFilePath(docName: string): string {
    return join(this.tempDir, `${docName}.md`);
  }

  generateDocName(): string {
    return generateDocName(this.tempDir);
  }

  resolveDocName(docId: string): string | null {
    return this.meta.docs[docId]?.name ?? null;
  }

  dispose(): void {
    try {
      rmSync(this.tempDir, { recursive: true, force: true });
      console.log(`[playground] cleaned up temp dir: ${this.tempDir}`);
    } catch (err) {
      console.error(`[playground] cleanup failed:`, err);
    }
  }
}
