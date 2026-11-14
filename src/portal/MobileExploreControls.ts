import { computeJoystickInput, type ExploreMoveInput } from './exploreMath';

export interface MobileExploreControlsOptions {
  onToggleExplore: () => void | Promise<void>;
  onLookDrag: (deltaX: number, deltaY: number) => void;
  canLookDrag?: (event: PointerEvent) => boolean;
  onTogglePowers?: () => boolean;
  onShoot?: () => void;
  onGrab?: () => void;
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
  private readonly lookJoystickEl: HTMLDivElement;
  private readonly lookKnobEl: HTMLDivElement;
  private readonly elevContainer: HTMLDivElement;
  private readonly upButton: HTMLButtonElement;
  private readonly downButton: HTMLButtonElement;
  private readonly powersButton: HTMLButtonElement;
  private readonly powersActionBar: HTMLDivElement;
  private readonly shootButton: HTMLButtonElement;
  private readonly grabButton: HTMLButtonElement;

  private readonly onToggleExplore: () => void | Promise<void>;
  private readonly onLookDrag: (deltaX: number, deltaY: number) => void;
  private readonly canLookDrag?: (event: PointerEvent) => boolean;
  private readonly onTogglePowers?: () => boolean;
  private readonly onShoot?: () => void;
  private readonly onGrab?: () => void;

  private exploreActive = false;
  private powersActive = false;
  private xrSessionActive = false;

  private joystickPointerId: number | null = null;
  private moveX = 0;
  private moveZ = 0;

  private lookJoystickPointerId: number | null = null;
  private lookX = 0;
  private lookY = 0;

  private readonly upPointers = new Set<number>();
  private readonly downPointers = new Set<number>();

  private lookPointerId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;

  constructor(options: MobileExploreControlsOptions) {
    this.onToggleExplore = options.onToggleExplore;
    this.onLookDrag = options.onLookDrag;
    this.canLookDrag = options.canLookDrag;
    this.onTogglePowers = options.onTogglePowers;
    this.onShoot = options.onShoot;
    this.onGrab = options.onGrab;

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

    this.powersButton = document.createElement('button');
    this.powersButton.id = 'toggle-powers-btn';
    this.powersButton.className = 'explore-mode-btn powers-toggle-btn';
    this.powersButton.type = 'button';
    this.powersButton.setAttribute('aria-pressed', 'false');
    this.powersButton.textContent = '🖐️ Poderes';
    this.powersButton.addEventListener('click', this.handlePowersClick);

    this.modeBar.append(this.powersButton, this.toggleButton);
    document.body.appendChild(this.modeBar);

    // 2. Mobile HUD (Dual Joystick + Subir/Descer + Poderes)
    this.hudRoot = document.createElement('div');
    this.hudRoot.id = 'mobile-explore-hud';
    this.hudRoot.hidden = false;

    // Bottom-left virtual analog joystick for movement (accessible in both dimensions)
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

    // Bottom-right virtual analog joystick for camera look (accessible in both dimensions)
    this.lookJoystickEl = document.createElement('div');
    this.lookJoystickEl.id = 'look-joystick';
    this.lookJoystickEl.setAttribute('role', 'application');
    this.lookJoystickEl.setAttribute('aria-label', 'Joystick de câmera e olhar');

    const lookRingEl = document.createElement('div');
    lookRingEl.className = 'joystick-ring look-ring';

    const lookDirHintEl = document.createElement('div');
    lookDirHintEl.className = 'joystick-crosshair look-crosshair';
    lookRingEl.appendChild(lookDirHintEl);

    this.lookKnobEl = document.createElement('div');
    this.lookKnobEl.className = 'joystick-knob look-knob';
    lookRingEl.appendChild(this.lookKnobEl);

    this.lookJoystickEl.appendChild(lookRingEl);
    this.hudRoot.appendChild(this.lookJoystickEl);

    // Bottom-right Subir / Descer elevation buttons (shown only in explore mode, above look joystick)
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

    // Powers Action Buttons (⚡ Disparar, 🧲 Pegar / 🚀 Lançar)
    this.powersActionBar = document.createElement('div');
    this.powersActionBar.id = 'powers-action-bar';
    this.powersActionBar.hidden = true;

    this.shootButton = document.createElement('button');
    this.shootButton.id = 'btn-power-shoot';
    this.shootButton.className = 'power-action-btn power-shoot-btn';
    this.shootButton.type = 'button';
    this.shootButton.setAttribute('aria-label', 'Disparar Poder');
    this.shootButton.innerHTML =
      '<span class="power-icon" aria-hidden="true">⚡</span><span class="power-label">Disparar</span>';
    this.shootButton.addEventListener('pointerdown', this.handleShootClick);

    this.grabButton = document.createElement('button');
    this.grabButton.id = 'btn-power-grab';
    this.grabButton.className = 'power-action-btn power-grab-btn';
    this.grabButton.type = 'button';
    this.grabButton.setAttribute('aria-label', 'Pegar ou Lançar');
    this.grabButton.innerHTML =
      '<span class="power-icon" aria-hidden="true">🧲</span><span class="power-label">Pegar</span>';
    this.grabButton.addEventListener('pointerdown', this.handleGrabClick);

    this.powersActionBar.append(this.grabButton, this.shootButton);
    this.hudRoot.appendChild(this.powersActionBar);

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

    this.lookJoystickEl.addEventListener('pointerdown', this.onLookJoystickPointerDown);
    this.lookJoystickEl.addEventListener('pointermove', this.onLookJoystickPointerMove);
    this.lookJoystickEl.addEventListener('pointerup', this.onLookJoystickPointerEnd);
    this.lookJoystickEl.addEventListener('pointercancel', this.onLookJoystickPointerEnd);
    this.lookJoystickEl.addEventListener('lostpointercapture', this.onLookJoystickPointerEnd);

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

  private handlePowersClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (this.onTogglePowers) {
      const active = this.onTogglePowers();
      this.setPowersActive(active);
    }
  };

  private handleShootClick = (event: PointerEvent): void => {
    event.stopPropagation();
    this.onShoot?.();
  };

  private handleGrabClick = (event: PointerEvent): void => {
    event.stopPropagation();
    this.onGrab?.();
  };

  setPowersActive(active: boolean): void {
    this.powersActive = active;
    this.powersButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    this.powersButton.classList.toggle('is-active', active);
    this.powersActionBar.hidden = !active || this.xrSessionActive;
  }

  setHoldingState(isHolding: boolean, itemName?: string): void {
    this.grabButton.classList.toggle('is-holding', isHolding);
    if (isHolding) {
      this.grabButton.innerHTML =
        '<span class="power-icon" aria-hidden="true">🚀</span><span class="power-label">Lançar</span>';
      this.grabButton.setAttribute('aria-label', `Lançar ${itemName ?? 'Objeto'}`);
    } else {
      this.grabButton.innerHTML =
        '<span class="power-icon" aria-hidden="true">🧲</span><span class="power-label">Pegar</span>';
      this.grabButton.setAttribute('aria-label', 'Pegar Objeto');
    }
  }

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
    this.powersActionBar.hidden = !this.powersActive || active;
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

  getLookInput(): { lookX: number; lookY: number } {
    return {
      lookX: this.lookX,
      lookY: this.lookY,
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

  private onLookJoystickPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (this.lookJoystickPointerId !== null) return;
    this.lookJoystickPointerId = event.pointerId;
    try {
      this.lookJoystickEl.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests
    }
    this.lookJoystickEl.classList.add('is-active');
    this.updateLookJoystickFromPointer(event.clientX, event.clientY);
  };

  private onLookJoystickPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookJoystickPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.updateLookJoystickFromPointer(event.clientX, event.clientY);
  };

  private onLookJoystickPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookJoystickPointerId) return;
    event.stopPropagation();
    this.lookJoystickPointerId = null;
    this.lookX = 0;
    this.lookY = 0;
    this.lookKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    this.lookJoystickEl.classList.remove('is-active');
  };

  private updateLookJoystickFromPointer(clientX: number, clientY: number): void {
    const rect = this.lookJoystickEl.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(24, rect.width * 0.34);

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const input = computeJoystickInput(dx, dy, maxRadius, 0.08);

    this.lookX = input.x;
    this.lookY = input.y;

    const visualX = input.x * maxRadius;
    const visualY = -input.y * maxRadius;
    this.lookKnobEl.style.transform = `translate3d(${visualX.toFixed(1)}px, ${visualY.toFixed(1)}px, 0px)`;
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

    this.lookJoystickPointerId = null;
    this.lookX = 0;
    this.lookY = 0;
    this.lookKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    this.lookJoystickEl.classList.remove('is-active');

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

    this.lookJoystickEl.removeEventListener('pointerdown', this.onLookJoystickPointerDown);
    this.lookJoystickEl.removeEventListener('pointermove', this.onLookJoystickPointerMove);
    this.lookJoystickEl.removeEventListener('pointerup', this.onLookJoystickPointerEnd);
    this.lookJoystickEl.removeEventListener('pointercancel', this.onLookJoystickPointerEnd);
    this.lookJoystickEl.removeEventListener('lostpointercapture', this.onLookJoystickPointerEnd);

    this.upButton.removeEventListener('pointerdown', this.onUpPointerDown);
    this.upButton.removeEventListener('pointerup', this.onUpPointerEnd);
    this.upButton.removeEventListener('pointercancel', this.onUpPointerEnd);
    this.upButton.removeEventListener('lostpointercapture', this.onUpPointerEnd);

    this.downButton.removeEventListener('pointerdown', this.onDownPointerDown);
    this.downButton.removeEventListener('pointerup', this.onDownPointerEnd);
    this.downButton.removeEventListener('pointercancel', this.onDownPointerEnd);
    this.downButton.removeEventListener('lostpointercapture', this.onDownPointerEnd);

    this.toggleButton.removeEventListener('click', this.handleToggleClick);
    this.powersButton.removeEventListener('click', this.handlePowersClick);
    this.shootButton.removeEventListener('pointerdown', this.handleShootClick);
    this.grabButton.removeEventListener('pointerdown', this.handleGrabClick);

    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerEnd);
    window.removeEventListener('pointercancel', this.onWindowPointerEnd);
    window.removeEventListener('blur', this.resetInputs);

    this.modeBar.remove();
    this.hudRoot.remove();
  }
}
