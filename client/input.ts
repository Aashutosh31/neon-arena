/**
 * Tracks only the keys the arena needs. Using `event.code` instead of
 * `event.key` keeps movement working on non-QWERTY layouts (W is always the
 * physical KeyW position).
 */
export class InputManager {
  private readonly keys = new Set<string>();
  private shooting = false;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    // Losing focus can swallow a keyup, leaving the player stuck moving.
    window.addEventListener("blur", this.onBlur);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Space would otherwise scroll the page; also stops browser hotkeys.
    if (event.code === "Space") {
      event.preventDefault();
    }
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.shooting = true;
    }
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.shooting = false;
    }
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.shooting = false;
  };

  isMovingForward(): boolean {
    return this.keys.has("KeyW");
  }

  isMovingBackward(): boolean {
    return this.keys.has("KeyS");
  }

  isMovingLeft(): boolean {
    return this.keys.has("KeyA");
  }

  isMovingRight(): boolean {
    return this.keys.has("KeyD");
  }

  isJumping(): boolean {
    return this.keys.has("Space");
  }

  isShooting(): boolean {
    return this.shooting;
  }

  /** Drop all held inputs, e.g. when pointer lock is released. */
  clear(): void {
    this.keys.clear();
    this.shooting = false;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("blur", this.onBlur);
    this.keys.clear();
    this.shooting = false;
  }
}
