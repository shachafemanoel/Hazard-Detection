import { modelToCanvasBox } from '../../public/js/utils/coordsMap.js';

test('bbox mapping scales coordinates', () => {
  const box = [10, 20, 30, 40];
  const map = { displayWidth: 200, displayHeight: 200, offsetX: 0, offsetY: 0, dpr: 1 };
  const canvasBox = modelToCanvasBox(box, map, 100);
  expect(canvasBox[0]).toBeCloseTo(20);
  expect(canvasBox[1]).toBeCloseTo(40);
  expect(canvasBox[2]).toBeCloseTo(60);
  expect(canvasBox[3]).toBeCloseTo(80);
});
