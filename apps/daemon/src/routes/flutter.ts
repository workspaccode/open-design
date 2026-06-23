import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface RegisterFlutterRoutesDeps extends RouteDeps<'http' | 'paths'> {}

const PROJECT_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Active flutter build project names. */
const activeBuilds = new Set<string>();

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
  const { RUNTIME_DATA_DIR, PROJECTS_DIR } = ctx.paths;

  // ── POST /api/flutter/build ───────────────────────────────────────────────
  app.post('/api/flutter/build', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectPath = body.projectPath as string | undefined;
    const projectName = body.projectName as string | undefined;
    const projectId = body.projectId as string | undefined;

    let resolvedPath: string;
    if (typeof projectId === 'string' && typeof projectName === 'string' && PROJECT_NAME_RE.test(projectName)) {
      resolvedPath = path.join(PROJECTS_DIR, projectId, projectName);
      if (!fs.existsSync(resolvedPath)) {
        return sendApiError(res, 404, 'NOT_FOUND', `project '${projectName}' not found at resolved path`);
      }
    } else if (typeof projectPath === 'string' && path.isAbsolute(projectPath)) {
      if (!fs.existsSync(projectPath)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectPath does not exist');
      }
      resolvedPath = projectPath;
    } else {
      return sendApiError(res, 400, 'BAD_REQUEST', 'provide either (projectId + projectName) or (absolute projectPath)');
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

        // Resolve flutter binary from PATH
    const flutterPath = (() => {
      for (const p of (process.env.PATH ?? '').split(':')) {
        const candidate = path.join(p.replace(/\/?$/, ''), 'flutter');
        try { if (fs.statSync(candidate).isFile()) return candidate; } catch {}
      }
      return null;
    })();

    if (!flutterPath) {
      sendEvent({ type: 'error', message: 'Flutter not found in PATH', exitCode: -1 });
      if (!res.writableEnded) res.end();
      return;
    }

    sendEvent({ type: 'log', log: `[flutter] building with: ${flutterPath}` });
    sendEvent({ type: 'log', log: `[flutter] cwd: ${resolvedPath}` });

    execFile(flutterPath, ['build', 'web', '--release'], {
      cwd: resolvedPath,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      const all = (stdout + '\n' + stderr).trim();
      const lines = all.split('\n').filter(Boolean);
      for (const line of lines) sendEvent({ type: 'log', log: line });

      if (err === null) {
        // Copy output from <project>/build/web/ to flutter-builds/<projectName>/build/web/
        const sourceBuild = path.join(resolvedPath, 'build', 'web');
        const targetBuildDir = buildOutputDir(RUNTIME_DATA_DIR, projectName);
        try {
          if (fs.existsSync(targetBuildDir)) {
            fs.rmSync(targetBuildDir, { recursive: true, force: true });
          }
          fs.cpSync(sourceBuild, targetBuildDir, { recursive: true, force: true });
          sendEvent({ type: 'done', previewUrl: `/api/flutter/preview/${projectName}` });
        } catch (copyErr) {
          sendEvent({ type: 'error', message: `Build succeeded but copy failed: ${copyErr}`, exitCode: -1 });
        }
      } else {
        sendEvent({
          type: 'error',
          message: stderr.trim() || stdout.trim() || err.message,
          exitCode: err.code ?? 1,
        });
      }
      if (!res.writableEnded) res.end();
    });

    req.on('close', () => {
      if (!res.writableEnded) res.end();
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
    res.sendFile(indexFile, { dotfiles: 'allow' });
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

    res.sendFile(filePath, { dotfiles: 'allow' }, (err) => {
      if (err) {
        // SPA fallback — serve index.html for any missing route
        const indexFile = path.join(buildDir, 'index.html');
        if (fs.existsSync(indexFile)) {
          res.sendFile(indexFile, { dotfiles: 'allow' });
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
    if (activeBuilds.has(projectName)) {
      activeBuilds.delete(projectName);
    }
    const projectDir = path.join(flutterBuildsDir(RUNTIME_DATA_DIR), projectName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    res.json({ projectName, deleted: true });
  });
}
