export interface MovementInput {
  x: number;
  z: number;
}

type MoveDirection = 'forward' | 'backward' | 'left' | 'right';

const KEY_DIRECTION: Readonly<Record<string, MoveDirection>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Keys typed into menus and form controls belong to those controls, not to movement. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName);
}

export class InputSystem {
  private readonly pressedKeys = new Set<string>();
  private readonly pressedButtons = new Map<MoveDirection, Set<number>>();
  private lookX = 0;
  private lookY = 0;
  private pointerId: number | undefined;
  private lastPointerX = 0;
  private lastPointerY = 0;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.handleVisibility);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      button.addEventListener('pointerdown', this.handleTouchDown);
      button.addEventListener('pointerup', this.handleTouchUp);
      button.addEventListener('pointercancel', this.handleTouchUp);
      button.addEventListener('lostpointercapture', this.handleTouchUp);
    });
  }

  public getMovement(): MovementInput {
    const has = (direction: MoveDirection): boolean => {
      const keyPressed = [...this.pressedKeys].some((key) => KEY_DIRECTION[key] === direction);
      return keyPressed || (this.pressedButtons.get(direction)?.size ?? 0) > 0;
    };
    const x = Number(has('right')) - Number(has('left'));
    const z = Number(has('backward')) - Number(has('forward'));
    if (x !== 0 && z !== 0) return { x: x / Math.SQRT2, z: z / Math.SQRT2 };
    return { x, z };
  }

  public consumeLookDelta(): { x: number; y: number } {
    const result = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return result;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      button.removeEventListener('pointerdown', this.handleTouchDown);
      button.removeEventListener('pointerup', this.handleTouchUp);
      button.removeEventListener('pointercancel', this.handleTouchUp);
      button.removeEventListener('lostpointercapture', this.handleTouchUp);
    });
    this.clear();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isInteractiveTarget(event.target)) return;
    if (event.code in KEY_DIRECTION) {
      event.preventDefault();
      this.pressedKeys.add(event.code);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.lookX += event.clientX - this.lastPointerX;
    this.lookY += event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.pointerId = undefined;
  };

  private readonly handleTouchDown = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const direction = button.dataset.move as MoveDirection | undefined;
    if (!direction) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    const pointers = this.pressedButtons.get(direction) ?? new Set<number>();
    pointers.add(event.pointerId);
    this.pressedButtons.set(direction, pointers);
  };

  private readonly handleTouchUp = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const direction = button.dataset.move as MoveDirection | undefined;
    if (!direction) return;
    const pointers = this.pressedButtons.get(direction);
    pointers?.delete(event.pointerId);
    if (pointers?.size === 0) this.pressedButtons.delete(direction);
  };

  private readonly handleVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.clear();
  };

  private readonly clear = (): void => {
    this.pressedKeys.clear();
    this.pressedButtons.clear();
    this.pointerId = undefined;
    this.lookX = 0;
    this.lookY = 0;
  };
}
