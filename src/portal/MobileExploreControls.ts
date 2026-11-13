import {computeJoystickInput, type ExploreMoveInput} from './exploreMath';

export interface MobileExploreControlsOptions {
  onToggleExplore: () => void | Promise<void>;
  onLookDrag: (deltaX: number, deltaY: number) => void;
  canLookDrag?: (event: PointerEvent) => boolean;
}

/**
 * 2D DOM HUD for mobile navigation and "Sem AR" exploration:
 * - Top-right mode toggle ("Explorar (Sem AR)" / "Voltar ao Portal AR")
 * - Bottom-left virtual analog joystick (horizontal forward/back/strafe in room & alien world)
 * - Bottom-right "Subir" / "Descer" hold buttons (+Y / -Y vertical flight in explore mode)
 * - Open-canvas 1-finger touch / primary-pointer drag for camera look
 */
export class MobileExploreControls {
  private readonly modeBar: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly hudRoot: HTMLDivElement;
  private readonly joystickEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;
  private readonly elevContainer: HTMLDivElement;
  private readonly upButton: HTMLButtonElement;
  private readonly downButton: HTMLButtonElement;

  private readonly onToggleExplore: () => void | Promise<void>;
  private readonly onLookDrag: (deltaX: number, deltaY: number) => void;
  private readonly canLookDrag?: (event: PointerEvent) => boolean;

  private exploreActive = false;
  private xrSessionActive = false;

  private joystickPointerId: number | null = null;
  private moveX = 0;
  private moveZ = 0;

  private readonly upPointers = new Set<number>();
  private readonly downPointers = new Set<number>();

  private lookPointerId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;

  constructor(options: MobileExploreControlsOptions) {
    this.onToggleExplore = options.onToggleExplore;
    this.onLookDrag = options.onLookDrag;
    this.canLookDrag = options.canLookDrag;

    // 1. Top-right mode switch bar
    this.modeBar = document.createElement('div');
    this.modeBar.id = 'explore-mode-bar';

    this.toggleButton = document.createElement('button');
    this.toggleButton.id = 'toggle-explore-btn';
    this.toggleButton.className = 'explore-mode-btn';
    this.toggleButton.type = 'button';
    this.toggleButton.setAttribute('aria-pressed', 'false');
    this.toggleButton.textContent = 'Explorar (Sem AR)';
    this.toggleButton.addEventListener('click', this.handleToggleClick);

    this.modeBar.appendChild(this.toggleButton);
    document.body.appendChild(this.modeBar);

    // 2. Mobile HUD (Joystick + Subir/Descer)
    this.hudRoot = document.createElement('div');
    this.hudRoot.id = 'mobile-explore-hud';
    this.hudRoot.hidden = false;

    // Bottom-left virtual analog joystick (always accessible on mobile / non-XR)
    this.joystickEl = document.createElement('div');
    this.joystickEl.id = 'explore-joystick';
    this.joystickEl.setAttribute('role', 'application');
    this.joystickEl.setAttribute('aria-label', 'Joystick de movimento');

    const ringEl = document.createElement('div');
    ringEl.className = 'joystick-ring';

    const dirHintEl = document.createElement('div');
    dirHintEl.className = 'joystick-crosshair';
    ringEl.appendChild(dirHintEl);

    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joystick-knob';
    ringEl.appendChild(this.knobEl);

    this.joystickEl.appendChild(ringEl);
    this.hudRoot.appendChild(this.joystickEl);

    // Bottom-right Subir / Descer elevation buttons (shown only in explore mode)
    this.elevContainer = document.createElement('div');
    this.elevContainer.id = 'explore-elevation';
    this.elevContainer.hidden = true;

    this.upButton = document.createElement('button');
    this.upButton.id = 'btn-subir';
    this.upButton.className = 'elev-btn';
    this.upButton.type = 'button';
    this.upButton.setAttribute('aria-label', 'Subir');
    this.upButton.innerHTML =
      '<span class="elev-arrow" aria-hidden="true">&#9650;</span><span class="elev-label">Subir</span>';

    this.downButton = document.createElement('button');
    this.downButton.id = 'btn-descer';
    this.downButton.className = 'elev-btn';
    this.downButton.type = 'button';
    this.downButton.setAttribute('aria-label', 'Descer');
    this.downButton.innerHTML =
      '<span class="elev-arrow" aria-hidden="true">&#9660;</span><span class="elev-label">Descer</span>';

    this.elevContainer.append(this.upButton, this.downButton);
    this.hudRoot.appendChild(this.elevContainer);
    document.body.appendChild(this.hudRoot);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.joystickEl.addEventListener('pointerdown', this.onJoystickPointerDown);
    this.joystickEl.addEventListener('pointermove', this.onJoystickPointerMove);
    this.joystickEl.addEventListener('pointerup', this.onJoystickPointerEnd);
    this.joystickEl.addEventListener('pointercancel', this.onJoystickPointerEnd);
    this.joystickEl.addEventListener('lostpointercapture', this.onJoystickPointerEnd);

    this.upButton.addEventListener('pointerdown', this.onUpPointerDown);
    this.upButton.addEventListener('pointerup', this.onUpPointerEnd);
    this.upButton.addEventListener('pointercancel', this.onUpPointerEnd);
    this.upButton.addEventListener('lostpointercapture', this.onUpPointerEnd);

    this.downButton.addEventListener('pointerdown', this.onDownPointerDown);
    this.downButton.addEventListener('pointerup', this.onDownPointerEnd);
    this.downButton.addEventListener('pointercancel', this.onDownPointerEnd);
    this.downButton.addEventListener('lostpointercapture', this.onDownPointerEnd);

    window.addEventListener('pointerdown', this.onWindowPointerDown);
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerEnd);
    window.addEventListener('pointercancel', this.onWindowPointerEnd);
    window.addEventListener('blur', this.resetInputs);
  }

  private handleToggleClick = (event: MouseEvent): void => {
    event.stopPropagation();
    void this.onToggleExplore();
  };

  setExploreMode(active: boolean): void {
    this.exploreActive = active;
    this.hudRoot.hidden = this.xrSessionActive;
    this.elevContainer.hidden = !active;
    this.toggleButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    this.toggleButton.textContent = active ? 'Voltar ao Portal AR' : 'Explorar (Sem AR)';
    this.toggleButton.classList.toggle('is-active', active);
    this.resetInputs();
  }

  setXRSessionActive(active: boolean): void {
    this.xrSessionActive = active;
    this.modeBar.hidden = active;
    this.hudRoot.hidden = active;
    if (active) {
      this.setExploreMode(false);
    }
  }

  getMoveInput(): ExploreMoveInput {
    const up = this.upPointers.size > 0 ? 1 : 0;
    const down = this.downPointers.size > 0 ? 1 : 0;
    return {
      moveX: this.moveX,
      moveZ: this.moveZ,
      vertical: up - down,
    };
  }

  private onJoystickPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (this.joystickPointerId !== null) return;
    this.joystickPointerId = event.pointerId;
    try {
      this.joystickEl.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests may not support capture
    }
    this.joystickEl.classList.add('is-active');
    this.updateJoystickFromPointer(event.clientX, event.clientY);
  };

  private onJoystickPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.updateJoystickFromPointer(event.clientX, event.clientY);
  };

  private onJoystickPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) return;
    event.stopPropagation();
    this.joystickPointerId = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.knobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    this.joystickEl.classList.remove('is-active');
  };

  private updateJoystickFromPointer(clientX: number, clientY: number): void {
    const rect = this.joystickEl.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(24, rect.width * 0.34);

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const input = computeJoystickInput(dx, dy, maxRadius, 0.08);

    this.moveX = input.x;
    this.moveZ = input.y;

    const visualX = input.x * maxRadius;
    const visualY = -input.y * maxRadius;
    this.knobEl.style.transform = `translate3d(${visualX.toFixed(1)}px, ${visualY.toFixed(1)}px, 0px)`;
  }

  private onUpPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.upPointers.add(event.pointerId);
    try {
      this.upButton.setPointerCapture(event.pointerId);
    } catch {
      // Ignore synthetic events
    }
    this.upButton.classList.add('is-active');
  };

  private onUpPointerEnd = (event: PointerEvent): void => {
    event.stopPropagation();
    this.upPointers.delete(event.pointerId);
    if (this.upPointers.size === 0) {
      this.upButton.classList.remove('is-active');
    }
  };

  private onDownPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.downPointers.add(event.pointerId);
    try {
      this.downButton.setPointerCapture(event.pointerId);
    } catch {
      // Ignore synthetic events
    }
    this.downButton.classList.add('is-active');
  };

  private onDownPointerEnd = (event: PointerEvent): void => {
    event.stopPropagation();
    this.downPointers.delete(event.pointerId);
    if (this.downPointers.size === 0) {
      this.downButton.classList.remove('is-active');
    }
  };

  private shouldIgnoreLookTarget(event: PointerEvent): boolean {
    const path = event.composedPath();
    for (const node of path) {
      if (!(node instanceof HTMLElement)) continue;
      if (
        node === this.hudRoot ||
        node === this.modeBar ||
        node.id === 'XRButtonWrapper' ||
        node.tagName === 'BUTTON' ||
        node.tagName.startsWith('XRBLOCKS-')
      ) {
        return true;
      }
    }
    return false;
  }

  private onWindowPointerDown = (event: PointerEvent): void => {
    if (this.xrSessionActive) return;
    // Ignore right-click mouse drags (SimulatorUserMode already uses right button)
    if (event.button === 2 || (event.buttons & 2) !== 0) return;
    if (this.shouldIgnoreLookTarget(event)) return;
    if (this.canLookDrag && !this.canLookDrag(event)) return;
    if (this.lookPointerId !== null) return;

    this.lookPointerId = event.pointerId;
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
  };

  private onWindowPointerMove = (event: PointerEvent): void => {
    if (this.xrSessionActive || event.pointerId !== this.lookPointerId) return;
    const dx = event.clientX - this.lastLookX;
    const dy = event.clientY - this.lastLookY;
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
    if (dx !== 0 || dy !== 0) {
      this.onLookDrag(dx, dy);
    }
  };

  private onWindowPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
  };

  private resetInputs = (): void => {
    this.joystickPointerId = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.knobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    this.joystickEl.classList.remove('is-active');

    this.upPointers.clear();
    this.downPointers.clear();
    this.upButton.classList.remove('is-active');
    this.downButton.classList.remove('is-active');
    this.lookPointerId = null;
  };

  dispose(): void {
    this.joystickEl.removeEventListener('pointerdown', this.onJoystickPointerDown);
    this.joystickEl.removeEventListener('pointermove', this.onJoystickPointerMove);
    this.joystickEl.removeEventListener('pointerup', this.onJoystickPointerEnd);
    this.joystickEl.removeEventListener('pointercancel', this.onJoystickPointerEnd);
    this.joystickEl.removeEventListener('lostpointercapture', this.onJoystickPointerEnd);

    this.upButton.removeEventListener('pointerdown', this.onUpPointerDown);
    this.upButton.removeEventListener('pointerup', this.onUpPointerEnd);
    this.upButton.removeEventListener('pointercancel', this.onUpPointerEnd);
    this.upButton.removeEventListener('lostpointercapture', this.onUpPointerEnd);

    this.downButton.removeEventListener('pointerdown', this.onDownPointerDown);
    this.downButton.removeEventListener('pointerup', this.onDownPointerEnd);
    this.downButton.removeEventListener('pointercancel', this.onDownPointerEnd);
    this.downButton.removeEventListener('lostpointercapture', this.onDownPointerEnd);

    this.toggleButton.removeEventListener('click', this.handleToggleClick);

    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerEnd);
    window.removeEventListener('pointercancel', this.onWindowPointerEnd);
    window.removeEventListener('blur', this.resetInputs);

    this.modeBar.remove();
    this.hudRoot.remove();
  }
}
