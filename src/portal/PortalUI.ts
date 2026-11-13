import * as xb from 'xrblocks';

export interface PortalUIOptions {
  onRecenter: () => void;
  onToggleAudio: () => boolean;
  onToggleExplore: () => boolean;
}

/**
 * World-space spatial control card positioned cleanly beside the portal frame
 * so 100% of the doorway vista remains unobstructed in both WebXR and desktop simulator.
 */
export function createPortalControlCard({
  onRecenter,
  onToggleAudio,
  onToggleExplore,
}: PortalUIOptions): {
  card: xb.UICard;
  setModeLabel: (mode: string) => void;
  setExploreActive: (active: boolean) => void;
} {
  let muted = false;

  const title = new xb.UIText({
    text: 'AETHER GATE',
    style: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });

  const modeBadge = new xb.UIText({
    text: 'Pinch edges to move, corners to resize, side arcs to rotate.',
    style: {
      fontSize: 15,
      lineHeight: 1.3,
      textAlign: 'center',
      opacity: 0.82,
    },
  });

  const exploreButton = new xb.UIButton({
    label: 'Explorar (Sem AR)',
    icon: 'explore',
    ariaLabel: 'Explorar mundo sem AR',
    style: {width: '100%'},
    onClick: () => {
      const active = onToggleExplore();
      exploreButton.label = active ? 'Voltar ao Portal AR' : 'Explorar (Sem AR)';
    },
  });

  const recenterButton = new xb.UIButton({
    label: 'Recenter Portal',
    icon: 'center_focus_strong',
    ariaLabel: 'Recenter portal in front of you',
    style: {width: '100%'},
    onClick: () => {
      onRecenter();
    },
  });

  const audioButton = new xb.UIButton({
    label: 'Space Audio: On',
    icon: 'volume_up',
    ariaLabel: 'Toggle ambient space audio',
    style: {width: '100%'},
    onClick: () => {
      muted = onToggleAudio();
      audioButton.label = muted ? 'Space Audio: Off' : 'Space Audio: On';
      audioButton.icon = muted ? 'volume_off' : 'volume_up';
    },
  });

  const card = new xb.UICard({
    size: {width: 0.42, height: 'auto'},
    manipulation: true,
    edge: true,
    style: {
      flexDirection: 'column',
      gap: 12,
      padding: 16,
      borderRadius: 20,
    },
    children: [
      new xb.UIExitButton(),
      title,
      modeBadge,
      exploreButton,
      recenterButton,
      audioButton,
    ],
  });
  card.name = 'Aether Gate Control Card';
  card.position.set(1.04, 1.38, -1.55);
  card.rotation.y = -0.24;

  return {
    card,
    setModeLabel: (modeText: string) => {
      modeBadge.text = modeText;
    },
    setExploreActive: (active: boolean) => {
      exploreButton.label = active ? 'Voltar ao Portal AR' : 'Explorar (Sem AR)';
    },
  };
}
