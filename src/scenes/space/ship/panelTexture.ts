import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { createRandom } from '../random';

export interface PanelTextures {
  readonly color: CanvasTexture;
  readonly roughness: CanvasTexture;
}

interface Panel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Procedural plating: recursive panel subdivision with subtle tone and roughness shifts,
 * fine seams and a few vent grilles. Read by light, not by contrast.
 */
export function createPanelTextures(width = 1024, height = 512): PanelTextures {
  const random = createRandom(0x9a11e7);
  const panels: Panel[] = [];
  const split = (panel: Panel, depth: number): void => {
    const small = panel.width < 46 || panel.height < 30;
    if (depth >= 6 || small || (depth > 2 && random() < 0.22)) {
      panels.push(panel);
      return;
    }
    const vertical = panel.width / panel.height > 1.4 ? true : random() < 0.4;
    const ratio = 0.3 + random() * 0.4;
    if (vertical) {
      const first = Math.round(panel.width * ratio);
      split({ ...panel, width: first }, depth + 1);
      split({ ...panel, x: panel.x + first, width: panel.width - first }, depth + 1);
    } else {
      const first = Math.round(panel.height * ratio);
      split({ ...panel, height: first }, depth + 1);
      split({ ...panel, y: panel.y + first, height: panel.height - first }, depth + 1);
    }
  };
  split({ x: 0, y: 0, width, height }, 0);

  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = width;
  colorCanvas.height = roughCanvas.height = height;
  const color = colorCanvas.getContext('2d');
  const rough = roughCanvas.getContext('2d');
  if (!color || !rough) throw new Error('2D canvas is unavailable for procedural textures.');

  for (const panel of panels) {
    const tone = 150 + Math.round((random() - 0.5) * 22);
    color.fillStyle = `rgb(${tone},${tone},${tone + 2})`;
    color.fillRect(panel.x, panel.y, panel.width, panel.height);
    const roughness = 128 + Math.round((random() - 0.5) * 60);
    rough.fillStyle = `rgb(${roughness},${roughness},${roughness})`;
    rough.fillRect(panel.x, panel.y, panel.width, panel.height);
    if (panel.width > 60 && panel.height > 36 && random() < 0.16) {
      // Vent grille: a short run of fine slots.
      const slots = 4 + Math.floor(random() * 5);
      const slotWidth = Math.min(panel.width * 0.5, 70);
      const startX = panel.x + (panel.width - slotWidth) / 2;
      const startY = panel.y + panel.height * 0.3;
      for (let slot = 0; slot < slots; slot += 1) {
        color.fillStyle = 'rgba(40,42,46,0.55)';
        color.fillRect(startX, startY + slot * 4, slotWidth, 1.5);
        rough.fillStyle = 'rgb(200,200,200)';
        rough.fillRect(startX, startY + slot * 4, slotWidth, 1.5);
      }
    }
  }
  color.strokeStyle = 'rgba(28,30,34,0.6)';
  rough.strokeStyle = 'rgb(215,215,215)';
  color.lineWidth = rough.lineWidth = 1.4;
  for (const panel of panels) {
    color.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1);
    rough.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1);
  }
  // Fine grain so large panels never read as flat CG fills.
  const image = color.getImageData(0, 0, width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const grain = (random() - 0.5) * 7;
    image.data[index] = Math.max(0, Math.min(255, image.data[index]! + grain));
    image.data[index + 1] = Math.max(0, Math.min(255, image.data[index + 1]! + grain));
    image.data[index + 2] = Math.max(0, Math.min(255, image.data[index + 2]! + grain));
  }
  color.putImageData(image, 0, 0);

  const colorTexture = new CanvasTexture(colorCanvas);
  colorTexture.colorSpace = SRGBColorSpace;
  const roughTexture = new CanvasTexture(roughCanvas);
  roughTexture.colorSpace = NoColorSpace;
  for (const texture of [colorTexture, roughTexture]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
  }
  return { color: colorTexture, roughness: roughTexture };
}
