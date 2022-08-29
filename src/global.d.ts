// fixes image import type error for caustics.png

declare module "*.png" {
  const value: any;
  export = value;
}
