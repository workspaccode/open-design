import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface RegisterFlutterRoutesDeps extends RouteDeps<'http' | 'paths'> {}

const PROJECT_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Active flutter build processes, keyed by projectName. */
const activeBuilds = new Map<string, ChildProcess>();

function flutterBuildsDir(runtimeDataDir: string): string {
  return path.join(runtimeDataDir, 'flutter-builds');
}

function buildOutputDir(runtimeDataDir: string, projectName: string): string {
  return path.join(flutterBuildsDir(runtimeDataDir), projectName, 'build', 'web');
}

/**
 * Flutter Web Build & Preview routes.
 *
 * POST   /api/flutter/build                        — start a build, stream SSE logs
 * GET    /api/flutter/status/:projectName          — JSON build status
 * GET    /api/flutter/preview/:projectName         — serve built index.html
 * GET    /api/flutter/preview/:projectName/*       — serve any static build asset
 * DELETE /api/flutter/preview/:projectName         — kill active build + delete output
 */
export function registerFlutterRoutes(app: Express, ctx: RegisterFlutterRoutesDeps): void {
  const { sendApiError } = ctx.http;
  const { RUNTIME_DATA_DIR } = ctx.paths;

  // ── POST /api/flutter/build ───────────────────────────────────────────────
  app.post('/api/flutter/build', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectPath = body.projectPath as string | undefined;
    const projectName = body.projectName as string | undefined;

    if (typeof projectPath !== 'string' || !path.isAbsolute(projectPath)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'projectPath must be an absolute path');
    }
    if (!fs.existsSync(projectPath)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'projectPath does not exist');
    }
    if (typeof projectName !== 'string' || !PROJECT_NAME_RE.test(projectName)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'projectName must match /^[a-zA-Z0-9_-]{1,64}$/');
    }
    if (activeBuilds.has(projectName)) {
      return sendApiError(res, 409, 'CONFLICT', `build for '${projectName}' is already running`);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: object): void => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const proc = spawn('flutter', ['build', 'web', '--release'], {
      cwd: projectPath,
      shell: false,
      env: { ...process.env },
    });

    activeBuilds.set(projectName, proc);

    const handleChunk = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) sendEvent({ type: 'log', log: line });
      }
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);

    proc.on('close', (code) => {
      activeBuilds.delete(projectName);
      if (code === 0) {
        sendEvent({
          type: 'done',
          previewUrl: `/api/flutter/preview/${projectName}`,
        });
      } else {
        sendEvent({ type: 'error', message: 'flutter build web failed', exitCode: code ?? 1 });
      }
      res.end();
    });

    proc.on('error', (err) => {
      activeBuilds.delete(projectName);
      sendEvent({ type: 'error', message: err.message, exitCode: -1 });
      res.end();
    });

    // If the client disconnects mid-build, kill the process.
    req.on('close', () => {
      if (!res.writableEnded) {
        proc.kill('SIGTERM');
        activeBuilds.delete(projectName);
      }
    });
  });

  // ── GET /api/flutter/status/:projectName ─────────────────────────────────
  app.get('/api/flutter/status/:projectName', (req, res) => {
    const { projectName } = req.params;
    if (!PROJECT_NAME_RE.test(projectName)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'invalid projectName');
    }
    if (activeBuilds.has(projectName)) {
      return res.json({ projectName, status: 'building' });
    }
    const indexFile = path.join(buildOutputDir(RUNTIME_DATA_DIR, projectName), 'index.html');
    if (fs.existsSync(indexFile)) {
      return res.json({
        projectName,
        status: 'ready',
        previewUrl: `/api/flutter/preview/${projectName}`,
      });
    }
    res.json({ projectName, status: 'not_found' });
  });

  // ── GET /api/flutter/preview/:projectName (index.html) ───────────────────
  app.get('/api/flutter/preview/:projectName', (req, res) => {
    const { projectName } = req.params;
    if (!PROJECT_NAME_RE.test(projectName)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'invalid projectName');
    }
    const buildDir = buildOutputDir(RUNTIME_DATA_DIR, projectName);
    const indexFile = path.join(buildDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
      return sendApiError(res, 404, 'NOT_FOUND', 'preview not built yet — run POST /api/flutter/build first');
    }
    res.sendFile(indexFile);
  });

  // ── GET /api/flutter/preview/:projectName/* (static assets) ──────────────
  app.get('/api/flutter/preview/:projectName/*rest', (req, res) => {
    const { projectName } = req.params;
    if (!PROJECT_NAME_RE.test(projectName)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'invalid projectName');
    }
    const buildDir = buildOutputDir(RUNTIME_DATA_DIR, projectName);
    if (!fs.existsSync(buildDir)) {
      return sendApiError(res, 404, 'NOT_FOUND', 'preview not built yet');
    }
    // Strip /api/flutter/preview/:projectName prefix to get the sub-path
    const prefix = `/api/flutter/preview/${projectName}`;
    const subPath = (req.path.startsWith(prefix) ? req.path.slice(prefix.length) : req.path) || '/';
    const filePath = path.resolve(buildDir, subPath.replace(/^\//, ''));

    // Security: prevent path traversal
    if (!filePath.startsWith(buildDir)) {
      return sendApiError(res, 403, 'FORBIDDEN', 'access denied');
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        // SPA fallback — serve index.html for any missing route
        const indexFile = path.join(buildDir, 'index.html');
        if (fs.existsSync(indexFile)) {
          res.sendFile(indexFile);
        } else {
          sendApiError(res, 404, 'NOT_FOUND', 'file not found');
        }
      }
    });
  });

  // ── DELETE /api/flutter/preview/:projectName ─────────────────────────────
  app.delete('/api/flutter/preview/:projectName', (req, res) => {
    const { projectName } = req.params;
    if (!PROJECT_NAME_RE.test(projectName)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'invalid projectName');
    }
    const proc = activeBuilds.get(projectName);
    if (proc) {
      proc.kill('SIGTERM');
      activeBuilds.delete(projectName);
    }
    const projectDir = path.join(flutterBuildsDir(RUNTIME_DATA_DIR), projectName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    res.json({ projectName, deleted: true });
  });
}
