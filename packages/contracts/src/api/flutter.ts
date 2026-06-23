export interface FlutterBuildRequest {
  /** Absolute path to the Flutter project on the daemon machine. */
  projectPath: string;
  /** Safe identifier used as directory name; must match /^[a-zA-Z0-9_-]{1,64}$/. */
  projectName: string;
}

// ---------- SSE events streamed during build ----------

export interface FlutterBuildLogEvent {
  type: 'log';
  log: string;
}

export interface FlutterBuildDoneEvent {
  type: 'done';
  /** e.g. /api/flutter/preview/my_app */
  previewUrl: string;
}

export interface FlutterBuildErrorEvent {
  type: 'error';
  message: string;
  exitCode: number;
}

export type FlutterBuildSseEvent =
  | FlutterBuildLogEvent
  | FlutterBuildDoneEvent
  | FlutterBuildErrorEvent;

// ---------- Status endpoint response ----------

export interface FlutterBuildStatusResponse {
  projectName: string;
  status: 'building' | 'ready' | 'error' | 'not_found';
  previewUrl?: string;
}
