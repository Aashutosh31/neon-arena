import type { WeaponId } from "../shared/types";
import { WEAPON_ORDER } from "../shared/weapons";

export const IS_TOUCH_DEVICE =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0);

export class InputManager {
  private readonly keys = new Set<string>();
  private shooting = false;
  private aiming = false;
  private enabled = false;
  private moveX = 0;
  private moveY = 0;
  private lookX = 0;
  private lookY = 0;
  private reloadRequested = false;
  private switchRequested = false;
  private scopeRequested = false;
  private weaponSlotRequested: WeaponId | null = null;

  private readonly moveBase =
    document.querySelector<HTMLDivElement>("#touch-move");
  private readonly moveKnob =
    document.querySelector<HTMLDivElement>("#touch-move-knob");
  private readonly lookZone =
    document.querySelector<HTMLDivElement>("#touch-look");
  private readonly fireButton =
    document.querySelector<HTMLButtonElement>("#touch-fire");
  private readonly adsButton =
    document.querySelector<HTMLButtonElement>("#touch-ads");
  private readonly jumpButton =
    document.querySelector<HTMLButtonElement>("#touch-jump");
  private readonly reloadButton =
    document.querySelector<HTMLButtonElement>("#touch-reload");
  private readonly switchButton =
    document.querySelector<HTMLButtonElement>("#touch-switch");
  private readonly scopeButton =
    document.querySelector<HTMLButtonElement>("#touch-scope");

  private movePointer: number | null = null;
  private lookPointer: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("contextmenu", this.onContextMenu);

    this.moveBase?.addEventListener("pointerdown", this.onMoveDown);
    this.moveBase?.addEventListener("pointermove", this.onMoveMove);
    this.moveBase?.addEventListener("pointerup", this.onMoveUp);
    this.moveBase?.addEventListener("pointercancel", this.onMoveUp);
    this.lookZone?.addEventListener("pointerdown", this.onLookDown);
    this.lookZone?.addEventListener("pointermove", this.onLookMove);
    this.lookZone?.addEventListener("pointerup", this.onLookUp);
    this.lookZone?.addEventListener("pointercancel", this.onLookUp);

    this.bindHold(this.fireButton, (held) => {
      this.shooting = held;
    });
    this.bindHold(this.adsButton, (held) => {
      this.aiming = held;
    });
    this.bindPress(this.jumpButton, () => {
      this.keys.add("Space");
      window.setTimeout(() => this.keys.delete("Space"), 90);
    });
    this.bindPress(this.reloadButton, () => {
      this.reloadRequested = true;
    });
    this.bindPress(this.switchButton, () => {
      this.switchRequested = true;
    });
    this.bindPress(this.scopeButton, () => {
      this.scopeRequested = true;
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) {
      return;
    }
    if (
      event.code === "Space" ||
      event.code === "KeyW" ||
      event.code === "KeyA" ||
      event.code === "KeyS" ||
      event.code === "KeyD" ||
      event.code === "KeyR" ||
      event.code === "KeyQ"
    ) {
      event.preventDefault();
    }
    if (event.repeat) {
      return;
    }
    this.keys.add(event.code);
    if (event.code === "KeyR") {
      this.reloadRequested = true;
    }
    if (event.code === "KeyQ") {
      this.switchRequested = true;
    }
    if (event.code === "KeyV") {
      this.scopeRequested = true;
    }
    if (event.code.startsWith("Digit")) {
      const slot = Number(event.code.slice(5));
      const weapon = WEAPON_ORDER[slot - 1];
      if (weapon) {
        this.weaponSlotRequested = weapon;
      }
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (
      !this.enabled ||
      document.pointerLockElement === null ||
      this.lookPointer !== null
    ) {
      return;
    }
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.enabled) {
      return;
    }
    if (event.button === 0) {
      this.shooting = true;
    } else if (event.button === 2) {
      this.aiming = true;
    }
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.shooting = false;
    } else if (event.button === 2) {
      this.aiming = false;
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.enabled || document.pointerLockElement === null) {
      return;
    }
    if (Math.abs(event.deltaY) < 1) {
      return;
    }
    event.preventDefault();
    this.scopeRequested = true;
  };

  private onBlur = (): void => {
    this.clear();
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private onMoveDown = (event: PointerEvent): void => {
    if (!this.enabled || this.movePointer !== null) {
      return;
    }
    this.movePointer = event.pointerId;
    this.moveBase?.setPointerCapture(event.pointerId);
    this.updateMove(event);
  };

  private onMoveMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointer) {
      return;
    }
    this.updateMove(event);
  };

  private onMoveUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointer) {
      return;
    }
    this.movePointer = null;
    this.moveX = 0;
    this.moveY = 0;
    if (this.moveKnob) {
      this.moveKnob.style.transform = "translate(-50%, -50%)";
    }
  };

  private updateMove(event: PointerEvent): void {
    if (!this.moveBase) {
      return;
    }
    const rect = this.moveBase.getBoundingClientRect();
    const radius = rect.width * 0.42;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    this.moveX = dx / radius;
    this.moveY = dy / radius;
    if (this.moveKnob) {
      this.moveKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  private onLookDown = (event: PointerEvent): void => {
    if (!this.enabled || this.lookPointer !== null) {
      return;
    }
    this.lookPointer = event.pointerId;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
    this.lookZone?.setPointerCapture(event.pointerId);
  };

  private onLookMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointer) {
      return;
    }
    this.lookX += event.clientX - this.lookLastX;
    this.lookY += event.clientY - this.lookLastY;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
  };

  private onLookUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointer) {
      return;
    }
    this.lookPointer = null;
  };

  private bindHold(
    element: HTMLElement | null,
    setter: (held: boolean) => void,
  ): void {
    if (!element) {
      return;
    }
    const press = (event: PointerEvent): void => {
      if (!this.enabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture(event.pointerId);
      setter(true);
    };
    const release = (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      setter(false);
    };
    element.addEventListener("pointerdown", press);
    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
    element.addEventListener("lostpointercapture", () => setter(false));
  }

  private bindPress(element: HTMLElement | null, action: () => void): void {
    if (!element) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (!this.enabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      action();
    });
  }

  isMovingForward(): boolean {
    return this.keys.has("KeyW") || this.moveY < -0.28;
  }

  isMovingBackward(): boolean {
    return this.keys.has("KeyS") || this.moveY > 0.28;
  }

  isMovingLeft(): boolean {
    return this.keys.has("KeyA") || this.moveX < -0.28;
  }

  isMovingRight(): boolean {
    return this.keys.has("KeyD") || this.moveX > 0.28;
  }

  isJumping(): boolean {
    return this.keys.has("Space");
  }

  isShooting(): boolean {
    return this.shooting;
  }

  isAiming(): boolean {
    return this.aiming;
  }

  consumeLookDelta(): { x: number; y: number } {
    const delta = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  consumeReload(): boolean {
    const requested = this.reloadRequested;
    this.reloadRequested = false;
    return requested;
  }

  consumeSwitch(): boolean {
    const requested = this.switchRequested;
    this.switchRequested = false;
    return requested;
  }

  consumeScope(): boolean {
    const requested = this.scopeRequested;
    this.scopeRequested = false;
    return requested;
  }

  consumeWeaponSlot(): WeaponId | null {
    const requested = this.weaponSlotRequested;
    this.weaponSlotRequested = null;
    return requested;
  }

  clear(): void {
    this.keys.clear();
    this.shooting = false;
    this.aiming = false;
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.movePointer = null;
    this.lookPointer = null;
    this.reloadRequested = false;
    this.switchRequested = false;
    this.scopeRequested = false;
    this.weaponSlotRequested = null;
    if (this.moveKnob) {
      this.moveKnob.style.transform = "translate(-50%, -50%)";
    }
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("contextmenu", this.onContextMenu);
    this.clear();
  }
}
