import './FlutterPreviewPanel.css';
import { useCallback, useEffect, useRef, useState } from 'react';

export type FlutterBuildPhase =
  | 'idle'
  | 'building'
  | 'ready'
  | 'error';

export interface FlutterPreviewPanelProps {
  /** Absolute path to the Flutter project on the daemon machine. */
  projectPath: string;
  /** Safe ID used as the build directory name — /^[a-zA-Z0-9_-]{1,64}$/. */
  projectName: string;
  /** Optional CSS class name for the outer wrapper. */
  className?: string;
  /** Called when a build succeeds and the preview URL is available. */
  onReady?: (previewUrl: string) => void;
  /** Called when a build fails. */
  onError?: (message: string) => void;
}

/** Parse a single SSE `data: {...}` line. Returns null for non-data lines. */
function parseSseLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith('data: ')) return null;
  try { return JSON.parse(line.slice(6)) as Record<string, unknown>; } catch { return null; }
}

/** Hook that manages the full Flutter build lifecycle for a given project. */
export function useFlutterBuild({
  projectPath,
  projectName,
}: Pick<FlutterPreviewPanelProps, 'projectPath' | 'projectName'>) {
  const [phase, setPhase] = useState<FlutterBuildPhase>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // On mount, probe status so the component shows existing build output
  // without requiring the user to re-build.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/flutter/status/${encodeURIComponent(projectName)}`);
        if (cancelled || !resp.ok) return;
        const data = await resp.json() as { status: string; previewUrl?: string };
        if (data.status === 'ready' && data.previewUrl) {
          setPhase('ready');
          setPreviewUrl(data.previewUrl);
        }
      } catch { /* daemon not up yet — silently ignore */ }
    })();
    return () => { cancelled = true; };
  }, [projectName]);

  const startBuild = useCallback(async () => {
    // Cancel any in-flight build first
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setPhase('building');
    setLogs([]);
    setPreviewUrl(null);
    setErrorMessage(null);

    let resp: Response;
    try {
      resp = await fetch('/api/flutter/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectPath, projectName }),
        signal: abort.signal,
      });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      setPhase('error');
      setErrorMessage(msg);
      return;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      setPhase('error');
      setErrorMessage(`HTTP ${resp.status}: ${text}`);
      return;
    }

    // Stream SSE
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const event = parseSseLine(line);
          if (!event) continue;
          if (event.type === 'log' && typeof event.log === 'string') {
            setLogs((prev) => [...prev, event.log as string]);
          } else if (event.type === 'done' && typeof event.previewUrl === 'string') {
            setPhase('ready');
            setPreviewUrl(event.previewUrl as string);
          } else if (event.type === 'error' && typeof event.message === 'string') {
            setPhase('error');
            setErrorMessage(event.message as string);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setPhase('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }
  }, [projectPath, projectName]);

  const cancelBuild = useCallback(async () => {
    abortRef.current?.abort();
    setPhase('idle');
    try {
      await fetch(`/api/flutter/preview/${encodeURIComponent(projectName)}`, {
        method: 'DELETE',
      });
    } catch { /* best-effort */ }
  }, [projectName]);

  return { phase, logs, previewUrl, errorMessage, startBuild, cancelBuild };
}

/**
 * Flutter Web Preview Panel
 *
 * Shows a Build button → streams logs → displays the compiled app in an iframe.
 *
 * Usage:
 * ```tsx
 * <FlutterPreviewPanel
 *   projectPath="/Users/me/my_flutter_app"
 *   projectName="my_flutter_app"
 * />
 * ```
 */
export function FlutterPreviewPanel({
  projectPath,
  projectName,
  className,
  onReady,
  onError,
}: FlutterPreviewPanelProps) {
  const { phase, logs, previewUrl, errorMessage, startBuild, cancelBuild } =
    useFlutterBuild({ projectPath, projectName });

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll build log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Fire callbacks
  useEffect(() => {
    if (phase === 'ready' && previewUrl) onReady?.(previewUrl);
  }, [phase, previewUrl, onReady]);

  useEffect(() => {
    if (phase === 'error' && errorMessage) onError?.(errorMessage);
  }, [phase, errorMessage, onError]);

  return (
    <div
      className={`flutter-preview-panel${className ? ` ${className}` : ''}`}
      data-phase={phase}
      data-testid="flutter-preview-panel"
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flutter-preview-toolbar">
        <span className="flutter-preview-title">
          <span className="flutter-preview-icon" aria-hidden="true">📱</span>
          Flutter Preview
          {projectName && (
            <code className="flutter-preview-name">{projectName}</code>
          )}
        </span>

        <div className="flutter-preview-actions">
          {phase === 'building' ? (
            <button
              id="flutter-cancel-build"
              className="flutter-btn flutter-btn-cancel"
              onClick={cancelBuild}
              type="button"
            >
              Cancel
            </button>
          ) : (
            <button
              id="flutter-start-build"
              className="flutter-btn flutter-btn-build"
              onClick={startBuild}
              type="button"
            >
              {phase === 'ready' ? 'Rebuild' : 'Build'}
            </button>
          )}

          {phase === 'ready' && previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="flutter-btn flutter-btn-open"
              id="flutter-open-preview"
            >
              Open ↗
            </a>
          )}
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      {phase === 'building' && (
        <div className="flutter-progress" role="progressbar" aria-label="Building…">
          <div className="flutter-progress-bar" />
        </div>
      )}

      {/* ── Build log ───────────────────────────────────────────────────── */}
      {(phase === 'building' || (phase === 'error' && logs.length > 0)) && (
        <div className="flutter-build-log" aria-label="Build log" aria-live="polite">
          {logs.map((line, i) => (
            <div key={i} className="flutter-log-line">{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {phase === 'error' && errorMessage && (
        <div className="flutter-error-banner" role="alert">
          <span className="flutter-error-icon" aria-hidden="true">⚠️</span>
          {errorMessage}
        </div>
      )}

      {/* ── Idle placeholder ────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="flutter-idle-placeholder">
          <div className="flutter-idle-graphic" aria-hidden="true">📱</div>
          <p className="flutter-idle-hint">
            Press <strong>Build</strong> to compile and preview the Flutter app.
          </p>
        </div>
      )}

      {/* ── Live preview iframe ─────────────────────────────────────────── */}
      {phase === 'ready' && previewUrl && (
        <div className="flutter-iframe-shell">
          <div className="flutter-device-frame" aria-label="Flutter app preview">
            <div className="flutter-device-notch" aria-hidden="true" />
            <iframe
              id="flutter-preview-iframe"
              src={previewUrl}
              title={`Flutter preview — ${projectName}`}
              className="flutter-iframe"
              allow="cross-origin-isolated"
            />
          </div>
        </div>
      )}
    </div>
  );
}
