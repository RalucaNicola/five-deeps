import Extent from "@arcgis/core/geometry/Extent";

export function computeHillshade(sample: SanmplingFunction, settings: HillshadeSettings): Uint8ClampedArray {
  const context = hillshadeSettingsToContext(settings);

  const colorOutput = settings.colorOutput ?? false;
  const ret = new Uint8ClampedArray(settings.width * settings.height * (colorOutput ? 4 : 1));
  let ptr = 0;

  const slopeAndAspect: SlopeAndAspect = { slope: 0, aspect: 0 };
  const calculateHillshade = context.multi ? multiHillshadeFromSlopeAndAspect : hillshadeFromSlopeAndAspect;
  const calculateStddev = context.stretchStddev !== 0;
  const values = calculateStddev ? new Float64Array(settings.width * settings.height) : null;

  let average = 0;

  for (let y = 0; y < settings.height; y++) {
    for (let x = 0; x < settings.width; x++) {
      calculateSlopeAndAspect(slopeAndAspect, sample, x, y, context);

      const value = calculateHillshade(slopeAndAspect, context);

      if (values) {
        values[ptr++] = value;
        average += value;
      } else {
        const valueUint = 255 * value;

        ret[ptr++] = valueUint;

        if (colorOutput) {
          ret[ptr++] = valueUint;
          ret[ptr++] = valueUint;
          ret[ptr++] = 255;
        }
      }
    }
  }

  if (values) {
    applyStddevStretch(ret, values, average / values.length, context);
  }

  return ret;
}

export function computeNormals(sample: SanmplingFunction, settings: NormalSettings): Uint8ClampedArray {
  const context = normalSettingsToContext(settings);
  const ret = new Uint8ClampedArray(settings.width * settings.height * 4);
  let ptr = 0;

  for (let y = 0; y < settings.height; y++) {
    for (let x = 0; x < settings.width; x++) {
      const { dx, dy } = calculateDerivatives(tmpDerivatives, sample, x, y, context);
      const l = Math.sqrt(dx * dx + dy * dy + 1);
      const n = [dx / l, dy / l, 1 / l];

      ret[ptr++] = 0.5 * (n[0] + 1) * 255;
      ret[ptr++] = 0.5 * (n[1] + 1) * 255;
      ret[ptr++] = 0.5 * (n[2] + 1) * 255;
      ret[ptr++] = 255;
    }
  }

  return ret;
}

function applyStddevStretch(
  out: Uint8ClampedArray,
  values: Float64Array,
  average: number,
  { stretchStddev, colorOutput }: HillshadeContext
): void {
  let stddev = 0;

  for (let i = 0; i < values.length; i++) {
    const dv = values[i] - average;
    stddev += dv * dv;
  }

  stddev = Math.sqrt(stddev / values.length);

  const amount = stddev * stretchStddev;
  const min = average - amount;
  const max = average + amount;

  let ptr = 0;

  for (let i = 0; i < values.length; i++) {
    const value = Math.min(1, Math.max(0, (values[i] - min) / (max - min))) * 255;

    out[ptr++] = value;

    if (colorOutput) {
      out[ptr++] = value;
      out[ptr++] = value;
      out[ptr++] = 255;
    }
  }
}

function calculateSlopeAndAspect(
  out: SlopeAndAspect,
  sample: (x: number, y: number, dx: number, dy: number) => number,
  px: number,
  py: number,
  context: HillshadeContext
): SlopeAndAspect {
  const { dx, dy } = calculateDerivatives(tmpDerivatives, sample, px, py, context);

  const slope = Math.atan(Math.sqrt(dx * dx + dy * dy) * context.zFactor);
  let aspect: number;

  if (dx !== 0) {
    aspect = Math.atan2(dy, -dx);

    if (aspect < 0) {
      aspect += Math.PI * 2;
    }
  } else if (dy > 0) {
    aspect = Math.PI * 0.5;
  } else if (dy < 0) {
    aspect = Math.PI * 1.5;
  } else {
    aspect = 0;
  }

  out.slope = slope;
  out.aspect = aspect;

  return out;
}

function calculateDerivatives(
  out: Derivatives,
  sample: (x: number, y: number, dx: number, dy: number) => number,
  px: number,
  py: number,
  { dx, dy }: BaseContext
): Derivatives {
  const a = sample(px, py, -1, 1);
  const b = sample(px, py, 0, 1);
  const c = sample(px, py, 1, 1);
  const d = sample(px, py, -1, 0);
  const f = sample(px, py, 1, 0);
  const g = sample(px, py, -1, -1);
  const h = sample(px, py, 0, -1);
  const i = sample(px, py, 1, -1);

  out.dx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * dx);
  out.dy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * dy);

  return out;
}

function hillshadeFromSlopeAndAspect(
  { slope, aspect }: SlopeAndAspect,
  { cosZenith, sinZenith, azimuth }: HillshadeContext
): number {
  const cosSlope = Math.cos(slope);
  const sinSlope = Math.sin(slope);

  return cosZenith * cosSlope + sinZenith * sinSlope * Math.cos(azimuth - aspect);
}

function multiHillshadeFromSlopeAndAspect(
  { slope, aspect }: SlopeAndAspect,
  { cosZenith, sinZenith }: HillshadeContext
): number {
  const cosSlope = Math.cos(slope);
  const sinSlope = Math.sin(slope);

  const a = cosZenith * cosSlope;
  const b = sinZenith * sinSlope;

  return (
    (multiHillshadePass(a, b, aspect, multiHillshadeDirection1) +
      multiHillshadePass(a, b, aspect, multiHillshadeDirection2) +
      multiHillshadePass(a, b, aspect, multiHillshadeDirection3) +
      multiHillshadePass(a, b, aspect, multiHillshadeDirection4)) /
    2
  );
}

function multiHillshadePass(a: number, b: number, aspect: number, azimuth: number): number {
  const s = Math.sin(aspect - azimuth);
  return (a + b * Math.cos(azimuth - aspect)) * s * s;
}

function hillshadeSettingsToContext(settings: HillshadeSettings): HillshadeContext {
  const { width, height, extent } = settings;
  const dx = extent.width / width;
  const dy = extent.height / height;
  const azimuth = normalizeAzimuth(settings.azimuth ?? 315);
  const zenith = toRad(90 - (settings.altitude ?? 45));

  const cosZenith = Math.cos(zenith);
  const sinZenith = Math.sin(zenith);

  const multi = settings.multi ?? false;
  const zFactor = settings.zFactor ?? 1;
  const stretchStddev = settings.stretchStddev ?? 0;
  const colorOutput = settings.colorOutput ?? false;

  return {
    dx,
    dy,
    width,
    height,
    extent,
    azimuth,
    zenith,
    cosZenith,
    sinZenith,
    multi,
    zFactor,
    stretchStddev,
    colorOutput
  };
}

function normalSettingsToContext(settings: NormalSettings): NormalContext {
  const { width, height, extent } = settings;
  const dx = extent.width / width;
  const dy = extent.height / height;

  return {
    dx,
    dy,
    width,
    height,
    extent
  };
}

function toRad(degrees: number): number {
  return (degrees / 180) * Math.PI;
}

function normalizeAzimuth(azimuth: number): number {
  return toRad(360 - azimuth + 90);
}

export interface HillshadeSettings {
  width: number;
  height: number;
  extent: Extent;
  azimuth?: number;
  altitude?: number;
  colorOutput?: boolean;
  multi?: boolean;
  zFactor?: number;
  stretchStddev?: number;
}

export interface NormalSettings {
  width: number;
  height: number;
  extent: Extent;
}

interface BaseContext {
  width: number;
  height: number;
  extent: Extent;
  dx: number;
  dy: number;
}

interface NormalContext extends BaseContext {}

interface HillshadeContext extends BaseContext {
  cosZenith: number;
  sinZenith: number;
  azimuth: number;
  zenith: number;

  zFactor: number;
  stretchStddev: number;
  colorOutput: boolean;

  multi: boolean;
}

interface SlopeAndAspect {
  slope: number;
  aspect: number;
}

interface Derivatives {
  dx: number;
  dy: number;
}

const tmpDerivatives: Derivatives = { dx: 0, dy: 0 };

const multiHillshadeDirection1 = normalizeAzimuth(225);
const multiHillshadeDirection2 = normalizeAzimuth(270);
const multiHillshadeDirection3 = normalizeAzimuth(315);
const multiHillshadeDirection4 = normalizeAzimuth(360);

export type SanmplingFunction = (px: number, py: number, pdx: number, pdy: number) => number;
